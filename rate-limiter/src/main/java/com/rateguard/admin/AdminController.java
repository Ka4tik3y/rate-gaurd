package com.rateguard.admin;

import java.util.List;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.rateguard.admin.dto.Dtos.AgentStatusView;
import com.rateguard.admin.dto.Dtos.BlockRequest;
import com.rateguard.admin.dto.Dtos.ClassificationRequest;
import com.rateguard.admin.dto.Dtos.GateResponse;
import com.rateguard.admin.dto.Dtos.KillSwitchRequest;
import com.rateguard.admin.dto.Dtos.MetricsView;
import com.rateguard.admin.dto.Dtos.RateLimitView;
import com.rateguard.admin.dto.Dtos.SetLimitRequest;
import com.rateguard.admin.dto.Dtos.SimpleResponse;
import com.rateguard.admin.dto.Dtos.SimulateRequest;
import com.rateguard.audit.AuditEntry;
import com.rateguard.audit.AuditLog;
import com.rateguard.anomaly.AnomalyEventSink;
import com.rateguard.metrics.MetricsAggregator;
import com.rateguard.metrics.MetricsProperties;
import com.rateguard.policy.ActionSource;
import com.rateguard.policy.ActionType;
import com.rateguard.policy.AgentControlService;
import com.rateguard.policy.PolicyGate;
import com.rateguard.policy.PolicyGateResult;
import com.rateguard.policy.PolicyStore;
import com.rateguard.policy.ProposedAction;
import com.rateguard.policy.SimulationResult;
import com.rateguard.policy.SimulationService;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Human admin API (spec §35). Every mutation is routed through the {@link PolicyGate} as an ADMIN
 * action, so it is validated and audited the same way agent actions are, but is not subject to the
 * agent-only ±ratio cap, cooldown, or kill switch. Secured to the ADMIN role (see security config).
 */
@RestController
@RequestMapping("/admin")
public class AdminController {

  private final PolicyStore store;
  private final PolicyGate gate;
  private final SimulationService simulation;
  private final MetricsAggregator aggregator;
  private final MetricsProperties metricsProperties;
  private final AuditLog auditLog;
  private final AgentControlService agentControl;
  private final AnomalyEventSink anomalySink;

  public AdminController(PolicyStore store, PolicyGate gate, SimulationService simulation,
                        MetricsAggregator aggregator, MetricsProperties metricsProperties, AuditLog auditLog,
                        AgentControlService agentControl, AnomalyEventSink anomalySink) {
    this.store = store;
    this.gate = gate;
    this.simulation = simulation;
    this.aggregator = aggregator;
    this.metricsProperties = metricsProperties;
    this.auditLog = auditLog;
    this.agentControl = agentControl;
    this.anomalySink = anomalySink;
  }

  @GetMapping("/rate-limits/{clientId}")
  public Mono<RateLimitView> getRateLimit(@PathVariable String clientId) {
    return RateLimitView.of(clientId, store, gate.agentMaxCapacity());
  }

  @PutMapping("/rate-limits/{clientId}")
  public Mono<GateResponse> setRateLimit(@PathVariable String clientId, @RequestBody SetLimitRequest req) {
    ProposedAction action = new ProposedAction(ActionType.ADJUST_LIMIT, ActionSource.ADMIN, clientId,
        "admin", req.reason() == null ? "admin limit change" : req.reason(), null,
        req.capacity(), req.refillRate(), null, null);
    return gate.evaluate(action).map(AdminController::toResponse);
  }

  @PostMapping("/rate-limits/{clientId}/block")
  public Mono<GateResponse> block(@PathVariable String clientId, @RequestBody BlockRequest req) {
    ProposedAction action = new ProposedAction(ActionType.TEMPORARY_BLOCK, ActionSource.ADMIN, clientId,
        "admin", req.reason() == null ? "admin block" : req.reason(), null,
        null, null, req.seconds(), null);
    return gate.evaluate(action).map(AdminController::toResponse);
  }

  /** Reset the client to the default limit (removes any admin or agent override). */
  @DeleteMapping("/rate-limits/{clientId}")
  public Mono<GateResponse> resetRateLimit(@PathVariable String clientId) {
    return gate.adminResetLimit(clientId, null).map(AdminController::toResponse);
  }

  @PostMapping("/rate-limits/{clientId}/unblock")
  public Mono<GateResponse> unblock(@PathVariable String clientId,
                                    @RequestBody(required = false) BlockRequest req) {
    String reason = req != null ? req.reason() : null;
    return gate.adminUnblock(clientId, reason).map(AdminController::toResponse);
  }

  @PostMapping("/rate-limits/{clientId}/simulate")
  public Mono<SimulationResult> simulate(@PathVariable String clientId, @RequestBody SimulateRequest req) {
    int window = req.windowMinutes() != null ? req.windowMinutes() : 10;
    long capacity = req.capacity() != null ? req.capacity() : 0;
    return simulation.simulate(clientId, capacity, req.refillRate(), window);
  }

  @PutMapping("/rate-limits/{clientId}/classification")
  public Mono<SimpleResponse> setClassification(@PathVariable String clientId,
                                                @RequestBody ClassificationRequest req) {
    return store.setClassification(clientId, req.classification())
        .thenReturn(new SimpleResponse("ok", "classification set to " + req.classification()));
  }

  @GetMapping("/metrics/{clientId}")
  public Flux<MetricsView> metrics(@PathVariable String clientId) {
    List<Integer> windows = metricsProperties.getWindows();
    return Flux.fromIterable(windows)
        .concatMap(w -> aggregator.window(clientId, w))
        .map(m -> new MetricsView(m.clientId(), m.minutes(), m.requests(), m.rejected(), m.errors(),
            m.requestRatePerMinute(), m.rejectedRatio(), m.errorRatio(), m.avgLatencyMillis(),
            m.uniqueEndpoints(), m.burstiness()));
  }

  @GetMapping("/audit/{clientId}")
  public Mono<List<AuditEntry>> audit(@PathVariable String clientId,
                                      @RequestParam(defaultValue = "50") int limit) {
    return auditLog.recent(clientId, limit);
  }

  @PostMapping("/agent/kill-switch")
  public Mono<AgentStatusView> killSwitch(@RequestBody KillSwitchRequest req) {
    boolean enabled = req.enabled() != null && req.enabled();
    return agentControl.setAgentEnabled(enabled).then(status());
  }

  @GetMapping("/agent/status")
  public Mono<AgentStatusView> agentStatus() {
    return status();
  }

  @GetMapping("/agent/pending")
  public Mono<List<String>> pending() {
    return gate.pendingActionIds();
  }

  @PostMapping("/agent/pending/{actionId}/approve")
  public Mono<GateResponse> approve(@PathVariable String actionId) {
    return gate.approvePending(actionId).map(AdminController::toResponse);
  }

  @PostMapping("/agent/pending/{actionId}/reject")
  public Mono<GateResponse> reject(@PathVariable String actionId) {
    return gate.rejectPending(actionId).map(AdminController::toResponse);
  }

  private Mono<AgentStatusView> status() {
    return Mono.zip(agentControl.isAgentEnabled(), gate.pendingActionIds())
        .map(t -> new AgentStatusView(t.getT1(), t.getT2().size(), anomalySink.recent().size()));
  }

  static GateResponse toResponse(PolicyGateResult r) {
    return new GateResponse(r.decision(), r.actionId(), r.reasons(),
        r.appliedCapacity(), r.appliedRefillRate(), r.appliedBlockSeconds());
  }
}
