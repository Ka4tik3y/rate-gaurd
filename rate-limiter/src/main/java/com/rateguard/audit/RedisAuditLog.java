package com.rateguard.audit;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.stereotype.Repository;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rateguard.redis.RedisKeys;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Redis-backed audit log. Each entry is stored as JSON in a per-client list and a global list, both
 * capped so the log stays bounded. A structured log line is also emitted for each entry.
 */
@Repository
public class RedisAuditLog implements AuditLog {

  private static final Logger log = LoggerFactory.getLogger(RedisAuditLog.class);
  private static final long MAX_ENTRIES = 500;

  private final ReactiveStringRedisTemplate redis;
  private final ObjectMapper mapper;

  public RedisAuditLog(ReactiveStringRedisTemplate redis, ObjectMapper mapper) {
    this.redis = redis;
    this.mapper = mapper;
  }

  @Override
  public Mono<Void> record(AuditEntry entry) {
    final String json;
    try {
      json = mapper.writeValueAsString(entry);
    } catch (Exception e) {
      log.warn("failed to serialize audit entry id={}", entry.id(), e);
      return Mono.empty();
    }
    log.info("audit id={} client={} source={} action={} decision={} result={} reason=\"{}\"",
        entry.id(), entry.clientId(), entry.source(), entry.actionType(), entry.decision(),
        entry.executionResult(), entry.reason());

    String clientKey = RedisKeys.auditClient(entry.clientId());
    Mono<Long> perClient = redis.opsForList().leftPush(clientKey, json)
        .flatMap(n -> redis.opsForList().trim(clientKey, 0, MAX_ENTRIES - 1).thenReturn(n));
    Mono<Long> global = redis.opsForList().leftPush(RedisKeys.AUDIT_ALL, json)
        .flatMap(n -> redis.opsForList().trim(RedisKeys.AUDIT_ALL, 0, MAX_ENTRIES - 1).thenReturn(n));
    return Mono.when(perClient, global);
  }

  @Override
  public Mono<List<AuditEntry>> recent(String clientId, int limit) {
    return read(RedisKeys.auditClient(clientId), limit);
  }

  @Override
  public Mono<List<AuditEntry>> recentAll(int limit) {
    return read(RedisKeys.AUDIT_ALL, limit);
  }

  private Mono<List<AuditEntry>> read(String key, int limit) {
    return redis.opsForList().range(key, 0, Math.max(0, limit - 1))
        .flatMap(this::deserialize)
        .collectList();
  }

  private Flux<AuditEntry> deserialize(String json) {
    try {
      return Flux.just(mapper.readValue(json, AuditEntry.class));
    } catch (Exception e) {
      log.warn("failed to deserialize audit entry", e);
      return Flux.empty();
    }
  }
}
