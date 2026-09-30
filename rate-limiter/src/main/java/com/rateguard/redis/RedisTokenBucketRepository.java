package com.rateguard.redis;

import com.rateguard.domain.RateLimitDecision;
import com.rateguard.domain.RateLimitPolicy;

import reactor.core.publisher.Mono;

public interface RedisTokenBucketRepository {

    Mono<RateLimitDecision> consume(RateLimitPolicy policy, String clientId);
}
