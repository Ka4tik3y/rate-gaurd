package com.rateguard.anomaly;

import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

/** Cheap stateful EWMA/z-score detector. It never changes rate-limit policy. */
@Service
public class DeterministicAnomalyDetector {
  private final ConcurrentHashMap<String, Baseline> baselines = new ConcurrentHashMap<>();
  private static final double ALPHA = 0.2, MIN_DEVIATION = 1.0, Z_THRESHOLD = 3.0;
  public Optional<AnomalyEvent> observe(String clientId, String metric, double value, String window) {
    String key = clientId + ':' + metric; Baseline previous = baselines.get(key);
    if (previous == null) { baselines.put(key, new Baseline(value, 0, 1)); return Optional.empty(); }
    double deviation = Math.max(MIN_DEVIATION, previous.deviation()); double z = (value - previous.mean()) / deviation;
    double mean = ALPHA * value + (1 - ALPHA) * previous.mean();
    double nextDeviation = ALPHA * Math.abs(value - mean) + (1 - ALPHA) * previous.deviation();
    baselines.put(key, new Baseline(mean, nextDeviation, previous.samples() + 1));
    if (previous.samples() < 5 || z < Z_THRESHOLD) return Optional.empty();
    Severity severity = z >= 5 ? Severity.HIGH : Severity.MEDIUM;
    return Optional.of(new AnomalyEvent(clientId, Instant.now(), metric, value, previous.mean(), z, severity, window, "value exceeds EWMA baseline by z-score " + String.format("%.2f", z)));
  }
  private record Baseline(double mean, double deviation, int samples) { }
}
