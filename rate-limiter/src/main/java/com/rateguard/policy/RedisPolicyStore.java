package com.rateguard.policy;

import java.time.Duration;

import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.stereotype.Repository;

import com.rateguard.config.RateLimitProperties;
import com.rateguard.domain.RateLimitPolicy;
import com.rateguard.redis.RedisKeys;

import reactor.core.publisher.Mono;

/**
 * Redis-backed {@link PolicyStore}. Writes land in the same {@code policy:*} keys the token-bucket
 * Lua script reads, so overrides and blocks take effect on the very next request.
 */
@Repository
public class RedisPolicyStore implements PolicyStore {

  private final ReactiveStringRedisTemplate redis;
  private final RateLimitProperties properties;

  public RedisPolicyStore(ReactiveStringRedisTemplate redis, RateLimitProperties properties) {
    this.redis = redis;
    this.properties = properties;
  }

  private RateLimitPolicy defaultPolicy() {
    return new RateLimitPolicy("default", properties.getDefault().getCapacity(),
        properties.getDefault().getRefillRate(), properties.isEnabled());
  }

  @Override
  public Mono<RateLimitPolicy> effectivePolicy(String clientId) {
    return redis.<String, String>opsForHash().entries(RedisKeys.override(clientId))
        .collectMap(e -> (String) e.getKey(), e -> (String) e.getValue())
        .map(fields -> {
          if (fields.isEmpty() || fields.get("capacity") == null) {
            return defaultPolicy();
          }
          long capacity = Long.parseLong(fields.get("capacity"));
          double refill = fields.get("refillRate") != null
              ? Double.parseDouble(fields.get("refillRate"))
              : properties.getDefault().getRefillRate();
          return new RateLimitPolicy("override", capacity, refill, true);
        })
        .defaultIfEmpty(defaultPolicy());
  }

  @Override
  public Mono<Void> setLimit(String clientId, long capacity, double refillRate) {
    return writeOverride(clientId, capacity, refillRate)
        .then(redis.persist(RedisKeys.override(clientId)))
        .then();
  }

  @Override
  public Mono<Void> setLimit(String clientId, long capacity, double refillRate, long ttlSeconds) {
    return writeOverride(clientId, capacity, refillRate)
        .then(redis.expire(RedisKeys.override(clientId), Duration.ofSeconds(ttlSeconds)))
        .then();
  }

  private Mono<Boolean> writeOverride(String clientId, long capacity, double refillRate) {
    return redis.opsForHash().putAll(RedisKeys.override(clientId),
        java.util.Map.of("capacity", Long.toString(capacity), "refillRate", Double.toString(refillRate)));
  }

  @Override
  public Mono<Long> overrideTtlSeconds(String clientId) {
    return redis.getExpire(RedisKeys.override(clientId))
        .map(d -> d.isNegative() || d.isZero() ? -1L : d.getSeconds())
        .defaultIfEmpty(-1L);
  }

  @Override
  public Mono<Void> rememberBlock(String clientId, long seconds) {
    return redis.opsForValue().set(RedisKeys.recentBlock(clientId), "1", Duration.ofSeconds(seconds)).then();
  }

  @Override
  public Mono<Boolean> recentlyBlocked(String clientId) {
    return redis.hasKey(RedisKeys.recentBlock(clientId));
  }

  @Override
  public Mono<Void> clearLimit(String clientId) {
    return redis.delete(RedisKeys.override(clientId)).then();
  }

  @Override
  public Mono<Boolean> isBlocked(String clientId) {
    return redis.hasKey(RedisKeys.block(clientId));
  }

  @Override
  public Mono<Long> blockTtlSeconds(String clientId) {
    return redis.getExpire(RedisKeys.block(clientId))
        .map(Duration::getSeconds)
        .defaultIfEmpty(-1L);
  }

  @Override
  public Mono<Void> block(String clientId, long seconds) {
    return redis.opsForValue().set(RedisKeys.block(clientId), "1", Duration.ofSeconds(seconds)).then();
  }

  @Override
  public Mono<Void> unblock(String clientId) {
    return redis.delete(RedisKeys.block(clientId)).then();
  }

  @Override
  public Mono<ClientClassification> classification(String clientId) {
    return redis.opsForValue().get(RedisKeys.classification(clientId))
        .map(RedisPolicyStore::parseClassification)
        .defaultIfEmpty(ClientClassification.NORMAL);
  }

  private static ClientClassification parseClassification(String value) {
    try {
      return ClientClassification.valueOf(value.trim().toUpperCase());
    } catch (IllegalArgumentException | NullPointerException e) {
      return ClientClassification.NORMAL;
    }
  }

  @Override
  public Mono<Void> setClassification(String clientId, ClientClassification classification) {
    return redis.opsForValue().set(RedisKeys.classification(clientId), classification.name()).then();
  }

  @Override
  public Mono<Boolean> inCooldown(String clientId) {
    return redis.hasKey(RedisKeys.cooldown(clientId));
  }

  @Override
  public Mono<Long> actionsInWindow(String clientId) {
    return redis.opsForValue().get(RedisKeys.actionCount(clientId))
        .map(Long::parseLong)
        .defaultIfEmpty(0L);
  }

  @Override
  public Mono<Void> recordAction(String clientId, long cooldownSeconds, long windowSeconds) {
    Mono<Boolean> cooldown = redis.opsForValue()
        .set(RedisKeys.cooldown(clientId), "1", Duration.ofSeconds(cooldownSeconds));
    Mono<Void> counter = redis.opsForValue().increment(RedisKeys.actionCount(clientId))
        .flatMap(count -> count == 1L
            ? redis.expire(RedisKeys.actionCount(clientId), Duration.ofSeconds(windowSeconds)).then()
            : Mono.empty());
    return Mono.when(cooldown, counter);
  }

  @Override
  public Mono<Void> savePending(String actionId, String json) {
    // Pending approvals expire after 24h so a forgotten proposal cannot linger indefinitely.
    return redis.opsForValue().set(RedisKeys.pendingAction(actionId), json, Duration.ofHours(24))
        .then(redis.opsForSet().add(RedisKeys.PENDING_INDEX, actionId))
        .then();
  }

  @Override
  public Mono<String> loadPending(String actionId) {
    return redis.opsForValue().get(RedisKeys.pendingAction(actionId));
  }

  @Override
  public Mono<Void> deletePending(String actionId) {
    return redis.delete(RedisKeys.pendingAction(actionId))
        .then(redis.opsForSet().remove(RedisKeys.PENDING_INDEX, actionId))
        .then();
  }

  @Override
  public Mono<java.util.List<String>> pendingActionIds() {
    return redis.opsForSet().members(RedisKeys.PENDING_INDEX).cast(String.class).collectList();
  }
}
