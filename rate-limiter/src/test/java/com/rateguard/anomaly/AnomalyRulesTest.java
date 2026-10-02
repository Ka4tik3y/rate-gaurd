package com.rateguard.anomaly;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.rateguard.metrics.WindowMetrics;

class AnomalyRulesTest {

  private AnomalyRules rules;

  @BeforeEach
  void setUp() {
    rules = new AnomalyRules(new AnomalyProperties());
  }

  private static WindowMetrics metrics(long requests, long rejected, long errors,
                                       double ratePerMin, double rejectedRatio, double errorRatio,
                                       long uniqueEndpoints, double burstiness) {
    return new WindowMetrics("c1", 5, requests, rejected, errors,
        ratePerMin, rejectedRatio, errorRatio, 0, uniqueEndpoints, burstiness);
  }

  private static boolean has(List<AnomalyEvent> events, String metric) {
    return events.stream().anyMatch(e -> e.metric().equals(metric));
  }

  @Test
  void normalTrafficTripsNoRules() {
    List<AnomalyEvent> events = metricsEvaluated(metrics(100, 2, 1, 20, 0.02, 0.01, 5, 1.2));
    assertTrue(events.isEmpty(), "healthy traffic should produce no anomalies");
  }

  @Test
  void highRejectRatioFiresRejectSurge() {
    List<AnomalyEvent> events = metricsEvaluated(metrics(30, 20, 0, 6, 0.667, 0, 3, 1.0));
    assertTrue(has(events, "reject_ratio"));
  }

  @Test
  void rejectRatioIgnoredBelowMinimumSampleSize() {
    // 80% rejected but only 10 requests — too few to be meaningful.
    List<AnomalyEvent> events = metricsEvaluated(metrics(10, 8, 0, 2, 0.8, 0, 3, 1.0));
    assertTrue(events.stream().noneMatch(e -> e.metric().equals("reject_ratio")));
  }

  @Test
  void highErrorRatioFiresErrorSurge() {
    List<AnomalyEvent> events = metricsEvaluated(metrics(50, 0, 15, 10, 0, 0.30, 4, 1.0));
    assertTrue(has(events, "error_ratio"));
  }

  @Test
  void burstyTrafficFiresBurstRule() {
    List<AnomalyEvent> events = metricsEvaluated(metrics(50, 0, 0, 10, 0, 0, 4, 5.0));
    assertTrue(has(events, "burstiness"));
  }

  @Test
  void slowAndLowScanningIsDetected() {
    // Low rate (2/min) but probing 20 distinct endpoints => enumeration.
    List<AnomalyEvent> events = metricsEvaluated(metrics(10, 0, 0, 2, 0, 0, 20, 1.0));
    assertTrue(has(events, "slow_and_low"));
  }

  @Test
  void slowAndLowNotFiredWhenEndpointSpreadIsNarrow() {
    List<AnomalyEvent> events = metricsEvaluated(metrics(10, 0, 0, 2, 0, 0, 4, 1.0));
    assertTrue(events.stream().noneMatch(e -> e.metric().equals("slow_and_low")));
  }

  @Test
  void severeRejectRatioIsHighSeverity() {
    // ratio >= 2x threshold (1.0) is impossible; use 100% which is exactly 2x of 0.5.
    List<AnomalyEvent> events = metricsEvaluated(metrics(40, 40, 0, 8, 1.0, 0, 3, 1.0));
    AnomalyEvent reject = events.stream().filter(e -> e.metric().equals("reject_ratio")).findFirst().orElseThrow();
    assertEquals(Severity.HIGH, reject.severity());
  }

  private List<AnomalyEvent> metricsEvaluated(WindowMetrics m) {
    return rules.evaluate(m);
  }
}
