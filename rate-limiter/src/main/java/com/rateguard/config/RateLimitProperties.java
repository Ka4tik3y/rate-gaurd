package com.rateguard.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("rate-limit")
public class RateLimitProperties {
  private boolean enabled = true; private DefaultPolicy defaultPolicy = new DefaultPolicy(); private Identifier identifier = new Identifier(); private Redis redis = new Redis();
  public boolean isEnabled(){return enabled;} public void setEnabled(boolean enabled){this.enabled=enabled;}
  public DefaultPolicy getDefault(){return defaultPolicy;} public void setDefault(DefaultPolicy value){this.defaultPolicy=value;}
  public Identifier getIdentifier(){return identifier;} public void setIdentifier(Identifier value){this.identifier=value;}
  public Redis getRedis(){return redis;} public void setRedis(Redis value){this.redis=value;}
  public static class DefaultPolicy { private long capacity=100; private double refillRate=10; public long getCapacity(){return capacity;} public void setCapacity(long v){capacity=v;} public double getRefillRate(){return refillRate;} public void setRefillRate(double v){refillRate=v;} }
  public static class Identifier { private String type="IP"; public String getType(){return type;} public void setType(String v){type=v;} }
  public static class Redis { private FailureMode failureMode=FailureMode.FAIL_OPEN; public FailureMode getFailureMode(){return failureMode;} public void setFailureMode(FailureMode v){failureMode=v;} }
  public enum FailureMode { FAIL_OPEN, FAIL_CLOSED }
}
