package com.rateguard.metrics;

import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configuration for aggregated traffic-metric collection. Metrics live in Redis under the
 * {@code metric:*} namespace, entirely separate from the {@code rl:*} rate-limit state, and are
 * aggregated into fixed time windows rather than stored per request.
 */
@ConfigurationProperties("traffic-metrics")
public class MetricsProperties {
  /** When false, no metrics are recorded and the request path has zero extra Redis work. */
  private boolean enabled = true;
  /** TTL applied to every per-minute metric bucket so history never grows unbounded. */
  private long retentionMinutes = 15;
  /** Aggregation windows (in minutes) the aggregator and detector evaluate. */
  private List<Integer> windows = List.of(1, 5, 10);

  public boolean isEnabled() { return enabled; }
  public void setEnabled(boolean enabled) { this.enabled = enabled; }
  public long getRetentionMinutes() { return retentionMinutes; }
  public void setRetentionMinutes(long retentionMinutes) { this.retentionMinutes = retentionMinutes; }
  public List<Integer> getWindows() { return windows; }
  public void setWindows(List<Integer> windows) { this.windows = windows; }
}
