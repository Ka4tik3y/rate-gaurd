package com.rateguard.gateway;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;

import com.rateguard.client.ClientIdentifierResolver;
import com.rateguard.domain.RateLimitDecision;
import com.rateguard.metrics.TrafficMetric;
import com.rateguard.metrics.TrafficMetricsRecorder;
import com.rateguard.service.RateLimitService;

import reactor.core.publisher.Mono;

@Component
public class RateLimitGatewayFilter implements GlobalFilter, Ordered {

    /** Set to "true" on a 429 caused by a temporary block rather than an empty token bucket. */
    public static final String BLOCKED_HEADER = "X-RateGuard-Blocked";

    private final ClientIdentifierResolver resolver;
    private final RateLimitService service;
    private final TrafficMetricsRecorder metrics;

    public RateLimitGatewayFilter(ClientIdentifierResolver r, RateLimitService s, TrafficMetricsRecorder metrics) {
        resolver = r;
        service = s;
        this.metrics = metrics;
    }

    public Mono<Void> filter(ServerWebExchange ex, GatewayFilterChain chain) {
        if (!ex.getRequest().getPath().value().startsWith("/api/")) {
            return chain.filter(ex);
        }
        String client = resolver.resolve(ex);
        String endpoint = ex.getRequest().getPath().value();
        long started = System.currentTimeMillis();
        return service.check(client, endpoint).flatMap(d -> {
            headers(ex, d);
            if (d.allowed()) {
                // Record after the downstream call completes so we capture its real status/latency.
                return chain.filter(ex).doFinally(sig -> record(ex, client, endpoint, started, false));
            }
            ex.getResponse().setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
            record(ex, client, endpoint, started, true);
            return ex.getResponse().setComplete();
        });
    }

    private void record(ServerWebExchange ex, String client, String endpoint, long started, boolean rateLimited) {
        HttpStatusCode status = ex.getResponse().getStatusCode();
        int code = status != null ? status.value() : (rateLimited ? 429 : 200);
        long latency = System.currentTimeMillis() - started;
        metrics.record(new TrafficMetric(client, endpoint, rateLimited, code, latency));
    }

    private void headers(ServerWebExchange ex, RateLimitDecision d) {
        HttpHeaders h = ex.getResponse().getHeaders();
        h.set("X-RateLimit-Limit", Long.toString(d.limit()));
        h.set("X-RateLimit-Remaining", Long.toString(d.remaining()));
        if (!d.allowed()) {
            h.set(HttpHeaders.RETRY_AFTER, Long.toString(d.retryAfter()));
            if (d.blocked()) {
                // Distinguishes an agent/admin block from ordinary token exhaustion; Retry-After then
                // carries the seconds left on the block.
                h.set(BLOCKED_HEADER, "true");
            }
        }
    }

    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE + 10;
    }
}
