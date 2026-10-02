package com.rateguard.redis;

import java.util.List;

import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Repository;

import com.rateguard.domain.RateLimitDecision;
import com.rateguard.domain.RateLimitPolicy;

import reactor.core.publisher.Mono;

/**
 * Executes the atomic token-bucket Lua script. The script resolves a per-client override and a
 * temporary block from Redis itself, so dynamic policy changes applied by the admin/policy layer
 * take effect without any coordination here, and the whole decision stays a single round trip.
 */
@Repository
public class LuaRedisTokenBucketRepository implements RedisTokenBucketRepository {

    @SuppressWarnings("rawtypes")
    private final DefaultRedisScript<List> script;
    private final ReactiveStringRedisTemplate redis;

    public LuaRedisTokenBucketRepository(ReactiveStringRedisTemplate redis) {
        this.redis = redis;
        script = new DefaultRedisScript<>();
        script.setLocation(new ClassPathResource("lua/token_bucket.lua"));
        script.setResultType(List.class);
    }

    @Override
    public Mono<RateLimitDecision> consume(RateLimitPolicy policy, String clientId) {
        List<String> keys = List.of(
                RedisKeys.bucket(clientId),
                RedisKeys.override(clientId),
                RedisKeys.block(clientId));
        return redis.execute(script, keys, Long.toString(policy.capacity()), Double.toString(policy.refillRate()))
                .single()
                .map(result -> toDecision((List<?>) result, policy, clientId));
    }

    private static RateLimitDecision toDecision(List<?> v, RateLimitPolicy policy, String clientId) {
        boolean allowed = num(v, 0) == 1;
        long remaining = num(v, 1);
        long retryAfter = num(v, 2);
        boolean blocked = num(v, 4) == 1;
        long effectiveCapacity = v.size() > 5 ? num(v, 5) : policy.capacity();
        return new RateLimitDecision(allowed, remaining, effectiveCapacity, retryAfter,
                policy.name(), clientId, blocked);
    }

    private static long num(List<?> v, int i) {
        return ((Number) v.get(i)).longValue();
    }
}
