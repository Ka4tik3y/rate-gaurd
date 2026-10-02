package com.rateguard.domain;

/**
 * Outcome of a rate-limit check. {@code blocked} distinguishes a temporary administrative/agent
 * block from ordinary token exhaustion; both yield {@code allowed=false} and HTTP 429.
 */
public record RateLimitDecision(
    boolean allowed,
    long remaining,
    long limit,
    long retryAfter,
    String policy,
    String clientId,
    boolean blocked) {

  /** Convenience for the common non-blocked case. */
  public static RateLimitDecision of(boolean allowed, long remaining, long limit, long retryAfter,
                                     String policy, String clientId) {
    return new RateLimitDecision(allowed, remaining, limit, retryAfter, policy, clientId, false);
  }
}
