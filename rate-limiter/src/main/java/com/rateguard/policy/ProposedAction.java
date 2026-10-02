package com.rateguard.policy;

/**
 * An action proposed for the Policy Gate to validate. Built by the agent (Phase 4) or by a human
 * admin request. Only the fields relevant to {@link #actionType} are used.
 */
public record ProposedAction(
    ActionType actionType,
    ActionSource source,
    String clientId,
    String trigger,
    String reason,
    ActionEvidence evidence,
    // ADJUST_LIMIT
    Long newCapacity,
    Double newRefillRate,
    // TEMPORARY_BLOCK
    Long blockSeconds,
    // ALERT
    String alertMessage) {

  public static ProposedAction adjustLimit(ActionSource source, String clientId, long newCapacity,
                                           double newRefillRate, String trigger, String reason,
                                           ActionEvidence evidence) {
    return new ProposedAction(ActionType.ADJUST_LIMIT, source, clientId, trigger, reason, evidence,
        newCapacity, newRefillRate, null, null);
  }

  public static ProposedAction temporaryBlock(ActionSource source, String clientId, long blockSeconds,
                                              String trigger, String reason, ActionEvidence evidence) {
    return new ProposedAction(ActionType.TEMPORARY_BLOCK, source, clientId, trigger, reason, evidence,
        null, null, blockSeconds, null);
  }

  public static ProposedAction alert(ActionSource source, String clientId, String message,
                                     String trigger, String reason, ActionEvidence evidence) {
    return new ProposedAction(ActionType.ALERT, source, clientId, trigger, reason, evidence,
        null, null, null, message);
  }
}
