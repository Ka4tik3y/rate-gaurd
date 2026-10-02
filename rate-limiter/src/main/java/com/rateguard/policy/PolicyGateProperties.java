package com.rateguard.policy;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Guardrail configuration for the Policy Gate (spec §21). These bound what an automatic agent
 * action may do; a human admin action may exceed the automatic-change ratio but is still subject to
 * the absolute capacity bounds and is always audited.
 */
@ConfigurationProperties("policy-gate")
public class PolicyGateProperties {

  /** Maximum automatic change to a limit as a fraction of the current limit (±0.5 = ±50%). */
  private double maxChangeRatio = 0.5;
  /** Absolute floor for any capacity the gate will set. */
  private long minCapacity = 1;
  /** Absolute ceiling for any capacity the gate will set. */
  private long maxCapacity = 100_000;
  /** Maximum duration of a temporary block, in seconds. */
  private long maxBlockSeconds = 3600;
  /** Minimum gap between two agent actions for the same client, in seconds. */
  private long cooldownSeconds = 60;
  /** Maximum agent actions per client within {@link #actionWindowSeconds}. */
  private long maxActionsPerWindow = 10;
  /** Length of the action-rate window, in seconds. */
  private long actionWindowSeconds = 3600;
  /** Minimum evidence deviation (e.g. z-score) required for an agent mutation. */
  private double minEvidenceDeviation = 2.0;

  public double getMaxChangeRatio() { return maxChangeRatio; }
  public void setMaxChangeRatio(double maxChangeRatio) { this.maxChangeRatio = maxChangeRatio; }
  public long getMinCapacity() { return minCapacity; }
  public void setMinCapacity(long minCapacity) { this.minCapacity = minCapacity; }
  public long getMaxCapacity() { return maxCapacity; }
  public void setMaxCapacity(long maxCapacity) { this.maxCapacity = maxCapacity; }
  public long getMaxBlockSeconds() { return maxBlockSeconds; }
  public void setMaxBlockSeconds(long maxBlockSeconds) { this.maxBlockSeconds = maxBlockSeconds; }
  public long getCooldownSeconds() { return cooldownSeconds; }
  public void setCooldownSeconds(long cooldownSeconds) { this.cooldownSeconds = cooldownSeconds; }
  public long getMaxActionsPerWindow() { return maxActionsPerWindow; }
  public void setMaxActionsPerWindow(long maxActionsPerWindow) { this.maxActionsPerWindow = maxActionsPerWindow; }
  public long getActionWindowSeconds() { return actionWindowSeconds; }
  public void setActionWindowSeconds(long actionWindowSeconds) { this.actionWindowSeconds = actionWindowSeconds; }
  public double getMinEvidenceDeviation() { return minEvidenceDeviation; }
  public void setMinEvidenceDeviation(double minEvidenceDeviation) { this.minEvidenceDeviation = minEvidenceDeviation; }
}
