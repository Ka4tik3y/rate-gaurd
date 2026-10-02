package com.rateguard.metrics;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import com.rateguard.anomaly.AnomalyDetectionScheduler;
import com.rateguard.anomaly.AnomalyEvent;
import com.rateguard.anomaly.AnomalyEventSink;

/**
 * End-to-end Phase 2 check against a real Redis: record outcomes, aggregate windowed metrics, and
 * confirm the deterministic detector emits events through the scheduler sweep.
 */
@SpringBootTest
@Testcontainers(disabledWithoutDocker = true)
class MetricsPipelineIntegrationTest {

  static final GenericContainer<?> REDIS =
      new GenericContainer<>(DockerImageName.parse("redis:7-alpine")).withExposedPorts(6379);

  @BeforeAll
  static void start() {
    REDIS.start();
  }

  @AfterAll
  static void stop() {
    REDIS.stop();
  }

  @DynamicPropertySource
  static void redis(DynamicPropertyRegistry r) {
    r.add("spring.data.redis.host", REDIS::getHost);
    r.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
    // Keep the scheduled loop from firing on its own during the test; we trigger sweep() manually.
    r.add("anomaly.interval-seconds", () -> 3600);
  }

  @Autowired TrafficMetricsRepository repository;
  @Autowired MetricsAggregator aggregator;
  @Autowired AnomalyDetectionScheduler scheduler;
  @Autowired AnomalyEventSink sink;

  private void record(String client, String endpoint, boolean rateLimited, int status) {
    repository.record(new TrafficMetric(client, endpoint, rateLimited, status, 5)).block();
  }

  @Test
  void aggregatesWindowedMetricsForAClient() {
    String client = "agg-" + System.nanoTime();
    for (int i = 0; i < 10; i++) {
      record(client, "/api/a", false, 200);
    }
    for (int i = 0; i < 20; i++) {
      record(client, "/api/b", true, 429);
    }

    WindowMetrics m = aggregator.window(client, 5).block();

    assertEquals(30, m.requests());
    assertEquals(20, m.rejected());
    assertEquals(20.0 / 30, m.rejectedRatio(), 1e-9);
    assertEquals(2, m.uniqueEndpoints());   // /api/a and /api/b
  }

  @Test
  void activeClientsListsRecentlySeenClients() {
    String client = "active-" + System.nanoTime();
    record(client, "/api/x", false, 200);

    List<String> active = aggregator.activeClients(10).collectList().block();
    assertTrue(active.contains(client), "recently seen client should be listed as active");
  }

  @Test
  void sweepEmitsRejectSurgeEventForAbusiveClient() {
    String client = "surge-" + System.nanoTime();
    // 25 requests, 20 of them rate-limited => 80% 429 ratio, over the min-sample threshold.
    for (int i = 0; i < 5; i++) {
      record(client, "/api/x", false, 200);
    }
    for (int i = 0; i < 20; i++) {
      record(client, "/api/x", true, 429);
    }

    long published = scheduler.sweep().block();
    assertTrue(published > 0, "sweep should publish at least one anomaly event");

    boolean rejectSurge = sink.recent().stream()
        .filter(e -> e.clientId().equals(client))
        .map(AnomalyEvent::metric)
        .anyMatch("reject_ratio"::equals);
    assertTrue(rejectSurge, "a client with an 80% 429 ratio should raise a reject_ratio anomaly");
  }
}
