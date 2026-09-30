package com.rateguard.service;
import com.rateguard.domain.RateLimitDecision;
import reactor.core.publisher.Mono;
public interface RateLimitService { Mono<RateLimitDecision> check(String clientId, String endpoint); }
