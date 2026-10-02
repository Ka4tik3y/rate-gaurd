package com.rateguard.gateway;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;

import com.rateguard.client.ClientIdentifierResolver;
import com.rateguard.domain.RateLimitDecision;
import com.rateguard.metrics.TrafficMetric;
import com.rateguard.metrics.TrafficMetricsRecorder;
import com.rateguard.metrics.TrafficMetricsRepository;
import com.rateguard.service.RateLimitService;

import java.util.ArrayList;
import java.util.List;

import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

class RateLimitGatewayFilterTest {

    /** Recorder backed by a capturing no-op repository so we can assert metrics are emitted. */
    private static RecordingRepository repo;

    private static TrafficMetricsRecorder recorder() {
        repo = new RecordingRepository();
        return new TrafficMetricsRecorder(repo);
    }

    @Test
    void rejectedRequestGets429AndHeaders() {
        ClientIdentifierResolver resolver = e -> "client";
        RateLimitService service = (c, p) -> Mono.just(RateLimitDecision.of(false, 0, 10, 1, "default", c));
        var exchange = MockServerWebExchange.from(MockServerHttpRequest.get("/api/resource").build());
        new RateLimitGatewayFilter(resolver, service, recorder())
            .filter(exchange, e -> Mono.error(new AssertionError("must not continue"))).block();
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, exchange.getResponse().getStatusCode());
        assertEquals("10", exchange.getResponse().getHeaders().getFirst("X-RateLimit-Limit"));
        assertEquals("0", exchange.getResponse().getHeaders().getFirst("X-RateLimit-Remaining"));
        assertEquals("1", exchange.getResponse().getHeaders().getFirst(HttpHeaders.RETRY_AFTER));
        assertEquals(1, repo.recorded.size());
        assertTrue(repo.recorded.get(0).rateLimited());
    }

    @Test
    void allowedRequestContinues() {
        RateLimitService s = (c, p) -> Mono.just(RateLimitDecision.of(true, 9, 10, 0, "default", c));
        var e = MockServerWebExchange.from(MockServerHttpRequest.get("/api/x").build());
        new RateLimitGatewayFilter(x -> "client", s, recorder()).filter(e, x -> Mono.empty()).block();
        assertEquals("9", e.getResponse().getHeaders().getFirst("X-RateLimit-Remaining"));
        assertEquals(1, repo.recorded.size());
        assertFalse(repo.recorded.get(0).rateLimited());
    }

    private static final class RecordingRepository implements TrafficMetricsRepository {
        private final List<TrafficMetric> recorded = new ArrayList<>();

        @Override public Mono<Void> record(TrafficMetric metric) {
            recorded.add(metric);
            return Mono.empty();
        }

        @Override public Mono<List<com.rateguard.metrics.MinuteBucket>> buckets(String clientId, int minutes) {
            return Mono.just(List.of());
        }

        @Override public Mono<Long> uniqueEndpoints(String clientId, int minutes) {
            return Mono.just(0L);
        }

        @Override public Flux<String> activeClients(int withinMinutes) {
            return Flux.empty();
        }
    }
}
