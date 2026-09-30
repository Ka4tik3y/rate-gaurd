package com.rateguard.redis;

import java.util.List;

import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Repository;

import com.rateguard.domain.RateLimitDecision;
import com.rateguard.domain.RateLimitPolicy;

import reactor.core.publisher.Mono;

@Repository
public class LuaRedisTokenBucketRepository implements RedisTokenBucketRepository {

    private final ReactiveStringRedisTemplate redis;
    private final DefaultRedisScript<List> script;

    public LuaRedisTokenBucketRepository(ReactiveStringRedisTemplate redis) {
        this.redis = redis;
        script = new DefaultRedisScript<>();
        script.setLocation(new ClassPathResource("lua/token_bucket.lua"));
        script.setResultType(List.class);
    }

    @Override
    public Mono<RateLimitDecision> consume(RateLimitPolicy policy, String clientId) {
        String key = "rl:bucket:{" + policy.name() + "}:" + clientId;
        return redis.execute(script, List.of(key), Long.toString(policy.capacity()), Double.toString(policy.refillRate()))
                .single().map(result -> {
                    List<?> v = (List<?>) result;
                    boolean allowed = ((Number) v.get(0)).longValue() == 1;
                    return new RateLimitDecision(allowed, ((Number) v.get(1)).longValue(), policy.capacity(), ((Number) v.get(2)).longValue(), policy.name(), clientId);
                });
    }
}
