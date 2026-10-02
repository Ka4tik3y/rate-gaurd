package com.rateguard.anomaly;

import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;

/**
 * Cheap, stateful EWMA + z-score detector for metrics that signal abuse by spiking upward
 * (request rate, burstiness). It keeps a rolling baseline per (client, metric) in memory, updates
 * it on every observation, and emits an {@link AnomalyEvent} when the current value sits far enough
 * above the baseline. It is fully deterministic and never calls an LLM (architectural rule 11).
 *
 * <p>Baseline state is per-JVM. Across multiple gateway instances each node learns its own
 * baseline, which is acceptable because detection is advisory and never gates traffic.
 */
@Service
public class DeterministicAnomalyDetector {

  private final AnomalyProperties properties;
  private final ConcurrentHashMap<String, Baseline> baselines = new ConcurrentHashMap<>();

  public DeterministicAnomalyDetector(AnomalyProperties properties) {
    this.properties = properties;
  }

  /**
   * Observes a value for a (client, metric) series, updates the rolling baseline, and returns an
   * anomaly event if the value deviates upward beyond the configured z-score threshold once warmed
   * up. Only upward deviations are flagged — a sudden drop in request rate is not an attack signal.
   */
  public Optional<AnomalyEvent> observe(String clientId, String metric, double value, String window) {
    String key = clientId + ':' + metric;
    Baseline previous = baselines.get(key);

    if (previous == null) {
      baselines.put(key, new Baseline(value, 0, 1));
      return Optional.empty();
    }

    double deviation = Math.max(properties.getMinDeviation(), previous.deviation());
    double z = (value - previous.mean()) / deviation;

    double alpha = properties.getEwmaAlpha();
    double mean = alpha * value + (1 - alpha) * previous.mean();
    double nextDeviation = alpha * Math.abs(value - mean) + (1 - alpha) * previous.deviation();
    baselines.put(key, new Baseline(mean, nextDeviation, previous.samples() + 1));

    if (previous.samples() < properties.getWarmupSamples() || z < properties.getZThreshold()) {
      return Optional.empty();
    }

    Severity severity = z >= properties.getHighZThreshold() ? Severity.HIGH : Severity.MEDIUM;
    String reason = String.format(
        "%s=%.2f exceeds EWMA baseline %.2f by z-score %.2f", metric, value, previous.mean(), z);
    return Optional.of(new AnomalyEvent(
        clientId, Instant.now(), metric, value, previous.mean(), z, severity, window, reason));
  }

  /** Visible for tests: drop all learned baselines. */
  public void reset() {
    baselines.clear();
  }

  private record Baseline(double mean, double deviation, int samples) { }
}
