package com.rateguard.admin.dto;

import java.util.List;

import com.rateguard.policy.ActionType;
import com.rateguard.policy.ClientClassification;
import com.rateguard.policy.GateDecision;
import com.rateguard.policy.PolicyStore;

import reactor.core.publisher.Mono;

/**
 * Request/response DTOs for the admin and agent APIs. Kept separate from domain/internal types so
 * the HTTP contract is explicit and internal records are never exposed directly (spec §35).
 */
public final class Dtos {

  private Dtos() {}

  // ---- requests ----

  public record SetLimitRequest(Long capacity, Double refillRate, String reason) {}

  public record BlockRequest(Long seconds, String reason) {}

  public record SimulateRequest(Long capacity, Double refillRate, Integer windowMinutes) {}

  public record ClassificationRequest(ClientClassification classification) {}

  public record KillSwitchRequest(Boolean enabled) {}

  public record EvidenceDto(String metric, Double currentValue, Double baseline, Double deviation,
                            String severity, String window) {}

  public record AgentActionRequest(
      ActionType actionType,
      String clientId,
      Long newCapacity,
      Double newRefillRate,
      Long blockSeconds,
      String alertMessage,
      String trigger,
      String reason,
      EvidenceDto evidence) {}

  // ---- responses ----

  /**
   * A client's current rate-limit state. {@code overrideTtlSeconds} is how long an agent-set limit
   * has left (-1 = permanent or none); {@code recentlyBlocked} and {@code agentMaxCapacity} tell the
   * agent what the Policy Gate will refuse before it proposes anything.
   */
  public record RateLimitView(String clientId, String policy, long capacity, double refillRate,
                              boolean blocked, long blockTtlSeconds, ClientClassification classification,
                              long overrideTtlSeconds, boolean recentlyBlocked, long agentMaxCapacity) {

    public static Mono<RateLimitView> of(String clientId, PolicyStore store, long agentMaxCapacity) {
      return Mono.zip(
              store.effectivePolicy(clientId),
              store.isBlocked(clientId),
              store.blockTtlSeconds(clientId),
              store.classification(clientId),
              store.overrideTtlSeconds(clientId),
              store.recentlyBlocked(clientId))
          .map(t -> new RateLimitView(clientId, t.getT1().name(), t.getT1().capacity(),
              t.getT1().refillRate(), t.getT2(), t.getT3(), t.getT4(), t.getT5(), t.getT6(), agentMaxCapacity));
    }
  }

  public record GateResponse(GateDecision decision, String actionId, List<String> reasons,
                             Long appliedCapacity, Double appliedRefillRate, Long appliedBlockSeconds) {}

  public record MetricsView(String clientId, int windowMinutes, long requests, long rejected, long errors,
                            double requestRatePerMinute, double rejectedRatio, double errorRatio,
                            double avgLatencyMillis, long uniqueEndpoints, double burstiness) {}

  public record AgentStatusView(boolean agentEnabled, int pendingApprovals, int recentAnomalies) {}

  public record SimpleResponse(String status, String message) {}
}
