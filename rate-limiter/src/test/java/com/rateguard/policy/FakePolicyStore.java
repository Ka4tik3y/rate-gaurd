package com.rateguard.policy;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import com.rateguard.domain.RateLimitPolicy;

import reactor.core.publisher.Mono;

/** In-memory {@link PolicyStore} for fast, deterministic Policy Gate unit tests. */
public class FakePolicyStore implements PolicyStore {

  public final Map<String, RateLimitPolicy> overrides = new ConcurrentHashMap<>();
  public final Set<String> blocked = ConcurrentHashMap.newKeySet();
  public final Map<String, ClientClassification> classifications = new ConcurrentHashMap<>();
  public final Set<String> cooldown = ConcurrentHashMap.newKeySet();
  public final Map<String, Long> actionCounts = new ConcurrentHashMap<>();
  public final Map<String, String> pending = new ConcurrentHashMap<>();
  /** clientId -> override TTL in seconds (absent = permanent). */
  public final Map<String, Long> overrideTtls = new ConcurrentHashMap<>();
  public final Set<String> recentlyBlocked = ConcurrentHashMap.newKeySet();

  private final long defaultCapacity;
  private final double defaultRefill;

  public FakePolicyStore(long defaultCapacity, double defaultRefill) {
    this.defaultCapacity = defaultCapacity;
    this.defaultRefill = defaultRefill;
  }

  @Override
  public Mono<RateLimitPolicy> effectivePolicy(String clientId) {
    return Mono.just(overrides.getOrDefault(clientId,
        new RateLimitPolicy("default", defaultCapacity, defaultRefill, true)));
  }

  @Override
  public Mono<Void> setLimit(String clientId, long capacity, double refillRate) {
    overrides.put(clientId, new RateLimitPolicy("override", capacity, refillRate, true));
    overrideTtls.remove(clientId);
    return Mono.empty();
  }

  @Override
  public Mono<Void> setLimit(String clientId, long capacity, double refillRate, long ttlSeconds) {
    overrides.put(clientId, new RateLimitPolicy("override", capacity, refillRate, true));
    overrideTtls.put(clientId, ttlSeconds);
    return Mono.empty();
  }

  @Override
  public Mono<Long> overrideTtlSeconds(String clientId) {
    return Mono.just(overrideTtls.getOrDefault(clientId, -1L));
  }

  @Override
  public Mono<Void> rememberBlock(String clientId, long seconds) {
    recentlyBlocked.add(clientId);
    return Mono.empty();
  }

  @Override
  public Mono<Boolean> recentlyBlocked(String clientId) {
    return Mono.just(recentlyBlocked.contains(clientId));
  }

  @Override
  public Mono<Void> clearLimit(String clientId) {
    overrides.remove(clientId);
    overrideTtls.remove(clientId);
    return Mono.empty();
  }

  @Override
  public Mono<Boolean> isBlocked(String clientId) {
    return Mono.just(blocked.contains(clientId));
  }

  @Override
  public Mono<Long> blockTtlSeconds(String clientId) {
    return Mono.just(blocked.contains(clientId) ? 60L : -1L);
  }

  @Override
  public Mono<Void> block(String clientId, long seconds) {
    blocked.add(clientId);
    return Mono.empty();
  }

  @Override
  public Mono<Void> unblock(String clientId) {
    blocked.remove(clientId);
    return Mono.empty();
  }

  @Override
  public Mono<ClientClassification> classification(String clientId) {
    return Mono.just(classifications.getOrDefault(clientId, ClientClassification.NORMAL));
  }

  @Override
  public Mono<Void> setClassification(String clientId, ClientClassification classification) {
    classifications.put(clientId, classification);
    return Mono.empty();
  }

  @Override
  public Mono<Boolean> inCooldown(String clientId) {
    return Mono.just(cooldown.contains(clientId));
  }

  @Override
  public Mono<Long> actionsInWindow(String clientId) {
    return Mono.just(actionCounts.getOrDefault(clientId, 0L));
  }

  @Override
  public Mono<Void> recordAction(String clientId, long cooldownSeconds, long windowSeconds) {
    cooldown.add(clientId);
    actionCounts.merge(clientId, 1L, Long::sum);
    return Mono.empty();
  }

  @Override
  public Mono<Void> savePending(String actionId, String json) {
    pending.put(actionId, json);
    return Mono.empty();
  }

  @Override
  public Mono<String> loadPending(String actionId) {
    String json = pending.get(actionId);
    return json == null ? Mono.empty() : Mono.just(json);
  }

  @Override
  public Mono<Void> deletePending(String actionId) {
    pending.remove(actionId);
    return Mono.empty();
  }

  @Override
  public Mono<List<String>> pendingActionIds() {
    return Mono.just(new ArrayList<>(pending.keySet()));
  }
}
