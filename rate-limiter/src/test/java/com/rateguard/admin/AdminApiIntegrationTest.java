package com.rateguard.admin;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import com.rateguard.admin.dto.Dtos.GateResponse;
import com.rateguard.policy.GateDecision;

/**
 * End-to-end Phase 3 test over HTTP: security roles, the admin API, the agent's gated proposal
 * endpoint, the kill switch, and the high-value approval flow — all against a real Redis.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers(disabledWithoutDocker = true)
class AdminApiIntegrationTest {

  static final GenericContainer<?> REDIS =
      new GenericContainer<>(DockerImageName.parse("redis:7-alpine")).withExposedPorts(6379);

  @BeforeAll
  static void start() { REDIS.start(); }

  @AfterAll
  static void stop() { REDIS.stop(); }

  @DynamicPropertySource
  static void redis(DynamicPropertyRegistry r) {
    r.add("spring.data.redis.host", REDIS::getHost);
    r.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
  }

  @Autowired WebTestClient http;

  private WebTestClient asAdmin() {
    return http.mutate().defaultHeaders(h -> h.setBasicAuth("admin", "admin")).build();
  }

  private WebTestClient asAgent() {
    return http.mutate().defaultHeaders(h -> h.setBasicAuth("agent", "agent")).build();
  }

  private static Map<String, Object> evidence() {
    Map<String, Object> e = new HashMap<>();
    e.put("metric", "request_rate");
    e.put("currentValue", 420.0);
    e.put("baseline", 80.0);
    e.put("deviation", 4.2);
    e.put("severity", "HIGH");
    e.put("window", "5m");
    return e;
  }

  @AfterEach
  void reEnableAgent() {
    asAdmin().post().uri("/admin/agent/kill-switch")
        .contentType(MediaType.APPLICATION_JSON).bodyValue(Map.of("enabled", true))
        .exchange().expectStatus().isOk();
  }

  @Test
  void adminEndpointsRequireAuthentication() {
    http.get().uri("/admin/agent/status").exchange().expectStatus().isUnauthorized();
  }

  @Test
  void adminCanReadAgentStatus() {
    asAdmin().get().uri("/admin/agent/status").exchange().expectStatus().isOk()
        .expectBody().jsonPath("$.agentEnabled").isEqualTo(true);
  }

  @Test
  void agentRoleIsForbiddenFromAdminEndpoints() {
    asAgent().get().uri("/admin/agent/status").exchange().expectStatus().isForbidden();
  }

  @Test
  void agentCanProposeAlertThroughGate() {
    Map<String, Object> body = new HashMap<>();
    body.put("actionType", "ALERT");
    body.put("clientId", "web-alert");
    body.put("alertMessage", "scraper suspected");
    body.put("trigger", "rate_anomaly");
    body.put("reason", "burst");
    body.put("evidence", evidence());
    asAgent().post().uri("/agent/actions").contentType(MediaType.APPLICATION_JSON).bodyValue(body)
        .exchange().expectStatus().isOk()
        .expectBody().jsonPath("$.decision").isEqualTo("APPROVED");
  }

  @Test
  void adminSetsLimitAndReadsItBack() {
    String client = "web-limit-" + System.nanoTime();
    asAdmin().put().uri("/admin/rate-limits/" + client)
        .contentType(MediaType.APPLICATION_JSON)
        .bodyValue(Map.of("capacity", 150, "refillRate", 15.0, "reason", "scale up"))
        .exchange().expectStatus().isOk()
        .expectBody().jsonPath("$.decision").isEqualTo("APPROVED");

    asAdmin().get().uri("/admin/rate-limits/" + client).exchange().expectStatus().isOk()
        .expectBody()
        .jsonPath("$.capacity").isEqualTo(150)
        .jsonPath("$.policy").isEqualTo("override");
  }

  @Test
  void killSwitchBlocksAgentMutations() {
    asAdmin().post().uri("/admin/agent/kill-switch")
        .contentType(MediaType.APPLICATION_JSON).bodyValue(Map.of("enabled", false))
        .exchange().expectStatus().isOk();

    Map<String, Object> body = new HashMap<>();
    body.put("actionType", "ADJUST_LIMIT");
    body.put("clientId", "web-killed-" + System.nanoTime());
    body.put("newCapacity", 140);
    body.put("newRefillRate", 12.0);
    body.put("trigger", "rate_anomaly");
    body.put("reason", "spike");
    body.put("evidence", evidence());

    asAgent().post().uri("/agent/actions").contentType(MediaType.APPLICATION_JSON).bodyValue(body)
        .exchange().expectStatus().isOk()
        .expectBody().jsonPath("$.decision").isEqualTo("REJECTED");
  }

  @Test
  void highValueBlockRequiresApproval() {
    String vip = "web-vip-" + System.nanoTime();
    // classify as high value
    asAdmin().put().uri("/admin/rate-limits/" + vip + "/classification")
        .contentType(MediaType.APPLICATION_JSON).bodyValue(Map.of("classification", "HIGH_VALUE"))
        .exchange().expectStatus().isOk();

    Map<String, Object> body = new HashMap<>();
    body.put("actionType", "TEMPORARY_BLOCK");
    body.put("clientId", vip);
    body.put("blockSeconds", 300);
    body.put("trigger", "abuse");
    body.put("reason", "scraper");
    body.put("evidence", evidence());

    GateResponse pending = asAgent().post().uri("/agent/actions")
        .contentType(MediaType.APPLICATION_JSON).bodyValue(body)
        .exchange().expectStatus().isOk()
        .expectBody(GateResponse.class).returnResult().getResponseBody();

    assertNotNull(pending);
    assertEquals(GateDecision.PENDING_APPROVAL, pending.decision());

    // not blocked yet
    asAdmin().get().uri("/admin/rate-limits/" + vip).exchange().expectStatus().isOk()
        .expectBody().jsonPath("$.blocked").isEqualTo(false);

    // approve
    asAdmin().post().uri("/admin/agent/pending/" + pending.actionId() + "/approve")
        .exchange().expectStatus().isOk()
        .expectBody().jsonPath("$.decision").isEqualTo("APPROVED");

    // now blocked
    asAdmin().get().uri("/admin/rate-limits/" + vip).exchange().expectStatus().isOk()
        .expectBody().jsonPath("$.blocked").isEqualTo(true);
  }

  @Test
  void auditTrailRecordsActions() {
    String client = "web-audit-" + System.nanoTime();
    asAdmin().put().uri("/admin/rate-limits/" + client)
        .contentType(MediaType.APPLICATION_JSON)
        .bodyValue(Map.of("capacity", 120, "refillRate", 12.0, "reason", "audit test"))
        .exchange().expectStatus().isOk();

    asAdmin().get().uri("/admin/audit/" + client).exchange().expectStatus().isOk()
        .expectBody().jsonPath("$[0].actionType").isEqualTo("ADJUST_LIMIT")
        .jsonPath("$[0].decision").isEqualTo("APPROVED");
  }
}
