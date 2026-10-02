package com.rateguard.policy;

/**
 * The only actions the Policy Gate will ever consider. Anything outside this closed set is rejected
 * — the agent cannot invent arbitrary operations (spec §20).
 */
public enum ActionType {
  /** Change a client's rate-limit capacity/refill, bounded by the max-change guardrail. */
  ADJUST_LIMIT,
  /** Block a client for a bounded duration. High-value clients require human approval. */
  TEMPORARY_BLOCK,
  /** Raise an alert only; never mutates rate-limit state. */
  ALERT
}
