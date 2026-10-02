package com.rateguard.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Credentials for the admin and agent roles (spec §34). Defaults are dev-only placeholders and MUST
 * be overridden via environment variables in any real deployment — never commit real secrets.
 */
@ConfigurationProperties("admin.security")
public class AdminSecurityProperties {

  private String adminUsername = "admin";
  private String adminPassword = "admin";
  private String agentUsername = "agent";
  private String agentPassword = "agent";

  public String getAdminUsername() { return adminUsername; }
  public void setAdminUsername(String adminUsername) { this.adminUsername = adminUsername; }
  public String getAdminPassword() { return adminPassword; }
  public void setAdminPassword(String adminPassword) { this.adminPassword = adminPassword; }
  public String getAgentUsername() { return agentUsername; }
  public void setAgentUsername(String agentUsername) { this.agentUsername = agentUsername; }
  public String getAgentPassword() { return agentPassword; }
  public void setAgentPassword(String agentPassword) { this.agentPassword = agentPassword; }
}
