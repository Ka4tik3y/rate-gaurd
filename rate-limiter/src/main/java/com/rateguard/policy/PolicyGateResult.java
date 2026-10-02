package com.rateguard.policy;

import java.util.List;

/**
 * Result of a Policy Gate evaluation, including the audit id and the exact values applied (if any).
 */
public record PolicyGateResult(
    GateDecision decision,
    String actionId,
    List<String> reasons,
    Long appliedCapacity,
    Double appliedRefillRate,
    Long appliedBlockSeconds) {

  public static PolicyGateResult rejected(String actionId, String reason) {
    return new PolicyGateResult(GateDecision.REJECTED, actionId, List.of(reason), null, null, null);
  }

  public static PolicyGateResult rejected(String actionId, List<String> reasons) {
    return new PolicyGateResult(GateDecision.REJECTED, actionId, reasons, null, null, null);
  }

  public static PolicyGateResult pending(String actionId, String reason) {
    return new PolicyGateResult(GateDecision.PENDING_APPROVAL, actionId, List.of(reason), null, null, null);
  }

  public boolean approved() {
    return decision == GateDecision.APPROVED;
  }
}
