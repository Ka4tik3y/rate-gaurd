package com.rateguard.anomaly;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Tuning for the deterministic anomaly detector. Every value is a plain threshold or smoothing
 * constant — there is no model or LLM involved (architectural rule 11).
 */
@ConfigurationProperties("anomaly")
public class AnomalyProperties {

  /** Master switch for the scheduled detection loop. Detection never affects rate limiting. */
  private boolean enabled = true;
  /** How often the detection loop runs, in seconds. */
  private long intervalSeconds = 60;
  /** A client is evaluated if it recorded traffic within this many minutes. */
  private int activeWindowMinutes = 10;
  /** Window (minutes) whose metrics are scored against the rolling baseline each tick. */
  private int evaluationWindowMinutes = 5;

  /** EWMA smoothing factor (0..1); higher reacts faster to recent values. */
  private double ewmaAlpha = 0.2;
  /** Z-score at or above which a value is flagged. */
  private double zThreshold = 3.0;
  /** Z-score at or above which severity is HIGH rather than MEDIUM. */
  private double highZThreshold = 5.0;
  /** Minimum samples observed before z-score events fire, to avoid cold-start noise. */
  private int warmupSamples = 5;
  /** Floor on the EWMA deviation so tiny baselines don't produce huge z-scores. */
  private double minDeviation = 1.0;

  /** Minimum requests in the window before ratio-based rules fire (avoids small-sample noise). */
  private long minRequestsForRatio = 20;
  /** 429 ratio at or above which a REJECT_SURGE event fires. */
  private double rejectRatioThreshold = 0.5;
  /** 5xx error ratio at or above which an ERROR_SURGE event fires. */
  private double errorRatioThreshold = 0.2;
  /** Peak/mean burstiness at or above which a BURST event fires. */
  private double burstinessThreshold = 3.0;

  /** Slow-and-low: flag when request rate is at or below this (per minute) but endpoint spread is high. */
  private double slowLowMaxRatePerMinute = 5.0;
  /** Slow-and-low: distinct endpoints at or above this within the active window signals scanning. */
  private long slowLowMinEndpoints = 15;

  /** Capacity of the in-memory recent-events buffer exposed for later phases. */
  private int recentEventsCapacity = 200;

  public boolean isEnabled() { return enabled; }
  public void setEnabled(boolean enabled) { this.enabled = enabled; }
  public long getIntervalSeconds() { return intervalSeconds; }
  public void setIntervalSeconds(long intervalSeconds) { this.intervalSeconds = intervalSeconds; }
  public int getActiveWindowMinutes() { return activeWindowMinutes; }
  public void setActiveWindowMinutes(int activeWindowMinutes) { this.activeWindowMinutes = activeWindowMinutes; }
  public int getEvaluationWindowMinutes() { return evaluationWindowMinutes; }
  public void setEvaluationWindowMinutes(int evaluationWindowMinutes) { this.evaluationWindowMinutes = evaluationWindowMinutes; }
  public double getEwmaAlpha() { return ewmaAlpha; }
  public void setEwmaAlpha(double ewmaAlpha) { this.ewmaAlpha = ewmaAlpha; }
  public double getZThreshold() { return zThreshold; }
  public void setZThreshold(double zThreshold) { this.zThreshold = zThreshold; }
  public double getHighZThreshold() { return highZThreshold; }
  public void setHighZThreshold(double highZThreshold) { this.highZThreshold = highZThreshold; }
  public int getWarmupSamples() { return warmupSamples; }
  public void setWarmupSamples(int warmupSamples) { this.warmupSamples = warmupSamples; }
  public double getMinDeviation() { return minDeviation; }
  public void setMinDeviation(double minDeviation) { this.minDeviation = minDeviation; }
  public long getMinRequestsForRatio() { return minRequestsForRatio; }
  public void setMinRequestsForRatio(long minRequestsForRatio) { this.minRequestsForRatio = minRequestsForRatio; }
  public double getRejectRatioThreshold() { return rejectRatioThreshold; }
  public void setRejectRatioThreshold(double rejectRatioThreshold) { this.rejectRatioThreshold = rejectRatioThreshold; }
  public double getErrorRatioThreshold() { return errorRatioThreshold; }
  public void setErrorRatioThreshold(double errorRatioThreshold) { this.errorRatioThreshold = errorRatioThreshold; }
  public double getBurstinessThreshold() { return burstinessThreshold; }
  public void setBurstinessThreshold(double burstinessThreshold) { this.burstinessThreshold = burstinessThreshold; }
  public double getSlowLowMaxRatePerMinute() { return slowLowMaxRatePerMinute; }
  public void setSlowLowMaxRatePerMinute(double slowLowMaxRatePerMinute) { this.slowLowMaxRatePerMinute = slowLowMaxRatePerMinute; }
  public long getSlowLowMinEndpoints() { return slowLowMinEndpoints; }
  public void setSlowLowMinEndpoints(long slowLowMinEndpoints) { this.slowLowMinEndpoints = slowLowMinEndpoints; }
  public int getRecentEventsCapacity() { return recentEventsCapacity; }
  public void setRecentEventsCapacity(int recentEventsCapacity) { this.recentEventsCapacity = recentEventsCapacity; }
}
