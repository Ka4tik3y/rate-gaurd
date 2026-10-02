package com.rateguard.anomaly;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.rateguard.metrics.MetricsAggregator;

import reactor.core.publisher.Mono;

/**
 * Periodically sweeps active clients, aggregates their recent traffic into a window, runs the
 * deterministic evaluator, and publishes any anomaly events to the sink. This is the Phase 2
 * "detector wakes only on meaningful thresholds" loop. It runs entirely off the request hot path
 * and never mutates rate-limit state (architectural rules 11 & 12).
 */
@Component
@ConditionalOnProperty(prefix = "anomaly", name = "enabled", havingValue = "true", matchIfMissing = true)
public class AnomalyDetectionScheduler {

  private static final Logger log = LoggerFactory.getLogger(AnomalyDetectionScheduler.class);

  private final MetricsAggregator aggregator;
  private final AnomalyEvaluator evaluator;
  private final AnomalyEventSink sink;
  private final AnomalyProperties properties;

  public AnomalyDetectionScheduler(MetricsAggregator aggregator, AnomalyEvaluator evaluator,
                                   AnomalyEventSink sink, AnomalyProperties properties) {
    this.aggregator = aggregator;
    this.evaluator = evaluator;
    this.sink = sink;
    this.properties = properties;
  }

  @Scheduled(fixedDelayString = "#{${anomaly.interval-seconds:60} * 1000}")
  public void detect() {
    sweep()
        .doOnError(e -> log.warn("anomaly detection sweep failed", e))
        .onErrorComplete()
        .subscribe();
  }

  /** Reactive pipeline for one detection pass; separated out so tests can await it deterministically. */
  public Mono<Long> sweep() {
    int evalWindow = properties.getEvaluationWindowMinutes();
    return aggregator.activeClients(properties.getActiveWindowMinutes())
        .flatMap(client -> aggregator.window(client, evalWindow))
        .flatMapIterable(evaluator::evaluate)
        .doOnNext(sink::publish)
        .count();
  }
}
