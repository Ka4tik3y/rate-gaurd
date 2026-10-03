package com.rateguard.policy;

import java.util.List;

import org.springframework.stereotype.Service;

import com.rateguard.domain.RateLimitPolicy;
import com.rateguard.metrics.MetricsAggregator;
import com.rateguard.metrics.MinuteBucket;

import reactor.core.publisher.Mono;

/**
 * Dry-run estimator: given a proposed limit, estimates how a client's recent traffic would have fared
 * under it. Strictly read-only (spec §29).
 *
 * <p>The "current" side is not an estimate: it is the real allowed / rejected counts the gateway
 * recorded in the per-minute metric buckets, so bursts that actually produced 429s show up. The
 * "simulated" side starts from those real counts and, minute by minute, applies only the
 * <em>difference</em> the proposed limit would make:
 * <ul>
 *   <li>a minute that saw rejections was saturated, so the proposed limit moves its allowed count by
 *       {@code Δcapacity + Δrefill × 60} (more headroom recovers rejected requests, less headroom
 *       turns allowed requests into rejections);</li>
 *   <li>a minute with no rejections had spare headroom, so it is only capped by the most the
 *       proposed bucket could serve in a minute ({@code capacity + refill × 60}).</li>
 * </ul>
 * Resolution is one minute, so spacing inside a minute is not modelled — but every estimate is
 * anchored to what really happened.
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
            aggregator.buckets(clientId, windowMinutes),
            store.effectivePolicy(clientId))
        .map(t -> {
          List<MinuteBucket> buckets = t.getT1();
          RateLimitPolicy current = t.getT2();
          double proposedRefill = proposedRefillRate != null ? proposedRefillRate : current.refillRate();

          double headroomDelta = (proposedCapacity - current.capacity())
              + (proposedRefill - current.refillRate()) * 60.0;
          long proposedPerMinute = proposedCapacity + Math.round(proposedRefill * 60.0);

          long requests = 0;
          long observedAllowed = 0;
          long simulatedAllowed = 0;
          for (MinuteBucket b : buckets) {
            long req = Math.max(0, b.requests());
            long rejected = Math.min(req, Math.max(0, b.rejected()));
            long allowed = req - rejected;
            requests += req;
            observedAllowed += allowed;
            simulatedAllowed += simulateMinute(req, rejected, allowed, headroomDelta, proposedPerMinute);
          }

          return new SimulationResult(clientId, windowMinutes, requests,
              current.capacity(), current.refillRate(), proposedCapacity, proposedRefill,
              observedAllowed, requests - observedAllowed,
              simulatedAllowed, requests - simulatedAllowed);
        });
  }

  /** Allowed count for one minute under the proposed limit, anchored to that minute's real outcome. */
  static long simulateMinute(long requests, long rejected, long allowed, double headroomDelta,
                             long proposedPerMinute) {
    if (requests == 0) {
      return 0;
    }
    long result = rejected > 0
        ? Math.round(allowed + headroomDelta)          // saturated minute: shift by the headroom change
        : Math.min(requests, proposedPerMinute);       // unsaturated: only the proposed ceiling can bite
    return Math.min(requests, Math.max(0, result));
  }
}
