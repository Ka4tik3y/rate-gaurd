package com.rateguard.anomaly;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class DeterministicAnomalyDetectorTest {

  private DeterministicAnomalyDetector detector;

  @BeforeEach
  void setUp() {
    detector = new DeterministicAnomalyDetector(new AnomalyProperties());
  }

  @Test
  void firstObservationNeverFiresAndWarmsUp() {
    assertTrue(detector.observe("c1", "request_rate", 100, "5m").isEmpty());
  }

  @Test
  void stableTrafficProducesNoAnomaly() {
    for (int i = 0; i < 20; i++) {
      Optional<AnomalyEvent> event = detector.observe("c1", "request_rate", 100 + (i % 2), "5m");
      assertTrue(event.isEmpty(), "stable traffic should not trigger an anomaly");
    }
  }

  @Test
  void suddenSpikeAfterWarmupFiresHighSeverity() {
    // Warm up the baseline around 100 req/min (past the warmup sample count).
    for (int i = 0; i < 8; i++) {
      detector.observe("c1", "request_rate", 100, "5m");
    }
    Optional<AnomalyEvent> event = detector.observe("c1", "request_rate", 1000, "5m");

    assertTrue(event.isPresent(), "a 10x spike should be flagged");
    AnomalyEvent e = event.get();
    assertEquals("request_rate", e.metric());
    assertEquals(Severity.HIGH, e.severity());
    assertTrue(e.deviation() >= 5.0, "z-score should be large for a 10x spike");
    assertEquals(1000, e.currentValue());
  }

  @Test
  void spikeDuringWarmupIsSuppressed() {
    // Only a couple of samples in: even a big jump must not fire yet.
    detector.observe("c1", "request_rate", 100, "5m");
    detector.observe("c1", "request_rate", 100, "5m");
    assertTrue(detector.observe("c1", "request_rate", 5000, "5m").isEmpty());
  }

  @Test
  void downwardDeviationIsNotFlagged() {
    for (int i = 0; i < 8; i++) {
      detector.observe("c1", "request_rate", 100, "5m");
    }
    assertFalse(detector.observe("c1", "request_rate", 0, "5m").isPresent());
  }

  @Test
  void seriesAreIsolatedPerClientAndMetric() {
    for (int i = 0; i < 8; i++) {
      detector.observe("c1", "request_rate", 100, "5m");
    }
    // A different client has no baseline yet, so its first sample cannot fire.
    assertTrue(detector.observe("c2", "request_rate", 1000, "5m").isEmpty());
  }
}
