package com.rateguard.metrics;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Records request outcomes for anomaly detection. Metrics are strictly best-effort: any Redis
 * failure is logged and swallowed so metric collection can never affect the rate-limit decision or
 * the request itself. This keeps the AI/anomaly path off the critical path (architectural rule 12).
 */
@Service
public class TrafficMetricsRecorder {

  private static final Logger log = LoggerFactory.getLogger(TrafficMetricsRecorder.class);

  private final TrafficMetricsRepository repository;

  public TrafficMetricsRecorder(TrafficMetricsRepository repository) {
    this.repository = repository;
  }

  /** Fire-and-forget record; never throws, never emits an error. */
  public void record(TrafficMetric metric) {
    repository.record(metric)
        .doOnError(e -> log.debug("traffic metric recording failed for client={} endpoint={}",
            metric.clientId(), metric.endpoint(), e))
        .onErrorComplete()
        .subscribe();
  }
}
