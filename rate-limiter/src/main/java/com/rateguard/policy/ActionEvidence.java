package com.rateguard.policy;

/**
 * The deterministic evidence backing a proposed action (typically derived from an anomaly event).
 * The Policy Gate requires sufficient evidence before it will execute an agent action (spec §21).
 */
public record ActionEvidence(
    String metric,
    double currentValue,
    double baseline,
    double deviation,
    String severity,
    String window) {
}
