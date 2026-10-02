package com.rateguard.policy;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Agent control. {@code enabled} is the default position of the global kill switch (spec §23); the
 * live value is held in Redis so it can be toggled at runtime and shared across instances. When the
 * switch is off, agent-originated actions cannot execute, but the rate limiter keeps working.
 */
@ConfigurationProperties("agent")
public class AgentProperties {

  private boolean enabled = true;

  public boolean isEnabled() { return enabled; }
  public void setEnabled(boolean enabled) { this.enabled = enabled; }
}
