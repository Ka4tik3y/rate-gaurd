package com.rateguard.metrics;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;

import org.junit.jupiter.api.Test;

class WindowMetricsTest {

  private static final double EPS = 1e-9;

  @Test
  void aggregatesCountsRatesAndRatios() {
    List<MinuteBucket> buckets = List.of(
        new MinuteBucket(1, 10, 2, 1, 100),
        new MinuteBucket(2, 10, 0, 0, 100),
        new MinuteBucket(3, 10, 0, 0, 100),
        new MinuteBucket(4, 10, 0, 0, 100),
        new MinuteBucket(5, 10, 0, 1, 100));

    WindowMetrics m = WindowMetrics.from("c1", 5, buckets, 7);

    assertEquals(50, m.requests());
    assertEquals(2, m.rejected());
    assertEquals(2, m.errors());
    assertEquals(10.0, m.requestRatePerMinute(), EPS);          // 50 / 5 minutes
    assertEquals(2.0 / 50, m.rejectedRatio(), EPS);
    assertEquals(2.0 / 50, m.errorRatio(), EPS);
    assertEquals(500.0 / 50, m.avgLatencyMillis(), EPS);        // 10ms avg
    assertEquals(7, m.uniqueEndpoints());
    assertEquals(1.0, m.burstiness(), EPS);                     // perfectly even
    assertEquals("5m", m.window());
  }

  @Test
  void burstinessReflectsPeakOverMean() {
    List<MinuteBucket> buckets = List.of(
        MinuteBucket.empty(1),
        MinuteBucket.empty(2),
        MinuteBucket.empty(3),
        MinuteBucket.empty(4),
        new MinuteBucket(5, 50, 0, 0, 0));

    WindowMetrics m = WindowMetrics.from("c1", 5, buckets, 1);

    assertEquals(50, m.requests());
    assertEquals(10.0, m.requestRatePerMinute(), EPS);          // 50 / 5
    assertEquals(5.0, m.burstiness(), EPS);                     // peak 50 / mean 10
  }

  @Test
  void emptyWindowIsAllZeroWithNoDivisionByZero() {
    List<MinuteBucket> buckets = List.of(MinuteBucket.empty(1), MinuteBucket.empty(2));

    WindowMetrics m = WindowMetrics.from("c1", 2, buckets, 0);

    assertEquals(0, m.requests());
    assertEquals(0.0, m.requestRatePerMinute(), EPS);
    assertEquals(0.0, m.rejectedRatio(), EPS);
    assertEquals(0.0, m.errorRatio(), EPS);
    assertEquals(0.0, m.avgLatencyMillis(), EPS);
    assertEquals(0.0, m.burstiness(), EPS);
  }
}
