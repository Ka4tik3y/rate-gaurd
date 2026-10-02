package com.rateguard.policy;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import com.rateguard.domain.RateLimitDecision;
import com.rateguard.domain.RateLimitPolicy;
import com.rateguard.redis.RedisTokenBucketRepository;

/**
 * Proves the Phase 3 dynamic-policy wiring: a per-client override and a temporary block written by
 * the policy layer take effect in the atomic Lua token-bucket on the very next request.
 */
@SpringBootTest
@Testcontainers(disabledWithoutDocker = true)
class DynamicRateLimitIntegrationTest {

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

  @Autowired RedisTokenBucketRepository buckets;
  @Autowired PolicyStore store;

  // The default policy passed to consume; the Lua script applies any override on top of it.
  private final RateLimitPolicy defaultPolicy = new RateLimitPolicy("default", 100, 10, true);

  @Test
  void overrideLowersEffectiveCapacity() {
    String id = "override-" + System.nanoTime();
    store.setLimit(id, 1, 0.001).block();

    RateLimitDecision first = buckets.consume(defaultPolicy, id).block();
    RateLimitDecision second = buckets.consume(defaultPolicy, id).block();

    assertTrue(first.allowed(), "first request within override capacity 1 is allowed");
    assertFalse(second.allowed(), "second request exceeds override capacity 1");
    assertEquals(1, first.limit(), "decision reflects the effective (override) capacity");
  }

  @Test
  void blockRejectsAllRequestsUntilUnblocked() {
    String id = "block-" + System.nanoTime();
    store.block(id, 60).block();

    RateLimitDecision blocked = buckets.consume(defaultPolicy, id).block();
    assertFalse(blocked.allowed());
    assertTrue(blocked.blocked(), "decision is flagged as a block, not ordinary exhaustion");
    assertTrue(blocked.retryAfter() > 0);

    store.unblock(id).block();
    assertTrue(buckets.consume(defaultPolicy, id).block().allowed(), "unblock restores traffic");
  }

  @Test
  void clearingOverrideRestoresDefaultCapacity() {
    String id = "clear-" + System.nanoTime();
    store.setLimit(id, 1, 0.001).block();
    assertEquals(1, buckets.consume(defaultPolicy, id).block().limit());

    store.clearLimit(id).block();
    assertEquals(100, buckets.consume(defaultPolicy, id).block().limit(), "reverts to default capacity");
  }
}
