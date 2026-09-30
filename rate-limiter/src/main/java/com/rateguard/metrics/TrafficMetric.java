package com.rateguard.metrics;
public record TrafficMetric(String clientId, String endpoint, boolean rateLimited, int statusCode, long latencyMillis) { }
