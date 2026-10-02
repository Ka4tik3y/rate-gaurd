package com.rateguard.audit;

import java.util.List;

import reactor.core.publisher.Mono;

/** Append-only audit trail of every action and attempted action. */
public interface AuditLog {

  Mono<Void> record(AuditEntry entry);

  /** Most recent entries for one client, newest first. */
  Mono<List<AuditEntry>> recent(String clientId, int limit);

  /** Most recent entries across all clients, newest first. */
  Mono<List<AuditEntry>> recentAll(int limit);
}
