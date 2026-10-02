package com.rateguard.service;

import com.rateguard.config.RateLimitProperties;
import com.rateguard.domain.*;
import com.rateguard.redis.RedisTokenBucketRepository;
import io.micrometer.core.instrument.*;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

@Service
public class DefaultRateLimitService implements RateLimitService {
    private static final Logger log = LoggerFactory.getLogger(DefaultRateLimitService.class);
    private final RedisTokenBucketRepository repo;
    private final RateLimitProperties p;
    private final MeterRegistry metrics;

    public DefaultRateLimitService(RedisTokenBucketRepository r, RateLimitProperties p, MeterRegistry m) {
        repo = r;
        this.p = p;
        metrics = m;
    }

    public Mono<RateLimitDecision> check(String client, String endpoint) {
        RateLimitPolicy policy = new RateLimitPolicy("default", p.getDefault().getCapacity(),
                p.getDefault().getRefillRate(), p.isEnabled());
        if (!policy.enabled())
            return Mono
                    .just(RateLimitDecision.of(true, policy.capacity(), policy.capacity(), 0, policy.name(), client));
        long started = System.nanoTime();
        return repo.consume(policy, client).doOnSuccess(d -> record(d, started)).onErrorResume(error -> {
            metrics.counter("rate_limit_redis_errors_total", "policy", policy.name()).increment();
            log.warn("rate limit Redis operation failed; mode={}", p.getRedis().getFailureMode(), error);
            boolean allowed = p.getRedis().getFailureMode() == RateLimitProperties.FailureMode.FAIL_OPEN;
            RateLimitDecision d = RateLimitDecision.of(allowed, allowed ? policy.capacity() : 0, policy.capacity(),
                    allowed ? 0 : 1, policy.name(), client);
            record(d, started);
            return Mono.just(d);
        });
    }

    // Global counters are tagged only with bounded dimensions (policy, result). Per-endpoint and
    // per-client breakdowns are intentionally kept out of Micrometer to avoid high-cardinality
    // tag explosion (spec §14); that detail lives in the aggregated Redis traffic metrics instead.
    private void record(RateLimitDecision d, long start) {
        String result = d.allowed() ? "allowed" : "rejected";
        Tags tags = Tags.of("policy", d.policy(), "result", result);
        metrics.counter("rate_limit_requests_total", tags).increment();
        metrics.counter(d.allowed() ? "rate_limit_allowed_total" : "rate_limit_rejected_total", tags).increment();
        metrics.timer("rate_limit_latency", tags).record(System.nanoTime() - start, TimeUnit.NANOSECONDS);
    }
}
