package com.rateguard.policy;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rateguard.audit.AuditEntry;
import com.rateguard.audit.AuditLog;
import com.rateguard.domain.RateLimitPolicy;

import reactor.core.publisher.Mono;

/**
 * The single validated path for every mutation (architectural rule 4). It enforces the guardrails of
 * spec §21–24 — closed action set, kill switch, evidence threshold, absolute and ±ratio bounds,
 * cooldown, action-rate cap, and high-value human approval — then (and only then) applies the change
 * through the {@link PolicyStore} and writes an {@link AuditEntry}. Every attempt is audited, whether
 * approved, rejected, or held for approval.
 */
@Service
public class PolicyGate {

  private static final Logger log = LoggerFactory.getLogger(PolicyGate.class);
  private static final String SUCCESS = "SUCCESS";
  private static final String NOT_EXECUTED = "NOT_EXECUTED";
  private static final String FAILED = "FAILED";

  private final PolicyStore store;
  private final AgentControlService agentControl;
  private final AuditLog auditLog;
  private final PolicyGateProperties props;
  private final ObjectMapper mapper;

  public PolicyGate(PolicyStore store, AgentControlService agentControl, AuditLog auditLog,
                    PolicyGateProperties props, ObjectMapper mapper) {
    this.store = store;
    this.agentControl = agentControl;
    this.auditLog = auditLog;
    this.props = props;
    this.mapper = mapper;
  }

  /** The highest capacity the agent may set on its own (see {@link PolicyGateProperties#getAgentMaxCapacity()}). */
  public long agentMaxCapacity() {
    return props.getAgentMaxCapacity();
  }

  public Mono<PolicyGateResult> evaluate(ProposedAction action) {
    String id = UUID.randomUUID().toString();

    List<String> structural = validateStructure(action);
    if (!structural.isEmpty()) {
      return reject(id, action, structural, null);
    }

    Mono<Boolean> enabledCheck = action.source() == ActionSource.AGENT
        ? agentControl.isAgentEnabled()
        : Mono.just(true);

    return enabledCheck.flatMap(enabled -> {
      // Kill switch blocks agent-originated mutations; alerts remain informative.
      if (!enabled && action.source() == ActionSource.AGENT && action.actionType() != ActionType.ALERT) {
        return reject(id, action, List.of("kill switch engaged: agent actions are disabled"), null);
      }
      if (action.actionType() == ActionType.ALERT) {
        return approveAlert(id, action);
      }
      if (action.source() == ActionSource.AGENT && !evidenceSufficient(action)) {
        return reject(id, action,
            List.of("insufficient evidence: deviation below " + props.getMinEvidenceDeviation()), null);
      }
      return Mono.zip(
              store.effectivePolicy(action.clientId()),
              store.classification(action.clientId()),
              store.inCooldown(action.clientId()),
              store.actionsInWindow(action.clientId()))
          .flatMap(ctx -> evaluateMutation(id, action,
              ctx.getT1(), ctx.getT2(), ctx.getT3(), ctx.getT4()));
    });
  }

  private Mono<PolicyGateResult> evaluateMutation(String id, ProposedAction action,
                                                  RateLimitPolicy current, ClientClassification classification,
                                                  boolean inCooldown, long actionsInWindow) {
    boolean agent = action.source() == ActionSource.AGENT;
    if (agent && inCooldown) {
      return reject(id, action, List.of("client in cooldown: wait " + props.getCooldownSeconds() + "s between actions"), current);
    }
    // The hourly cap stops the agent flip-flopping a client's limit. It does not apply to blocks: a
    // block is the protective action, expires on its own and is still bounded by the cooldown and
    // the max duration — a client that keeps attacking must stay blockable.
    if (agent && action.actionType() == ActionType.ADJUST_LIMIT
        && actionsInWindow >= props.getMaxActionsPerWindow()) {
      return reject(id, action,
          List.of("action-rate exceeded: max " + props.getMaxActionsPerWindow() + " per "
              + props.getActionWindowSeconds() + "s"), current);
    }

    return switch (action.actionType()) {
      case ADJUST_LIMIT -> evaluateAdjust(id, action, current, agent);
      case TEMPORARY_BLOCK -> evaluateBlock(id, action, current, classification, agent);
      default -> reject(id, action, List.of("unsupported action"), current);
    };
  }

