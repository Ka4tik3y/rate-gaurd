package com.rateguard.redis;

import com.rateguard.domain.*;
import java.time.Duration;
import java.util.ArrayList;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@Testcontainers(disabledWithoutDocker = true)
class RedisTokenBucketIntegrationTest {

    static final GenericContainer<?> REDIS = new GenericContainer<>(DockerImageName.parse("redis:7-alpine")).withExposedPorts(6379);

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
    }
    @Autowired
    RedisTokenBucketRepository buckets;

    private RateLimitPolicy policy(long cap, double rate) {
        return new RateLimitPolicy("test", cap, rate, true);
    }

    @Test
    void consumesRejectsAndReturnsRetry() {
        String id = "exhaust-" + System.nanoTime();
        assertTrue(buckets.consume(policy(2, 1), id).block().allowed());
        assertTrue(buckets.consume(policy(2, 1), id).block().allowed());
        RateLimitDecision d = buckets.consume(policy(2, 1), id).block();
        assertFalse(d.allowed());
        assertEquals(0, d.remaining());
        assertEquals(1, d.retryAfter());
    }

    @Test
    void refillsWithoutExceedingCapacity() throws Exception {
        String id = "refill-" + System.nanoTime();
        assertTrue(buckets.consume(policy(2, 20), id).block().allowed());
        Thread.sleep(150);
        RateLimitDecision first = buckets.consume(policy(2, 20), id).block();
        RateLimitDecision second = buckets.consume(policy(2, 20), id).block();
        assertTrue(first.allowed());
        assertTrue(second.allowed());
        assertTrue(first.remaining() <= 1);
        assertFalse(buckets.consume(policy(2, 20), id).block().allowed());
    }

    @Test
    void concurrentCallsCannotOverConsume() throws Exception {
        String id = "concurrent-" + System.nanoTime();
        ExecutorService pool = Executors.newFixedThreadPool(32);
        try {
            var jobs = new ArrayList<Callable<Boolean>>();
            for (int i = 0; i < 100; i++) {
                jobs.add(() -> buckets.consume(policy(10, 0.01), id).block(Duration.ofSeconds(5)).allowed());
            
            }long allowed = pool.invokeAll(jobs).stream().filter(f -> {
                try {
                    return f.get();
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            }).count();
            assertEquals(10, allowed);
        } finally {
            pool.shutdownNow();
        }
    }
}
