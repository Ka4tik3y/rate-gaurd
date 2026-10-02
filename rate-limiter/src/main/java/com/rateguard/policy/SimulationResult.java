package com.rateguard.policy;

/**
 * Result of a dry-run limit simulation over a client's recent aggregated traffic. Read-only — it
 * never mutates production state (spec §29).
 */
public record SimulationResult(
    String clientId,
    int windowMinutes,
    long observedRequests,
    long currentCapacity,
    double currentRefillRate,
    long proposedCapacity,
    double proposedRefillRate,
    long currentEstimatedAllowed,
    long currentEstimatedRejected,
    long simulatedAllowed,
    long simulatedRejected) {
}
