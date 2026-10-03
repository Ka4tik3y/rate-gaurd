package com.rateguard.admin;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.rateguard.admin.dto.Dtos.AgentActionRequest;
import com.rateguard.admin.dto.Dtos.EvidenceDto;
import com.rateguard.admin.dto.Dtos.GateResponse;
import com.rateguard.admin.dto.Dtos.MetricsView;
import com.rateguard.admin.dto.Dtos.RateLimitView;
import com.rateguard.admin.dto.Dtos.SimulateRequest;
import com.rateguard.anomaly.AnomalyEvent;
import com.rateguard.anomaly.AnomalyEventSink;
import com.rateguard.audit.AuditEntry;
import com.rateguard.audit.AuditLog;
import com.rateguard.metrics.MetricsAggregator;
import com.rateguard.metrics.MetricsProperties;
import com.rateguard.policy.ActionEvidence;
import com.rateguard.policy.ActionSource;
import com.rateguard.policy.PolicyGate;
import com.rateguard.policy.PolicyStore;
import com.rateguard.policy.ProposedAction;
import com.rateguard.policy.SimulationResult;
import com.rateguard.policy.SimulationService;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * The agent's entire surface (spec §28). Read endpoints let the agent inspect metrics, the current
 * policy/classification, audit history, and run read-only simulations; the single mutation entry
 * point ({@code POST /agent/actions}) is forced to {@link ActionSource#AGENT} and funnelled through
 * the {@link PolicyGate}. There is no path from here to Redis or the policy store, so the agent can
 * never bypass the gate or mutate state directly (architectural rules 2 & 4). Secured to AGENT.
 */
@RestController
@RequestMapping("/agent")
public class AgentController {

  private final PolicyGate gate;
  private final PolicyStore store;
  private final MetricsAggregator aggregator;
  private final MetricsProperties metricsProperties;
  private final SimulationService simulation;
  private final AuditLog auditLog;
  private final AnomalyEventSink anomalySink;

  public AgentController(PolicyGate gate, PolicyStore store, MetricsAggregator aggregator,
                        MetricsProperties metricsProperties, SimulationService simulation, AuditLog auditLog,
                        AnomalyEventSink anomalySink) {
    this.gate = gate;
    this.store = store;
    this.aggregator = aggregator;
    this.metricsProperties = metricsProperties;
    this.simulation = simulation;
    this.auditLog = auditLog;
    this.anomalySink = anomalySink;
  }

  /**
   * Recent anomaly events from the deterministic detector, newest first. The agent polls this to
   * investigate autonomously — a pull model, so the rate limiter never calls (or depends on) the AI.
   */
  @GetMapping("/anomalies")
  public List<AnomalyEvent> anomalies() {
    return anomalySink.recent();
  }

  @PostMapping("/actions")
  public Mono<GateResponse> propose(@RequestBody AgentActionRequest req) {
    ProposedAction action = new ProposedAction(
        req.actionType(), ActionSource.AGENT, req.clientId(), req.trigger(), req.reason(),
        toEvidence(req.evidence()), req.newCapacity(), req.newRefillRate(),
        req.blockSeconds(), req.alertMessage());
    return gate.evaluate(action).map(AdminController::toResponse);
  }

  @GetMapping("/metrics/{clientId}")
  public Flux<MetricsView> metrics(@PathVariable String clientId) {
    return Flux.fromIterable(metricsProperties.getWindows())
        .concatMap(w -> aggregator.window(clientId, w))
        .map(m -> new MetricsView(m.clientId(), m.minutes(), m.requests(), m.rejected(), m.errors(),
            m.requestRatePerMinute(), m.rejectedRatio(), m.errorRatio(), m.avgLatencyMillis(),
            m.uniqueEndpoints(), m.burstiness()));
  }

  @GetMapping("/policy/{clientId}")
  public Mono<RateLimitView> policy(@PathVariable String clientId) {
    return Mono.zip(
            store.effectivePolicy(clientId),
            store.isBlocked(clientId),
            store.blockTtlSeconds(clientId),
            store.classification(clientId))
        .map(t -> new RateLimitView(clientId, t.getT1().name(), t.getT1().capacity(),
            t.getT1().refillRate(), t.getT2(), t.getT3(), t.getT4()));
  }

  @GetMapping("/audit/{clientId}")
  public Mono<List<AuditEntry>> audit(@PathVariable String clientId,
                                      @RequestParam(defaultValue = "20") int limit) {
    return auditLog.recent(clientId, limit);
  }

  @PostMapping("/simulate/{clientId}")
  public Mono<SimulationResult> simulate(@PathVariable String clientId, @RequestBody SimulateRequest req) {
    int window = req.windowMinutes() != null ? req.windowMinutes() : 10;
    long capacity = req.capacity() != null ? req.capacity() : 0;
    return simulation.simulate(clientId, capacity, req.refillRate(), window);
  }

  private static ActionEvidence toEvidence(EvidenceDto e) {
    if (e == null) {
      return null;
    }
    return new ActionEvidence(e.metric(),
        e.currentValue() != null ? e.currentValue() : 0,
        e.baseline() != null ? e.baseline() : 0,
        e.deviation() != null ? e.deviation() : 0,
        e.severity(), e.window());
  }
}
