package com.rateguard.metrics;
import reactor.core.publisher.Mono;
public interface TrafficMetricsRepository { Mono<Void> record(TrafficMetric metric); }