  private Mono<PolicyGateResult> evaluateAdjust(String id, ProposedAction action, RateLimitPolicy current, boolean agent) {
    long newCapacity = action.newCapacity();
    double newRefill = action.newRefillRate() != null ? action.newRefillRate() : current.refillRate();

    if (newRefill <= 0) {
      return reject(id, action, List.of("refill rate must be positive"), current);
    }
    if (newCapacity < props.getMinCapacity() || newCapacity > props.getMaxCapacity()) {
      return reject(id, action,
          List.of("capacity " + newCapacity + " outside absolute bounds ["
              + props.getMinCapacity() + ", " + props.getMaxCapacity() + "]"), current);
    }
    if (!agent) {
      // Admin limits are deliberate and permanent.
      return applyLimit(id, action, current, newCapacity, newRefill, store.setLimit(action.clientId(), newCapacity, newRefill),
          List.of("within bounds"));
    }

    long lower = (long) Math.floor(current.capacity() * (1 - props.getMaxChangeRatio()));
    long upper = (long) Math.ceil(current.capacity() * (1 + props.getMaxChangeRatio()));
    if (newCapacity < lower || newCapacity > upper) {
      return reject(id, action,
          List.of("change from " + current.capacity() + " to " + newCapacity
              + " exceeds max automatic change of ±" + (int) (props.getMaxChangeRatio() * 100)
              + "% (allowed [" + lower + ", " + upper + "])"), current);
    }
    boolean increase = newCapacity > current.capacity();
    if (increase && newCapacity > props.getAgentMaxCapacity()) {
      return reject(id, action,
          List.of("capacity " + newCapacity + " above the agent ceiling of " + props.getAgentMaxCapacity()
              + "; only an admin can raise it further"), current);
    }
    Mono<Boolean> recentlyBlocked = increase ? store.recentlyBlocked(action.clientId()) : Mono.just(false);
    return recentlyBlocked.flatMap(blocked -> {
      if (blocked) {
        return reject(id, action,
            List.of("client was blocked in the last " + props.getBlockMemorySeconds() / 60
                + " min; the agent will not raise its limit"), current);
      }
      // Agent limits are temporary: they lapse back to the default instead of compounding forever.
      long ttl = props.getAgentOverrideTtlSeconds();
      return applyLimit(id, action, current, newCapacity, newRefill,
          store.setLimit(action.clientId(), newCapacity, newRefill, ttl),
          List.of("within bounds", "expires in " + ttl / 60 + " min"));
    });
  }

  private Mono<PolicyGateResult> applyLimit(String id, ProposedAction action, RateLimitPolicy current,
                                            long newCapacity, double newRefill, Mono<Void> write,
                                            List<String> reasons) {
    return write
        .then(store.recordAction(action.clientId(), props.getCooldownSeconds(), props.getActionWindowSeconds()))
        .then(audit(entry(id, action, GateDecision.APPROVED, reasons, current,
            newCapacity, newRefill, null, SUCCESS)))
        .thenReturn(new PolicyGateResult(GateDecision.APPROVED, id, List.of("applied"),
            newCapacity, newRefill, null))
        .onErrorResume(e -> executionFailed(id, action, current, e));
  }

