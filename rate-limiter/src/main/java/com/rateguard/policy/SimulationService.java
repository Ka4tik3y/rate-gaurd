package com.rateguard.policy;

import org.springframework.stereotype.Service;

import com.rateguard.domain.RateLimitPolicy;
import com.rateguard.metrics.MetricsAggregator;
import com.rateguard.metrics.WindowMetrics;

import reactor.core.publisher.Mono;

/**
 * Dry-run estimator: given a proposed limit, estimates how a client's recent aggregated traffic
 * would have fared under the current vs the proposed limit. Uses a simple token-bucket capacity
 * model (initial capacity + refill over the window); a full historical replay is Phase 5. Strictly
 * read-only (spec §29).
 */
@Service
public class SimulationService {

  private final MetricsAggregator aggregator;
  private final PolicyStore store;

  public SimulationService(MetricsAggregator aggregator, PolicyStore store) {
    this.aggregator = aggregator;
    this.store = store;
  }

  public Mono<SimulationResult> simulate(String clientId, long proposedCapacity, Double proposedRefillRate,
                                         int windowMinutes) {
    return Mono.zip(
            aggregator.window(clientId, windowMinutes),
            store.effectivePolicy(clientId))
        .map(t -> {
          WindowMetrics m = t.getT1();
          RateLimitPolicy current = t.getT2();
          double proposedRefill = proposedRefillRate != null ? proposedRefillRate : current.refillRate();

          long requests = m.requests();
          long currentAllowed = estimateAllowed(requests, current.capacity(), current.refillRate(), windowMinutes);
          long proposedAllowed = estimateAllowed(requests, proposedCapacity, proposedRefill, windowMinutes);

          return new SimulationResult(clientId, windowMinutes, requests,
              current.capacity(), current.refillRate(), proposedCapacity, proposedRefill,
              currentAllowed, requests - currentAllowed,
              proposedAllowed, requests - proposedAllowed);
        });
  }

  /** Max requests a token bucket could serve over the window: initial capacity + refill accrued. */
  private static long estimateAllowed(long requests, long capacity, double refillRate, int windowMinutes) {
    long servable = capacity + Math.round(refillRate * windowMinutes * 60.0);
    return Math.min(requests, Math.max(0, servable));
  }
}
