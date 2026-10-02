package com.rateguard.metrics;

import java.util.List;

/**
 * Aggregated traffic metrics for one client over a fixed window of {@code minutes}.
 * Derived deterministically from the per-minute {@link MinuteBucket}s in the window.
 */
public record WindowMetrics(
    String clientId,
    int minutes,
    long requests,
    long rejected,
    long errors,
    double requestRatePerMinute,
    double rejectedRatio,
    double errorRatio,
    double avgLatencyMillis,
    long uniqueEndpoints,
    double burstiness) {

  /** Label used in anomaly events, e.g. "1m", "5m", "10m". */
  public String window() {
    return minutes + "m";
  }

  /**
   * Builds aggregated metrics from the window's per-minute buckets. The bucket list is expected to
   * be padded to {@code minutes} entries (missing minutes represented as zero buckets) so the rate
   * and burstiness figures reflect the full window, not only the minutes that saw traffic.
   */
  public static WindowMetrics from(String clientId, int minutes, List<MinuteBucket> buckets, long uniqueEndpoints) {
    long requests = buckets.stream().mapToLong(MinuteBucket::requests).sum();
    long rejected = buckets.stream().mapToLong(MinuteBucket::rejected).sum();
    long errors = buckets.stream().mapToLong(MinuteBucket::errors).sum();
    long latency = buckets.stream().mapToLong(MinuteBucket::latencyMillisSum).sum();

    double rate = minutes == 0 ? 0 : (double) requests / minutes;
    double rejectedRatio = requests == 0 ? 0 : (double) rejected / requests;
    double errorRatio = requests == 0 ? 0 : (double) errors / requests;
    double avgLatency = requests == 0 ? 0 : (double) latency / requests;
    double burstiness = burstiness(buckets, rate);

    return new WindowMetrics(clientId, minutes, requests, rejected, errors,
        rate, rejectedRatio, errorRatio, avgLatency, uniqueEndpoints, burstiness);
  }

  /**
   * Burstiness = peak-minute request count / mean-minute request count. A perfectly even
   * distribution gives 1.0; a single spiky minute drives it toward the window length. Returns 0
   * when there is no traffic so quiet clients never look bursty.
   */
  private static double burstiness(List<MinuteBucket> buckets, double meanPerMinute) {
    if (buckets.isEmpty() || meanPerMinute <= 0) {
      return 0;
    }
    long peak = buckets.stream().mapToLong(MinuteBucket::requests).max().orElse(0);
    return peak / meanPerMinute;
  }
}