  private Mono<PolicyGateResult> evaluateBlock(String id, ProposedAction action, RateLimitPolicy current,
                                               ClientClassification classification, boolean agent) {
    long seconds = action.blockSeconds();
    if (seconds <= 0 || seconds > props.getMaxBlockSeconds()) {
      return reject(id, action,
          List.of("block duration " + seconds + "s outside (0, " + props.getMaxBlockSeconds() + "]"), current);
    }
    // High-value clients: agent may propose a block but a human must approve it (spec §22).
    if (agent && classification == ClientClassification.HIGH_VALUE) {
      return holdForApproval(id, action, current);
    }

    return store.block(action.clientId(), seconds)
        .then(store.rememberBlock(action.clientId(), props.getBlockMemorySeconds()))
        .then(store.recordAction(action.clientId(), props.getCooldownSeconds(), props.getActionWindowSeconds()))
        .then(audit(entry(id, action, GateDecision.APPROVED, List.of("block applied"), current,
            null, null, seconds, SUCCESS)))
        .thenReturn(new PolicyGateResult(GateDecision.APPROVED, id, List.of("applied"), null, null, seconds))
        .onErrorResume(e -> executionFailed(id, action, current, e));
  }

  private Mono<PolicyGateResult> holdForApproval(String id, ProposedAction action, RateLimitPolicy current) {
    String reason = "high-value client: TEMPORARY_BLOCK requires human approval";
    Mono<Void> save;
    try {
      save = store.savePending(id, mapper.writeValueAsString(action));
    } catch (Exception e) {
      return reject(id, action, List.of("failed to queue approval: " + e.getMessage()), current);
    }
    return save
        .then(audit(entry(id, action, GateDecision.PENDING_APPROVAL, List.of(reason), current,
            null, null, action.blockSeconds(), NOT_EXECUTED)))
        .thenReturn(PolicyGateResult.pending(id, reason));
  }

  /** Human approves a previously held action; executes it without the high-value gate. */
  public Mono<PolicyGateResult> approvePending(String actionId) {
    return store.loadPending(actionId)
        .switchIfEmpty(Mono.error(new IllegalArgumentException("no pending action " + actionId)))
        .flatMap(json -> {
          ProposedAction action = deserialize(json);
          return store.effectivePolicy(action.clientId()).flatMap(current ->
              store.block(action.clientId(), action.blockSeconds())
                  .then(store.rememberBlock(action.clientId(), props.getBlockMemorySeconds()))
                  .then(store.recordAction(action.clientId(), props.getCooldownSeconds(), props.getActionWindowSeconds()))
                  .then(store.deletePending(actionId))
                  .then(audit(entry(actionId, action, GateDecision.APPROVED,
                      List.of("approved by human operator"), current, null, null, action.blockSeconds(), SUCCESS)))
                  .thenReturn(new PolicyGateResult(GateDecision.APPROVED, actionId,
                      List.of("approved and applied"), null, null, action.blockSeconds())));
        });
  }

  /** Human rejects a previously held action; nothing is applied. */
  public Mono<PolicyGateResult> rejectPending(String actionId) {
    return store.loadPending(actionId)
        .switchIfEmpty(Mono.error(new IllegalArgumentException("no pending action " + actionId)))
        .flatMap(json -> {
          ProposedAction action = deserialize(json);
          return store.deletePending(actionId)
              .then(audit(entry(actionId, action, GateDecision.REJECTED,
                  List.of("rejected by human operator"), null, null, null, action.blockSeconds(), NOT_EXECUTED)))
              .thenReturn(PolicyGateResult.rejected(actionId, "rejected by human operator"));
        });
  }

  public Mono<List<String>> pendingActionIds() {
    return store.pendingActionIds();
  }

  /** Admin-only: lift a temporary block. Routed through the gate so it is audited like any mutation. */
  public Mono<PolicyGateResult> adminUnblock(String clientId, String reason) {
    String id = UUID.randomUUID().toString();
    ProposedAction action = ProposedAction.temporaryBlock(ActionSource.ADMIN, clientId, 0, "admin",
        reason == null || reason.isBlank() ? "manual unblock" : reason, null);
    return store.unblock(clientId)
        .then(audit(entry(id, action, GateDecision.APPROVED, List.of("block lifted"), null,
            null, null, 0L, SUCCESS)))
        .thenReturn(new PolicyGateResult(GateDecision.APPROVED, id, List.of("unblocked"), null, null, 0L));
  }

