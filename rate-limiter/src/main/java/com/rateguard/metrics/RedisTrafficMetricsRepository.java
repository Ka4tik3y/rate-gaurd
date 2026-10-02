package com.rateguard.metrics;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.springframework.data.domain.Range;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.stereotype.Repository;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Redis-backed traffic metrics. Keys (all under {@code metric:*}, never mixed with {@code rl:*}):
 * <ul>
 *   <li>{@code metric:req:{clientId}:{minute}} — hash of requests / rate_limited / errors / latency_ms</li>
 *   <li>{@code metric:endpoints:{clientId}:{minute}} — HyperLogLog of distinct endpoints</li>
 *   <li>{@code metric:active} — sorted set of clientId scored by last-seen epoch second</li>
 * </ul>
 * Per-minute buckets carry a TTL so history is bounded; the detector reads short windows off them.
 */
@Repository
public class RedisTrafficMetricsRepository implements TrafficMetricsRepository {

  private static final String ACTIVE_KEY = "metric:active";

  private final ReactiveStringRedisTemplate redis;
  private final MetricsProperties properties;

  public RedisTrafficMetricsRepository(ReactiveStringRedisTemplate redis, MetricsProperties properties) {
    this.redis = redis;
    this.properties = properties;
  }

  private static long currentMinute() {
    return Instant.now().getEpochSecond() / 60;
  }

  private static String reqKey(String clientId, long minute) {
    return "metric:req:{" + clientId + "}:" + minute;
  }

  private static String endpointsKey(String clientId, long minute) {
    return "metric:endpoints:{" + clientId + "}:" + minute;
  }

  @Override
  public Mono<Void> record(TrafficMetric metric) {
    if (!properties.isEnabled()) {
      return Mono.empty();
    }
    long minute = currentMinute();
    String key = reqKey(metric.clientId(), minute);
    String endpoints = endpointsKey(metric.clientId(), minute);
    Duration ttl = Duration.ofMinutes(properties.getRetentionMinutes());

    Mono<Long> requests = redis.opsForHash().increment(key, "requests", 1);
    Mono<Long> rejected = metric.rateLimited() ? redis.opsForHash().increment(key, "rate_limited", 1) : Mono.just(0L);
    Mono<Long> errors = metric.statusCode() >= 500 ? redis.opsForHash().increment(key, "errors", 1) : Mono.just(0L);
    Mono<Long> latency = redis.opsForHash().increment(key, "latency_ms", Math.max(0, metric.latencyMillis()));
    Mono<Long> endpointAdd = redis.opsForHyperLogLog().add(endpoints, metric.endpoint());
    Mono<Boolean> markActive = redis.opsForZSet().add(ACTIVE_KEY, metric.clientId(), Instant.now().getEpochSecond());

    return Mono.when(
        requests, rejected, errors, latency, endpointAdd, markActive,
        redis.expire(key, ttl),
        redis.expire(endpoints, ttl));
  }

  @Override
  public Mono<List<MinuteBucket>> buckets(String clientId, int minutes) {
    long current = currentMinute();
    List<Long> wanted = new ArrayList<>(minutes);
    for (int i = minutes - 1; i >= 0; i--) {
      wanted.add(current - i);
    }
    return Flux.fromIterable(wanted)
        .concatMap(minute -> readBucket(clientId, minute))
        .collectList();
  }

  private Mono<MinuteBucket> readBucket(String clientId, long minute) {
    return redis.<String, String>opsForHash().entries(reqKey(clientId, minute))
        .collectMap(e -> (String) e.getKey(), e -> (String) e.getValue())
        .map(fields -> new MinuteBucket(
            minute,
            parse(fields.get("requests")),
            parse(fields.get("rate_limited")),
            parse(fields.get("errors")),
            parse(fields.get("latency_ms"))))
        .defaultIfEmpty(MinuteBucket.empty(minute));
  }

  private static long parse(String value) {
    if (value == null || value.isBlank()) {
      return 0;
    }
    try {
      return Long.parseLong(value.trim());
    } catch (NumberFormatException e) {
      return 0;
    }
  }

  @Override
  public Mono<Long> uniqueEndpoints(String clientId, int minutes) {
    long current = currentMinute();
    String[] keys = new String[minutes];
    for (int i = 0; i < minutes; i++) {
      keys[i] = endpointsKey(clientId, current - (minutes - 1 - i));
    }
    // PFCOUNT over multiple keys returns the cardinality of their union.
    return redis.opsForHyperLogLog().size(keys).defaultIfEmpty(0L);
  }

  @Override
  public Flux<String> activeClients(int withinMinutes) {
    double minScore = Instant.now().getEpochSecond() - (withinMinutes * 60L);
    // Drop long-idle clients (score < window start) so the active index can never grow unbounded,
    // then return everyone seen within the window (score >= window start).
    Mono<Long> prune = redis.opsForZSet()
        .removeRangeByScore(ACTIVE_KEY, Range.leftUnbounded(Range.Bound.exclusive(minScore)));
    return prune.thenMany(
        redis.opsForZSet()
            .rangeByScore(ACTIVE_KEY, Range.rightUnbounded(Range.Bound.inclusive(minScore)))
            .cast(String.class));
  }
}
