package com.rateguard.metrics;

import java.time.Duration;
import java.time.Instant;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.stereotype.Repository;
import reactor.core.publisher.Mono;

@Repository
public class RedisTrafficMetricsRepository implements TrafficMetricsRepository {
  private final ReactiveStringRedisTemplate redis; private final MetricsProperties properties;
  public RedisTrafficMetricsRepository(ReactiveStringRedisTemplate redis, MetricsProperties properties) { this.redis = redis; this.properties = properties; }
  @Override public Mono<Void> record(TrafficMetric metric) {
    if (!properties.isEnabled()) return Mono.empty();
    long minute = Instant.now().getEpochSecond() / 60;
    String key = "metric:req:{" + metric.clientId() + "}:" + minute;
    Duration ttl = Duration.ofMinutes(properties.getRetentionMinutes());
    Mono<Long> requests = redis.opsForHash().increment(key, "requests", 1);
    Mono<Long> rejected = metric.rateLimited() ? redis.opsForHash().increment(key, "rate_limited", 1) : Mono.just(0L);
    Mono<Long> errors = metric.statusCode() >= 500 ? redis.opsForHash().increment(key, "errors", 1) : Mono.just(0L);
    Mono<Long> latency = redis.opsForHash().increment(key, "latency_ms", metric.latencyMillis());
    Mono<Long> endpoints = redis.opsForHyperLogLog().add("metric:endpoints:{" + metric.clientId() + "}:" + minute, metric.endpoint());
    return Mono.when(requests, rejected, errors, latency, endpoints, redis.expire(key, ttl), redis.expire("metric:endpoints:{" + metric.clientId() + "}:" + minute, ttl));
  }
}
