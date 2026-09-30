package com.rateguard.anomaly;
import java.time.Instant;
public record AnomalyEvent(String clientId, Instant timestamp, String metric, double currentValue, double baseline, double deviation, Severity severity, String window, String reason) { }
