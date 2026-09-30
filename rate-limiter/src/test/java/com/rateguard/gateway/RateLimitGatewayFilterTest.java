package com.rateguard.gateway;

import static org.junit.jupiter.api.Assertions.assertEquals;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;

import com.rateguard.client.ClientIdentifierResolver;
import com.rateguard.domain.RateLimitDecision;
import com.rateguard.service.RateLimitService;

import reactor.core.publisher.Mono;

class RateLimitGatewayFilterTest {

    @Test
    void rejectedRequestGets429AndHeaders() {
        ClientIdentifierResolver resolver = e -> "client";
        RateLimitService service = (c, p) -> Mono.just(new RateLimitDecision(false, 0, 10, 1, "default", c));
        var exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/api/resource").build());
        new RateLimitGatewayFilter(resolver, service).filter(exchange, e -> Mono.error(new AssertionError("must not continue"))).block();
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, exchange.getResponse().getStatusCode());
        assertEquals("10", exchange.getResponse().getHeaders().getFirst("X-RateLimit-Limit"));
        assertEquals("0", exchange.getResponse().getHeaders().getFirst("X-RateLimit-Remaining"));
        assertEquals("1", exchange.getResponse().getHeaders().getFirst(HttpHeaders.RETRY_AFTER));
    }

    @Test
    void allowedRequestContinues() {
        RateLimitService s = (c, p) -> Mono.just(new RateLimitDecision(true, 9, 10, 0, "default", c));
        var e = MockServerWebExchange.from(MockServerHttpRequest.get("/api/x").build());
        new RateLimitGatewayFilter(x -> "client", s).filter(e, x -> Mono.empty()).block();
        assertEquals("9", e.getResponse().getHeaders().getFirst("X-RateLimit-Remaining"));
    }
}