  /**
   * Admin-only: drop the client's limit override so it goes back to the default policy. Audited as
   * an ADJUST_LIMIT to the default capacity.
   */
  public Mono<PolicyGateResult> adminResetLimit(String clientId, String reason) {
    String id = UUID.randomUUID().toString();
    return store.effectivePolicy(clientId).flatMap(before -> store.clearLimit(clientId)
        .then(store.effectivePolicy(clientId))
        .flatMap(after -> {
          ProposedAction action = ProposedAction.adjustLimit(ActionSource.ADMIN, clientId, after.capacity(),
              after.refillRate(), "admin", reason == null || reason.isBlank() ? "reset to default limit" : reason, null);
          return audit(entry(id, action, GateDecision.APPROVED, List.of("override removed"), before,
              after.capacity(), after.refillRate(), null, SUCCESS))
              .thenReturn(new PolicyGateResult(GateDecision.APPROVED, id, List.of("reset to default"),
                  after.capacity(), after.refillRate(), null));
        }));
  }

  // ---- helpers ----

  private Mono<PolicyGateResult> approveAlert(String id, ProposedAction action) {
    return audit(entry(id, action, GateDecision.APPROVED, List.of("alert recorded"), null,
        null, null, null, SUCCESS))
        .thenReturn(new PolicyGateResult(GateDecision.APPROVED, id, List.of("alert recorded"), null, null, null));
  }

  private Mono<PolicyGateResult> reject(String id, ProposedAction action, List<String> reasons, RateLimitPolicy current) {
    return audit(entry(id, action, GateDecision.REJECTED, reasons, current, null, null, null, NOT_EXECUTED))
        .thenReturn(PolicyGateResult.rejected(id, reasons));
  }

  private Mono<PolicyGateResult> executionFailed(String id, ProposedAction action, RateLimitPolicy current, Throwable e) {
    log.warn("policy gate execution failed for action {} client {}", id, action.clientId(), e);
    return audit(entry(id, action, GateDecision.REJECTED, List.of("execution failed: " + e.getMessage()),
        current, null, null, null, FAILED))
        .thenReturn(PolicyGateResult.rejected(id, "execution failed"));
  }

  private List<String> validateStructure(ProposedAction a) {
    if (a.clientId() == null || a.clientId().isBlank()) return List.of("clientId is required");
    if (a.actionType() == null) return List.of("actionType is required");
    if (a.source() == null) return List.of("source is required");
    if (a.reason() == null || a.reason().isBlank()) return List.of("reason is required");
    return switch (a.actionType()) {
      case ADJUST_LIMIT -> (a.newCapacity() == null || a.newCapacity() <= 0)
          ? List.of("newCapacity must be a positive number") : List.of();
      case TEMPORARY_BLOCK -> (a.blockSeconds() == null || a.blockSeconds() <= 0)
          ? List.of("blockSeconds must be a positive number") : List.of();
      case ALERT -> (a.alertMessage() == null || a.alertMessage().isBlank())
          ? List.of("alertMessage is required") : List.of();
    };
  }

  private boolean evidenceSufficient(ProposedAction a) {
    ActionEvidence e = a.evidence();
    return e != null && e.deviation() >= props.getMinEvidenceDeviation();
  }

  private AuditEntry entry(String id, ProposedAction a, GateDecision decision, List<String> reasons,
                           RateLimitPolicy current, Long appliedCapacity, Double appliedRefill,
                           Long appliedBlockSeconds, String executionResult) {
    Long prevCap = current != null ? current.capacity() : null;
    Double prevRefill = current != null ? current.refillRate() : null;
    return new AuditEntry(id, Instant.now(), a.clientId(), a.source(), a.actionType(), a.trigger(),
        a.reason(), a.evidence(), decision, reasons, prevCap, prevRefill,
        appliedCapacity, appliedRefill, appliedBlockSeconds, executionResult, null, false);
  }

  private Mono<Void> audit(AuditEntry e) {
    return auditLog.record(e);
  }

  private ProposedAction deserialize(String json) {
    try {
      return mapper.readValue(json, ProposedAction.class);
    } catch (Exception e) {
      throw new IllegalStateException("corrupt pending action", e);
    }
  }
}
