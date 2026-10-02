package com.rateguard.metrics;

import java.util.List;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Stores and reads aggregated per-client traffic metrics. All state lives in the Redis
 * {@code metric:*} namespace, separate from rate-limit state, and is time-window based.
 */
public interface TrafficMetricsRepository {

  /** Records a single request outcome into the current minute bucket (fire-and-forget friendly). */
  Mono<Void> record(TrafficMetric metric);

  /**
   * Returns the per-minute buckets covering the last {@code minutes} minutes for a client, ordered
   * oldest-to-newest and padded with zero buckets for minutes that saw no traffic.
   */
  Mono<List<MinuteBucket>> buckets(String clientId, int minutes);

  /** Union cardinality of distinct endpoints the client touched over the last {@code minutes}. */
  Mono<Long> uniqueEndpoints(String clientId, int minutes);

  /** Client identifiers that recorded any traffic within the last {@code withinMinutes}. */
  Flux<String> activeClients(int withinMinutes);
}
