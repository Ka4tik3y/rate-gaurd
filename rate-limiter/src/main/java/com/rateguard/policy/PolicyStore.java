package com.rateguard.policy;

import java.util.List;

import com.rateguard.domain.RateLimitPolicy;

import reactor.core.publisher.Mono;

/**
 * The single component that reads and writes the policy/guardrail state in Redis. The agent never
 * calls this directly — only the Policy Gate (and the admin API) do — which is how we guarantee the
 * agent cannot mutate Redis (architectural rules 2 & 4).
 */
public interface PolicyStore {

  /** Effective policy for a client: the per-client override if set, otherwise the default. */
  Mono<RateLimitPolicy> effectivePolicy(String clientId);

  /** Persist a per-client limit override. */
  Mono<Void> setLimit(String clientId, long capacity, double refillRate);

  /** Remove a per-client limit override (revert to default). */
  Mono<Void> clearLimit(String clientId);

  Mono<Boolean> isBlocked(String clientId);

  /** Remaining block TTL in seconds, or -1 if not blocked. */
  Mono<Long> blockTtlSeconds(String clientId);

  Mono<Void> block(String clientId, long seconds);

  Mono<Void> unblock(String clientId);

  Mono<ClientClassification> classification(String clientId);

  Mono<Void> setClassification(String clientId, ClientClassification classification);

  /** True if the client is within its action cooldown window. */
  Mono<Boolean> inCooldown(String clientId);

  /** Number of actions recorded for the client in the current action-rate window. */
  Mono<Long> actionsInWindow(String clientId);

  /** Record that an action was taken: arms the cooldown and increments the windowed counter. */
  Mono<Void> recordAction(String clientId, long cooldownSeconds, long windowSeconds);

  /** Persist a pending (awaiting approval) action as JSON, keyed by action id. */
  Mono<Void> savePending(String actionId, String json);

  /** Load a pending action's JSON, or empty if none/expired. */
  Mono<String> loadPending(String actionId);

  /** Remove a pending action. */
  Mono<Void> deletePending(String actionId);

  /** All currently pending action ids. */
  Mono<List<String>> pendingActionIds();
}
