package com.rateguard.domain;

public record RateLimitPolicy(String name, long capacity, double refillRate, boolean enabled) {

}
