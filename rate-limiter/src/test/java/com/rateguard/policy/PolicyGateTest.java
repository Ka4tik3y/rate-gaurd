package com.rateguard.policy;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rateguard.audit.AuditEntry;
import com.rateguard.audit.AuditLog;

import reactor.core.publisher.Mono;

/**
 * Exercises every Policy Gate guardrail (spec §21–24) with in-memory fakes so each rule is covered
 * deterministically and the agent can be shown unable to bypass the gate.
 */
class PolicyGateTest {

  private FakePolicyStore store;
  private AgentControlService agentControl;
  private AuditLog audit;
  private PolicyGate gate;
  private PolicyGateProperties props;

  private static final ActionEvidence STRONG =
      new ActionEvidence("request_rate", 420, 80, 4.2, "HIGH", "5m");

  @BeforeEach
  void setUp() {
    store = new FakePolicyStore(100, 10); // default capacity 100 => agent-allowed [50, 150]
    agentControl = mock(AgentControlService.class);
    when(agentControl.isAgentEnabled()).thenReturn(Mono.just(true));
    audit = mock(AuditLog.class);
    when(audit.record(any(AuditEntry.class))).thenReturn(Mono.empty());
    props = new PolicyGateProperties();
    gate = new PolicyGate(store, agentControl, audit, props, new ObjectMapper());
  }

  private ProposedAction agentAdjust(String client, long capacity) {
    return ProposedAction.adjustLimit(ActionSource.AGENT, client, capacity, 12, "rate_anomaly", "spike", STRONG);
  }

  @Test
  void agentAdjustWithinBoundsIsApprovedAndApplied() {
    PolicyGateResult r = gate.evaluate(agentAdjust("c1", 140)).block();
    assertEquals(GateDecision.APPROVED, r.decision());
    assertEquals(140L, store.overrides.get("c1").capacity());
  }

  @Test
  void agentAdjustExceedingRatioIsRejected() {
    PolicyGateResult r = gate.evaluate(agentAdjust("c1", 1000)).block();
    assertEquals(GateDecision.REJECTED, r.decision());
    assertFalse(store.overrides.containsKey("c1"));
  }

  @Test
  void agentAdjustWithoutEvidenceIsRejected() {
    ProposedAction a = ProposedAction.adjustLimit(ActionSource.AGENT, "c1", 140, 12, "t", "r", null);
    assertEquals(GateDecision.REJECTED, gate.evaluate(a).block().decision());
  }

  @Test
  void agentAdjustWithWeakEvidenceIsRejected() {
    ActionEvidence weak = new ActionEvidence("request_rate", 90, 80, 1.1, "LOW", "5m");
    ProposedAction a = ProposedAction.adjustLimit(ActionSource.AGENT, "c1", 140, 12, "t", "r", weak);
    assertEquals(GateDecision.REJECTED, gate.evaluate(a).block().decision());
  }

  @Test
  void adminAdjustMayExceedAgentRatioButNotAbsoluteBounds() {
    ProposedAction big = new ProposedAction(ActionType.ADJUST_LIMIT, ActionSource.ADMIN, "c1",
        "admin", "scale up", null, 5000L, 50.0, null, null);
    assertEquals(GateDecision.APPROVED, gate.evaluate(big).block().decision());

    ProposedAction tooBig = new ProposedAction(ActionType.ADJUST_LIMIT, ActionSource.ADMIN, "c2",
        "admin", "absurd", null, 10_000_000L, 50.0, null, null);
    assertEquals(GateDecision.REJECTED, gate.evaluate(tooBig).block().decision());
  }

  @Test
  void agentBlockOfNormalClientIsApplied() {
    ProposedAction a = ProposedAction.temporaryBlock(ActionSource.AGENT, "c1", 300, "abuse", "scraper", STRONG);
    assertEquals(GateDecision.APPROVED, gate.evaluate(a).block().decision());
    assertTrue(store.blocked.contains("c1"));
  }

