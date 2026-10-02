// Mock implementation of the whole API surface. The api/* adapters delegate here when
// config.useMocks is true, so components are identical in mock and real mode.

import type {
  AgentEvent,
  AgentStatus,
  AuditEvent,
  Client,
  ClientDetail,
  EndpointRow,
  EvaluationResult,
  GateDecision,
  Investigation,
  Kpis,
  Paginated,
  PendingApproval,
  PolicyDecision,
  PolicyGateConfig,
  PolicySummary,
  SimulationResult,
  SystemHealth,
  TrafficSeries,
} from '@/types'
import * as db from './db'

const delay = (ms = 180) => new Promise((r) => setTimeout(r, ms))

export const mockApi = {
  async getKpis(): Promise<Kpis> {
    await delay()
    return {
      totalRequests: 1_240_000,
      totalRequestsDeltaPct: 0.124,
      allowedRequests: 1_170_000,
      allowedPct: 0.945,
      rateLimited: 68_200,
      rateLimitedPct: 0.055,
      activeAnomalies: db.anomalies.length + 11,
      highAnomalies: db.anomalies.filter((a) => a.severity === 'HIGH').length + 1,
      activeClients: 2481,
      activePolicies: db.policies.length,
    }
  },

  async getTopEndpoints(): Promise<EndpointRow[]> {
    await delay()
    return db.endpoints
  },

  async getTraffic(rangeSeconds: number): Promise<TrafficSeries> {
    await delay()
    const points = db.trafficSeries(rangeSeconds)
    return {
      points,
      anomalies: db.anomalies.map((a) => ({
        t: points[Math.floor(points.length * 0.7)].t,
        investigationId: a.id,
        clientId: a.clientId,
        severity: a.severity,
        label: a.label,
      })),
    }
  },

  async getAnomalies() {
    await delay()
    return db.anomalies
  },

  async listClients(opts: {
    search?: string
    risk?: string
    status?: string
    page?: number
    pageSize?: number
    sort?: keyof Client
    dir?: 'asc' | 'desc'
  }): Promise<Paginated<Client>> {
    await delay()
    let rows = [...db.clients]
    if (opts.search) rows = rows.filter((c) => c.clientId.includes(opts.search!.trim()))
    if (opts.risk && opts.risk !== 'all') rows = rows.filter((c) => c.risk === opts.risk)
    if (opts.status && opts.status !== 'all') rows = rows.filter((c) => c.status === opts.status)
    if (opts.sort) {
      const k = opts.sort
      rows.sort((a, b) => {
        const av = a[k] as number | string
        const bv = b[k] as number | string
        const cmp = av < bv ? -1 : av > bv ? 1 : 0
        return opts.dir === 'desc' ? -cmp : cmp
      })
    }
    const total = rows.length
    const page = opts.page ?? 1
    const pageSize = opts.pageSize ?? 10
    return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize }
  },

  async getClient(id: string): Promise<ClientDetail> {
    await delay()
    const c = db.clientDetail(id)
    if (!c) throw new Error(`client ${id} not found`)
    return c
  },

  async listPolicies(): Promise<PolicySummary[]> {
    await delay()
    return db.policies
  },

  async getAgentStatus(): Promise<AgentStatus> {
    await delay()
    return {
      state: db.state.agentOffline ? 'OFFLINE' : db.state.killSwitchEnabled ? 'ACTIVE' : 'IDLE',
      mode: db.state.killSwitchEnabled && !db.state.agentOffline ? 'AUTONOMOUS' : 'DISABLED',
      killSwitchEnabled: db.state.killSwitchEnabled,
      lastActionAt: Date.now() - 1000 * 60 * 3,
      lastAction: 'Increase limit 100 → 150 (client-101)',
      actionsToday: 17,
      successfulActions: 14,
      revertedActions: 2,
      pendingApprovals: db.state.pending.length,
      provider: 'heuristic',
    }
  },

  async getAgentEvents(): Promise<AgentEvent[]> {
    await delay()
    const base = Date.now() - 1000 * 60 * 3
    const mk = (i: number, label: string, kind: AgentEvent['kind'], detail?: string): AgentEvent => ({
      id: `EV-${i}`,
      timestamp: base + i * 3000,
      label,
      kind,
      clientId: 'client-101',
      detail,
    })
    return [
      mk(0, 'Anomaly detected', 'detect', 'request_rate z=4.2'),
      mk(1, 'Historical metrics inspected', 'inspect'),
      mk(2, 'Simulation completed', 'simulate', '429 18.6% → 5.9%'),
      mk(3, 'Policy Gate approved', 'gate', 'within ±50%'),
      mk(4, 'Limit changed', 'act', '100 → 150'),
      mk(100, 'Outcome verified', 'observe', '429 ratio fell'),
      mk(101, 'Action retained', 'keep'),
    ]
  },

  async setKillSwitch(enabled: boolean): Promise<{ killSwitchEnabled: boolean }> {
    await delay()
    db.state.killSwitchEnabled = enabled
    db.state.gateConfig.killSwitchEnabled = enabled
    return { killSwitchEnabled: enabled }
  },

  async setAgentOffline(offline: boolean): Promise<{ agentOffline: boolean }> {
    await delay()
    db.state.agentOffline = offline
    return { agentOffline: offline }
  },

  async listInvestigations(): Promise<Investigation[]> {
    await delay()
    return db.investigations
  },

  async getInvestigation(id: string): Promise<Investigation> {
    await delay()
    const inv = db.investigations.find((i) => i.id === id)
    if (!inv) throw new Error(`investigation ${id} not found`)
    return inv
  },

  async runSimulation(opts: {
    clientId: string
    currentCapacity: number
    proposedCapacity: number
    windowMinutes: number
  }): Promise<SimulationResult> {
    await delay(400)
    const { clientId, currentCapacity, proposedCapacity, windowMinutes } = opts
    const observed = 25200 * windowMinutes
    const simRatioScale = currentCapacity / Math.max(1, proposedCapacity)
    const currentRejected = Math.round(observed * Math.min(0.5, 0.186 * (100 / currentCapacity)))
    const simulatedRejected = Math.round(currentRejected * simRatioScale)
    const curAllowed = observed - currentRejected
    const simAllowed = observed - simulatedRejected
    const currentRejectRatio = currentRejected / observed
    const simulatedRejectRatio = simulatedRejected / observed
    return {
      clientId,
      windowMinutes,
      currentCapacity,
      proposedCapacity,
      currentRefillRate: Math.round(currentCapacity / 10),
      proposedRefillRate: Math.round(proposedCapacity / 10),
      observedRequests: observed,
      currentAllowed: Math.round(curAllowed),
      currentRejected,
      simulatedAllowed: Math.round(simAllowed),
      simulatedRejected,
      currentRejectRatio,
      simulatedRejectRatio,
      rejectReductionPct: currentRejectRatio > 0 ? 1 - simulatedRejectRatio / currentRejectRatio : 0,
    }
  },

  async listAudit(opts: {
    type?: string
    clientId?: string
    search?: string
  }): Promise<AuditEvent[]> {
    await delay()
    let rows = [...db.auditEvents].sort((a, b) => b.timestamp - a.timestamp)
    if (opts.type && opts.type !== 'all') rows = rows.filter((e) => e.type === opts.type)
    if (opts.clientId) rows = rows.filter((e) => e.clientId === opts.clientId)
    if (opts.search) {
      const q = opts.search.toLowerCase()
      rows = rows.filter((e) => e.summary.toLowerCase().includes(q) || (e.clientId ?? '').includes(q))
    }
    return rows
  },

  async listEvaluations(): Promise<EvaluationResult[]> {
    await delay()
    return db.evaluations
  },

  async getHealth(): Promise<SystemHealth> {
    await delay()
    const services = db.services()
    const criticalBad = services.some((s) => s.critical && s.state !== 'HEALTHY')
    const anyBad = services.some((s) => s.state !== 'HEALTHY')
    return {
      overall: criticalBad ? 'OFFLINE' : anyBad ? 'DEGRADED' : 'HEALTHY',
      services,
      rateLimiterIndependent: true,
    }
  },

  async getGateConfig(): Promise<PolicyGateConfig> {
    await delay()
    return { ...db.state.gateConfig, killSwitchEnabled: db.state.killSwitchEnabled }
  },

  async getPolicyDecisions(): Promise<PolicyDecision[]> {
    await delay()
    return db.policyDecisions
  },

  async getPending(): Promise<PendingApproval[]> {
    await delay()
    return db.state.pending
  },

  async resolvePending(actionId: string, decision: 'approve' | 'reject'): Promise<{ decision: GateDecision }> {
    await delay()
    db.state.pending = db.state.pending.filter((p) => p.actionId !== actionId)
    return { decision: decision === 'approve' ? 'APPROVED' : 'REJECTED' }
  },

  async triggerAnomaly(): Promise<{ accepted: boolean }> {
    await delay()
    return { accepted: true }
  },

  async sendTraffic(input: { clientId: string; count: number }): Promise<{
    allowed: number
    limited: number
    errors: number
    other: number
    total: number
  }> {
    await delay(300)
    const n = input.count
    const allowed = Math.min(n, 100 + Math.floor(Math.random() * 20))
    const limited = Math.max(0, n - allowed)
    return { allowed, limited, errors: 0, other: 0, total: n }
  },

  async investigate(input: { clientId: string; metric: string; severity: string; window: string }): Promise<Investigation> {
    await delay(500)
    const base = db.investigations[0]
    const inv: Investigation = {
      ...base,
      id: `INV-${Math.floor(1000 + Math.random() * 9000)}`,
      clientId: input.clientId,
      trigger: input.metric,
      severity: input.severity as Investigation['severity'],
      startedAt: Date.now(),
    }
    // Persist it so the Investigations list and the "View full investigation" detail page can find it.
    db.investigations.unshift(inv)
    return inv
  },
}

export type MockApi = typeof mockApi
