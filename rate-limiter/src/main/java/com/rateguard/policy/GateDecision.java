package com.rateguard.policy;

/** Outcome of a Policy Gate evaluation. */
public enum GateDecision {
  /** Validated and executed. */
  APPROVED,
  /** Rejected by a guardrail; nothing was changed. */
  REJECTED,
  /** Valid but withheld pending human approval (high-value block). Not executed. */
  PENDING_APPROVAL
}
