package com.rateguard.redis;

/**
 * Central definition of Redis key names so the rate-limiter (which reads them in Lua) and the
 * policy/admin layer (which writes them) can never drift apart. Every per-client key uses a
 * {@code {clientId}} hash tag so all keys for one client co-locate on the same slot under Redis
 * Cluster, which keeps the multi-key Lua script valid there too.
 *
 * <p>Namespaces are kept strictly separate: {@code rl:*} is rate-limit state, {@code policy:*} is
 * the policy/guardrail layer, {@code metric:*} is traffic metrics, {@code audit:*} is the audit log.
 */
public final class RedisKeys {

  private RedisKeys() {}

  public static String bucket(String clientId) {
    return "rl:bucket:{" + clientId + "}";
  }

  public static String override(String clientId) {
    return "policy:override:{" + clientId + "}";
  }

  public static String block(String clientId) {
    return "policy:block:{" + clientId + "}";
  }

  public static String classification(String clientId) {
    return "policy:class:{" + clientId + "}";
  }

  public static String cooldown(String clientId) {
    return "policy:cooldown:{" + clientId + "}";
  }

  public static String actionCount(String clientId) {
    return "policy:actions:{" + clientId + "}";
  }

  public static String pendingAction(String actionId) {
    return "policy:pending:" + actionId;
  }

  public static final String PENDING_INDEX = "policy:pending:index";

  public static String auditClient(String clientId) {
    return "audit:{" + clientId + "}";
  }

  public static final String AUDIT_ALL = "audit:all";
}
