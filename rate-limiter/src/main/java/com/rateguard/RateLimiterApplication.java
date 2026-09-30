package com.rateguard;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

import com.rateguard.config.RateLimitProperties;
import com.rateguard.metrics.MetricsProperties;

@SpringBootApplication
@EnableConfigurationProperties({RateLimitProperties.class, MetricsProperties.class})
public class RateLimiterApplication {

    public static void main(String[] args) {
        SpringApplication.run(RateLimiterApplication.class, args);
    }
}
