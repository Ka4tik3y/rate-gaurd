package com.rateguard.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import org.junit.jupiter.api.Test;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.rateguard.config.RateLimitProperties;
import com.rateguard.redis.RedisTokenBucketRepository;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import reactor.core.publisher.Mono;

class DefaultRateLimitServiceTest {

    @Test
    void redisFailureOpenAllows() {
        assertFailureMode(RateLimitProperties.FailureMode.FAIL_OPEN, true);
    }

    @Test
    void redisFailureClosedRejects() {
        assertFailureMode(RateLimitProperties.FailureMode.FAIL_CLOSED, false);
    }

    private void assertFailureMode(RateLimitProperties.FailureMode mode, boolean expected) {
        RateLimitProperties p = new RateLimitProperties();
        p.getRedis().setFailureMode(mode);
        RedisTokenBucketRepository r = mock(RedisTokenBucketRepository.class);
        when(r.consume(any(), any())).thenReturn(Mono.error(new RuntimeException("redis unavailable")));
        assertEquals(expected, new DefaultRateLimitService(r, p, new SimpleMeterRegistry()).check("client", "/api/x").block().allowed());
    }
}
