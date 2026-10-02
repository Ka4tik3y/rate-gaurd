package com.rateguard.anomaly;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;

import com.rateguard.metrics.WindowMetrics;

/**
 * Stateless threshold rules over a {@link WindowMetrics} snapshot. These complement the EWMA
 * detector: where EWMA catches values that spike relative to a learned baseline (request rate),
 * these catch conditions that are anomalous in absolute terms regardless of history — a high 429
 * ratio, a high 5xx ratio, bursty traffic, or slow-and-low endpoint scanning. All deterministic,
 * no LLM.
 */
@Service
public class AnomalyRules {

  private final AnomalyProperties properties;

  public AnomalyRules(AnomalyProperties properties) {
    this.properties = properties;
  }

  /** Returns every threshold-rule anomaly the window trips (possibly empty). */
  public List<AnomalyEvent> evaluate(WindowMetrics m) {
    List<AnomalyEvent> events = new ArrayList<>();
    boolean enoughSamples = m.requests() >= properties.getMinRequestsForRatio();

    if (enoughSamples && m.rejectedRatio() >= properties.getRejectRatioThreshold()) {
      events.add(ratioEvent(m, "reject_ratio", m.rejectedRatio(),
          properties.getRejectRatioThreshold(),
          String.format("429 ratio %.0f%% over last %s (threshold %.0f%%)",
              m.rejectedRatio() * 100, m.window(), properties.getRejectRatioThreshold() * 100)));
    }

    if (enoughSamples && m.errorRatio() >= properties.getErrorRatioThreshold()) {
      events.add(ratioEvent(m, "error_ratio", m.errorRatio(),
          properties.getErrorRatioThreshold(),
          String.format("5xx ratio %.0f%% over last %s (threshold %.0f%%)",
              m.errorRatio() * 100, m.window(), properties.getErrorRatioThreshold() * 100)));
    }

    if (enoughSamples && m.burstiness() >= properties.getBurstinessThreshold()) {
      Severity severity = m.burstiness() >= 2 * properties.getBurstinessThreshold()
          ? Severity.HIGH : Severity.MEDIUM;
      events.add(new AnomalyEvent(m.clientId(), Instant.now(), "burstiness",
          m.burstiness(), properties.getBurstinessThreshold(), m.burstiness(), severity, m.window(),
          String.format("peak/mean burstiness %.1f over %s (threshold %.1f)",
              m.burstiness(), m.window(), properties.getBurstinessThreshold())));
    }

    if (isSlowAndLow(m)) {
      events.add(new AnomalyEvent(m.clientId(), Instant.now(), "slow_and_low",
          m.uniqueEndpoints(), properties.getSlowLowMinEndpoints(), m.uniqueEndpoints(),
          Severity.MEDIUM, m.window(),
          String.format("slow-and-low: %.1f req/min but %d distinct endpoints over %s",
              m.requestRatePerMinute(), m.uniqueEndpoints(), m.window())));
    }

    return events;
  }

  /**
   * Slow-and-low abuse: deliberately low request rate (to dodge rate limits) while probing a wide
   * spread of endpoints — classic enumeration/scanning that volume-based rules miss.
   */
  private boolean isSlowAndLow(WindowMetrics m) {
    return m.requestRatePerMinute() > 0
        && m.requestRatePerMinute() <= properties.getSlowLowMaxRatePerMinute()
        && m.uniqueEndpoints() >= properties.getSlowLowMinEndpoints();
  }

  private AnomalyEvent ratioEvent(WindowMetrics m, String metric, double value, double threshold, String reason) {
    Severity severity = value >= 2 * threshold ? Severity.HIGH : Severity.MEDIUM;
    return new AnomalyEvent(m.clientId(), Instant.now(), metric, value, threshold, value, severity,
        m.window(), reason);
  }
}
