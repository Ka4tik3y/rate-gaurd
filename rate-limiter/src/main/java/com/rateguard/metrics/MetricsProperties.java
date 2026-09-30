package com.rateguard.metrics;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("traffic-metrics")
public class MetricsProperties {
  private boolean enabled = true;
  private long retentionMinutes = 15;
  public boolean isEnabled() { return enabled; }
  public void setEnabled(boolean enabled) { this.enabled = enabled; }
  public long getRetentionMinutes() { return retentionMinutes; }
  public void setRetentionMinutes(long retentionMinutes) { this.retentionMinutes = retentionMinutes; }
}
