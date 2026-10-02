package com.rateguard;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;

import com.rateguard.anomaly.AnomalyProperties;
import com.rateguard.config.RateLimitProperties;
import com.rateguard.metrics.MetricsProperties;

@SpringBootApplication
@EnableScheduling
@EnableConfigurationProperties({RateLimitProperties.class, MetricsProperties.class, AnomalyProperties.class})
public class RateLimiterApplication {

    public static void main(String[] args) {
        SpringApplication.run(RateLimiterApplication.class, args);
    }
}
