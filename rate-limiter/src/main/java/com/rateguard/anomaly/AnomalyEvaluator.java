package com.rateguard.anomaly;

import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;

import com.rateguard.metrics.WindowMetrics;

/**
 * Combines the two deterministic detection strategies for a single {@link WindowMetrics} snapshot:
 * the EWMA/z-score baseline detector (for request-rate spikes) and the stateless threshold rules
 * (429 surge, error surge, burstiness, slow-and-low). This is the single place that turns metrics
 * into anomaly events, with no Redis or scheduling concerns, so it is trivially unit-testable.
 */
@Service
public class AnomalyEvaluator {

  private final DeterministicAnomalyDetector detector;
  private final AnomalyRules rules;

  public AnomalyEvaluator(DeterministicAnomalyDetector detector, AnomalyRules rules) {
    this.detector = detector;
    this.rules = rules;
  }

  public List<AnomalyEvent> evaluate(WindowMetrics metrics) {
    List<AnomalyEvent> events = new ArrayList<>();
    // Request-rate spikes are relative to the client's own learned baseline.
    detector.observe(metrics.clientId(), "request_rate", metrics.requestRatePerMinute(), metrics.window())
        .ifPresent(events::add);
    // Absolute-threshold conditions.
    events.addAll(rules.evaluate(metrics));
    return events;
  }
}
