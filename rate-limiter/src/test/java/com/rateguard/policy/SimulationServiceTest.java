package com.rateguard.policy;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.rateguard.metrics.MetricsAggregator;
import com.rateguard.metrics.MinuteBucket;
import com.rateguard.metrics.TrafficMetric;
import com.rateguard.metrics.TrafficMetricsRepository;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/** Unit tests for the observed-anchored dry-run simulation (no Redis, no Spring). */
class SimulationServiceTest {

  /** Repository that returns fixed per-minute buckets, padded with empty minutes like the real one. */
  private static final class FixedBuckets implements TrafficMetricsRepository {
    private final List<MinuteBucket> buckets;

    FixedBuckets(MinuteBucket... buckets) {
      this.buckets = List.of(buckets);
    }

    @Override
    public Mono<Void> record(TrafficMetric metric) {
      return Mono.empty();
    }

    @Override
    public Mono<List<MinuteBucket>> buckets(String clientId, int minutes) {
      List<MinuteBucket> padded = new ArrayList<>();
      for (int i = buckets.size(); i < minutes; i++) {
        padded.add(MinuteBucket.empty(i));
      }
      padded.addAll(buckets);
      return Mono.just(padded);
    }

    @Override
    public Mono<Long> uniqueEndpoints(String clientId, int minutes) {
      return Mono.just(1L);
    }

    @Override
    public Flux<String> activeClients(int withinMinutes) {
      return Flux.empty();
    }
  }

  private static MinuteBucket minute(long requests, long rejected) {
    return new MinuteBucket(0, requests, rejected, 0, 0);
  }

  private static SimulationResult run(TrafficMetricsRepository repo, long proposedCapacity, Double proposedRefill) {
    SimulationService service = new SimulationService(new MetricsAggregator(repo), new FakePolicyStore(100, 10));
    return service.simulate("c1", proposedCapacity, proposedRefill, 10).block();
  }

  @Test
  void currentSideReportsTheRealRejectionsNotAnEstimate() {
    // The burst from the demo: 300 requests in one minute, 181 really rejected. The old window-total
    // estimate said 0 rejected because 300 < 100 + 10×600.
    SimulationResult r = run(new FixedBuckets(minute(300, 181)), 100, 10.0);

    assertThat(r.observedRequests()).isEqualTo(300);
    assertThat(r.currentEstimatedRejected()).isEqualTo(181);
    assertThat(r.currentEstimatedAllowed()).isEqualTo(119);
    // Same limit proposed → no change.
    assertThat(r.simulatedRejected()).isEqualTo(181);
  }

  @Test
  void higherCapacityRecoversRejectionsInSaturatedMinutes() {
    SimulationResult r = run(new FixedBuckets(minute(300, 181)), 150, 10.0);

    assertThat(r.currentEstimatedRejected()).isEqualTo(181);
    assertThat(r.simulatedRejected()).isEqualTo(131); // +50 tokens of headroom
    assertThat(r.simulatedAllowed()).isEqualTo(169);
  }

  @Test
  void refillIncreaseCountsSixtySecondsOfExtraTokensPerMinute() {
    // +5 tokens/s over a minute = +300 headroom, more than enough to absorb every rejection.
    SimulationResult r = run(new FixedBuckets(minute(300, 181)), 100, 15.0);

    assertThat(r.simulatedRejected()).isZero();
    assertThat(r.simulatedAllowed()).isEqualTo(300);
  }

  @Test
  void lowerCapacityTurnsAllowedRequestsIntoRejections() {
    SimulationResult r = run(new FixedBuckets(minute(300, 181)), 60, 10.0);

    assertThat(r.simulatedRejected()).isEqualTo(221); // 40 fewer tokens
  }

  @Test
  void quietMinutesAreOnlyCappedByTheProposedPerMinuteCeiling() {
    // 200 requests, none rejected. Lowering to capacity 50 / refill 1 caps a minute at 50 + 60 = 110.
    SimulationResult lower = run(new FixedBuckets(minute(200, 0)), 50, 1.0);
    assertThat(lower.currentEstimatedRejected()).isZero();
    assertThat(lower.simulatedRejected()).isEqualTo(90);

    // Raising the limit cannot create rejections in a minute that had none.
    SimulationResult higher = run(new FixedBuckets(minute(200, 0)), 500, 20.0);
    assertThat(higher.simulatedRejected()).isZero();
  }

  @Test
  void minutesAreSimulatedIndependentlyAndSummed() {
    SimulationResult r = run(new FixedBuckets(minute(300, 181), minute(50, 0), minute(400, 250)), 150, 10.0);

    assertThat(r.observedRequests()).isEqualTo(750);
    assertThat(r.currentEstimatedRejected()).isEqualTo(431);
    assertThat(r.simulatedRejected()).isEqualTo(131 + 0 + 200);
  }

  @Test
  void noTrafficMeansNothingToSimulate() {
    SimulationResult r = run(new FixedBuckets(), 150, 10.0);

    assertThat(r.observedRequests()).isZero();
    assertThat(r.currentEstimatedRejected()).isZero();
    assertThat(r.simulatedRejected()).isZero();
  }

  @Test
  void usesTheClientsRealPolicyAsTheBaseline() {
    FakePolicyStore store = new FakePolicyStore(100, 10);
    store.overrides.put("c1", new com.rateguard.domain.RateLimitPolicy("override", 200, 10, true));
    SimulationService service = new SimulationService(
        new MetricsAggregator(new FixedBuckets(minute(300, 50))), store);

    SimulationResult r = service.simulate("c1", 250, null, 10).block();

    assertThat(r.currentCapacity()).isEqualTo(200);
    assertThat(r.proposedRefillRate()).isEqualTo(10.0);
    assertThat(r.simulatedRejected()).isZero(); // +50 headroom absorbs all 50 rejections
  }
}
