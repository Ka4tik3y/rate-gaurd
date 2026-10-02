package com.rateguard.policy;

import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.stereotype.Service;

import reactor.core.publisher.Mono;

/**
 * Holds the live kill-switch state (spec §23). Stored in Redis so a toggle is shared across all
 * gateway instances and survives restarts; falls back to the configured default when unset. The
 * Policy Gate consults this before executing any agent-originated action.
 */
@Service
public class AgentControlService {

  private static final String KEY = "agent:enabled";

  private final ReactiveStringRedisTemplate redis;
  private final AgentProperties properties;

  public AgentControlService(ReactiveStringRedisTemplate redis, AgentProperties properties) {
    this.redis = redis;
    this.properties = properties;
  }

  /** True when agent actions are permitted. Defaults to the configured value if never toggled. */
  public Mono<Boolean> isAgentEnabled() {
    return redis.opsForValue().get(KEY)
        .map(Boolean::parseBoolean)
        .defaultIfEmpty(properties.isEnabled())
        .onErrorReturn(properties.isEnabled());
  }

  public Mono<Void> setAgentEnabled(boolean enabled) {
    return redis.opsForValue().set(KEY, Boolean.toString(enabled)).then();
  }
}
