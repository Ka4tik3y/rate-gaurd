package com.rateguard.audit;

import java.time.Instant;
import java.util.List;

import com.rateguard.policy.ActionEvidence;
import com.rateguard.policy.ActionSource;
import com.rateguard.policy.ActionType;
import com.rateguard.policy.GateDecision;

/**
 * One auditable record of an action or attempted action (spec §25). Captures the trigger, evidence,
 * the proposal, the gate decision, what was actually applied, the previous values (for rollback),
 * and the execution result/outcome. Stores a concise reason — never hidden model chain-of-thought.
 */
public record AuditEntry(
    String id,
    Instant timestamp,
    String clientId,
    ActionSource source,
    ActionType actionType,
    String trigger,
    String reason,
    ActionEvidence evidence,
    GateDecision decision,
    List<String> gateReasons,
    Long previousCapacity,
    Double previousRefillRate,
    Long appliedCapacity,
    Double appliedRefillRate,
    Long appliedBlockSeconds,
    String executionResult,
    String outcome,
    boolean rolledBack) {
}
