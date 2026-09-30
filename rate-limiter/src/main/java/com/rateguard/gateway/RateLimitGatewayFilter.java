package com.rateguard.gateway;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;

import com.rateguard.client.ClientIdentifierResolver;
import com.rateguard.domain.RateLimitDecision;
import com.rateguard.service.RateLimitService;

import reactor.core.publisher.Mono;

@Component
public class RateLimitGatewayFilter implements GlobalFilter, Ordered {

    private final ClientIdentifierResolver resolver;
    private final RateLimitService service;

    public RateLimitGatewayFilter(ClientIdentifierResolver r, RateLimitService s) {
        resolver = r;
        service = s;
    }

    public Mono<Void> filter(ServerWebExchange ex, GatewayFilterChain chain) {
        if (!ex.getRequest().getPath().value().startsWith("/api/")) {
            return chain.filter(ex);
        
        }String client = resolver.resolve(ex);
        String endpoint = ex.getRequest().getPath().value();
        return service.check(client, endpoint).flatMap(d -> {
            headers(ex, d);
            if (d.allowed()) {
                return chain.filter(ex);
            
            }ex.getResponse().setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
            return ex.getResponse().setComplete();
        });
    }

    private void headers(ServerWebExchange ex, RateLimitDecision d) {
        HttpHeaders h = ex.getResponse().getHeaders();
        h.set("X-RateLimit-Limit", Long.toString(d.limit()));
        h.set("X-RateLimit-Remaining", Long.toString(d.remaining()));
        if (!d.allowed()) {
            h.set(HttpHeaders.RETRY_AFTER, Long.toString(d.retryAfter()));
    
        }}

    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE + 10;
    }
}
