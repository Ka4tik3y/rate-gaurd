package com.rateguard.domain;

public record RateLimitDecision(boolean allowed, long remaining, long limit, long retryAfter, String policy, String clientId) {

}
