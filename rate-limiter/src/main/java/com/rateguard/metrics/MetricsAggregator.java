package com.rateguard.metrics;

import java.util.List;

import org.springframework.stereotype.Service;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Computes windowed {@link WindowMetrics} for a client by combining the raw per-minute buckets and
 * the unique-endpoint cardinality from the repository. Pure read + arithmetic: it never mutates
 * rate-limit state and never calls an LLM.
 */
@Service
public class MetricsAggregator {

  private final TrafficMetricsRepository repository;

  public MetricsAggregator(TrafficMetricsRepository repository) {
    this.repository = repository;
  }

  /** Aggregated metrics for one client over the last {@code minutes}. */
  public Mono<WindowMetrics> window(String clientId, int minutes) {
    return Mono.zip(
            repository.buckets(clientId, minutes),
            repository.uniqueEndpoints(clientId, minutes))
        .map(t -> WindowMetrics.from(clientId, minutes, t.getT1(), t.getT2()));
  }

  /** Raw per-minute buckets for one client over the last {@code minutes}, oldest first, zero-padded. */
  public Mono<List<MinuteBucket>> buckets(String clientId, int minutes) {
    return repository.buckets(clientId, minutes);
  }

  /** Clients that recorded any traffic within the last {@code withinMinutes}. */
  public Flux<String> activeClients(int withinMinutes) {
    return repository.activeClients(withinMinutes);
  }
}