  @Test
  void blockExceedingMaxDurationIsRejected() {
    ProposedAction a = ProposedAction.temporaryBlock(ActionSource.AGENT, "c1", 999_999, "abuse", "x", STRONG);
    assertEquals(GateDecision.REJECTED, gate.evaluate(a).block().decision());
    assertFalse(store.blocked.contains("c1"));
  }

  @Test
  void highValueBlockIsHeldForApprovalNotExecuted() {
    store.classifications.put("vip", ClientClassification.HIGH_VALUE);
    ProposedAction a = ProposedAction.temporaryBlock(ActionSource.AGENT, "vip", 300, "abuse", "x", STRONG);
    PolicyGateResult r = gate.evaluate(a).block();
    assertEquals(GateDecision.PENDING_APPROVAL, r.decision());
    assertFalse(store.blocked.contains("vip"));
    assertTrue(store.pending.containsKey(r.actionId()));
  }

  @Test
  void approvingPendingBlockExecutesIt() {
    store.classifications.put("vip", ClientClassification.HIGH_VALUE);
    PolicyGateResult pending = gate.evaluate(
        ProposedAction.temporaryBlock(ActionSource.AGENT, "vip", 300, "abuse", "x", STRONG)).block();
    PolicyGateResult approved = gate.approvePending(pending.actionId()).block();
    assertEquals(GateDecision.APPROVED, approved.decision());
    assertTrue(store.blocked.contains("vip"));
    assertFalse(store.pending.containsKey(pending.actionId()));
  }

  @Test
  void rejectingPendingBlockDoesNotExecuteIt() {
    store.classifications.put("vip", ClientClassification.HIGH_VALUE);
    PolicyGateResult pending = gate.evaluate(
        ProposedAction.temporaryBlock(ActionSource.AGENT, "vip", 300, "abuse", "x", STRONG)).block();
    PolicyGateResult rejected = gate.rejectPending(pending.actionId()).block();
    assertEquals(GateDecision.REJECTED, rejected.decision());
    assertFalse(store.blocked.contains("vip"));
    assertFalse(store.pending.containsKey(pending.actionId()));
  }

  @Test
  void killSwitchBlocksAgentMutationsButRateLimiterUnaffected() {
    when(agentControl.isAgentEnabled()).thenReturn(Mono.just(false));
    PolicyGateResult r = gate.evaluate(agentAdjust("c1", 140)).block();
    assertEquals(GateDecision.REJECTED, r.decision());
    assertFalse(store.overrides.containsKey("c1"));
  }

  @Test
  void killSwitchStillAllowsAlerts() {
    when(agentControl.isAgentEnabled()).thenReturn(Mono.just(false));
    ProposedAction alert = ProposedAction.alert(ActionSource.AGENT, "c1", "scraper suspected", "t", "r", STRONG);
    assertEquals(GateDecision.APPROVED, gate.evaluate(alert).block().decision());
  }

  @Test
  void cooldownBlocksRepeatAgentAction() {
    store.cooldown.add("c1");
    assertEquals(GateDecision.REJECTED, gate.evaluate(agentAdjust("c1", 140)).block().decision());
  }

  @Test
  void actionRateCapBlocksAgentAction() {
    store.actionCounts.put("c1", props.getMaxActionsPerWindow());
    assertEquals(GateDecision.REJECTED, gate.evaluate(agentAdjust("c1", 140)).block().decision());
  }

  @Test
  void structurallyInvalidActionIsRejected() {
    ProposedAction a = new ProposedAction(ActionType.ADJUST_LIMIT, ActionSource.AGENT, "c1",
        "t", "r", STRONG, null, null, null, null); // missing newCapacity
    assertEquals(GateDecision.REJECTED, gate.evaluate(a).block().decision());
  }

  @Test
  void firstActionArmsCooldownForNextOne() {
    assertEquals(GateDecision.APPROVED, gate.evaluate(agentAdjust("c1", 140)).block().decision());
    // cooldown now armed by recordAction -> a second immediate action is rejected
    assertEquals(GateDecision.REJECTED, gate.evaluate(agentAdjust("c1", 130)).block().decision());
  }
}
