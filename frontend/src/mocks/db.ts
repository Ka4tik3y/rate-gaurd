// Deterministic in-memory dataset + mutable demo state for mock mode.
// Components never import this directly — only the mock API layer does.

import type {
  Anomaly,
  AuditEvent,
  Client,
  ClientDetail,
  EndpointRow,
  EvaluationResult,
  Investigation,
  PendingApproval,
  PolicyDecision,
  PolicyGateConfig,
  PolicySummary,
  ServiceHealth,
  TrafficPoint,
} from '@/types'

// --- tiny seeded PRNG (mulberry32) for reproducible shapes --------------------
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function trafficSeries(seconds: number, points = 120): TrafficPoint[] {
  const r = rng(seconds + 7)
  const now = Date.now()
  const step = (seconds * 1000) / points
  const out: TrafficPoint[] = []
  for (let i = 0; i < points; i++) {
    const t = now - (points - 1 - i) * step
    const base = 900 + Math.sin(i / 9) * 180 + r() * 120
    const spike = i > points * 0.62 && i < points * 0.78 ? 650 : 0
    const requests = Math.round(base + spike)
    const rejectRate = Math.min(0.4, 0.03 + (spike > 0 ? 0.14 : 0) + r() * 0.02)
    const errorRate = Math.min(0.08, 0.004 + (spike > 0 ? 0.01 : 0) + r() * 0.004)
    const limited = Math.round(requests * rejectRate)
    out.push({ t, requests, allowed: requests - limited, limited, rejectRate, errorRate })
  }
  return out
}

export const anomalies: Anomaly[] = [
  {
    id: 'INV-1042',
    clientId: 'client-101',
    metric: 'request_rate',
    label: 'Request rate anomaly',
    currentValue: 420,
    baseline: 80,
    zScore: 4.2,
    severity: 'HIGH',
    window: '10m',
    detectedAt: Date.now() - 1000 * 60 * 3,
  },
  {
    id: 'INV-1041',
    clientId: 'client-331',
    metric: 'reject_ratio',
    label: 'Elevated 429 ratio',
    currentValue: 0.124,
    baseline: 0.03,
    zScore: 2.6,
    severity: 'MEDIUM',
    window: '5m',
    detectedAt: Date.now() - 1000 * 60 * 8,
  },
  {
    id: 'INV-1039',
    clientId: 'client-512',
    metric: 'slow_and_low',
    label: 'Endpoint enumeration',
    currentValue: 34,
    baseline: 4,
    zScore: 3.1,
    severity: 'HIGH',
    window: '10m',
    detectedAt: Date.now() - 1000 * 60 * 21,
  },
]

export const endpoints: EndpointRow[] = [
  { endpoint: '/api/orders', requestsPerSec: 320, rejectRate: 0.042, errorRate: 0.003, latencyMs: 82, status: 'Healthy' },
  { endpoint: '/api/search', requestsPerSec: 280, rejectRate: 0.081, errorRate: 0.006, latencyMs: 120, status: 'Warning' },
  { endpoint: '/api/login', requestsPerSec: 110, rejectRate: 0.154, errorRate: 0.022, latencyMs: 96, status: 'Critical' },
  { endpoint: '/api/products', requestsPerSec: 240, rejectRate: 0.021, errorRate: 0.002, latencyMs: 61, status: 'Healthy' },
  { endpoint: '/api/cart', requestsPerSec: 150, rejectRate: 0.035, errorRate: 0.004, latencyMs: 74, status: 'Healthy' },
]

export const clients: Client[] = [
  { clientId: 'client-101', requestsPerSec: 420, rejectRatio: 0.182, errorRatio: 0.021, currentLimit: 100, baseline: 80, status: 'ACTIVE', risk: 'HIGH', classification: 'NORMAL' },
  { clientId: 'client-204', requestsPerSec: 180, rejectRatio: 0.012, errorRatio: 0.003, currentLimit: 200, baseline: 175, status: 'ACTIVE', risk: 'NORMAL', classification: 'HIGH_VALUE' },
  { clientId: 'client-331', requestsPerSec: 96, rejectRatio: 0.124, errorRatio: 0.008, currentLimit: 100, baseline: 70, status: 'ACTIVE', risk: 'ELEVATED', classification: 'NORMAL' },
  { clientId: 'client-512', requestsPerSec: 4, rejectRatio: 0.0, errorRatio: 0.0, currentLimit: 100, baseline: 5, status: 'ACTIVE', risk: 'HIGH', classification: 'NORMAL' },
  { clientId: 'client-620', requestsPerSec: 60, rejectRatio: 0.004, errorRatio: 0.001, currentLimit: 100, baseline: 55, status: 'ACTIVE', risk: 'NORMAL', classification: 'NORMAL' },
  { clientId: 'client-733', requestsPerSec: 12, rejectRatio: 0.0, errorRatio: 0.0, currentLimit: 100, baseline: 15, status: 'IDLE', risk: 'NORMAL', classification: 'NORMAL' },
  { clientId: 'client-884', requestsPerSec: 210, rejectRatio: 0.066, errorRatio: 0.012, currentLimit: 150, baseline: 160, status: 'ACTIVE', risk: 'ELEVATED', classification: 'HIGH_VALUE' },
  { clientId: 'client-905', requestsPerSec: 0, rejectRatio: 0.0, errorRatio: 0.0, currentLimit: 100, baseline: 40, status: 'BLOCKED', risk: 'HIGH', classification: 'NORMAL' },
]

export function clientDetail(id: string): ClientDetail | undefined {
  const c = clients.find((x) => x.clientId === id)
  if (!c) return undefined
  const history = trafficSeries(600, 60).map((p) => ({ ...p }))
  return {
    ...c,
    anomalyThreshold: c.baseline * 2.5,
    policy: {
      policyName: c.classification === 'HIGH_VALUE' ? 'premium' : 'default',
      capacity: c.currentLimit,
      refillRate: Math.round(c.currentLimit / 10),
      algorithm: 'Token Bucket',
      status: c.status === 'BLOCKED' ? 'BLOCKED' : 'ACTIVE',
      lastModified: Date.now() - 1000 * 60 * 6,
      modifiedBy: c.risk === 'HIGH' ? 'Agent' : 'Admin',
    },
    history,
    recentActions:
      c.risk === 'HIGH'
        ? [
            { timestamp: Date.now() - 1000 * 60 * 6, action: 'Limit changed', detail: '100 → 150', actor: 'Agent', result: 'APPROVED' },
            { timestamp: Date.now() - 1000 * 60 * 40, action: 'Alert raised', detail: 'request spike', actor: 'Agent', result: 'APPROVED' },
          ]
        : [],
  }
}

export const policies: PolicySummary[] = [
  { policyName: 'default', capacity: 100, refillRate: 10, algorithm: 'Token Bucket', clients: 1932, status: 'ACTIVE', lastModified: Date.now() - 1000 * 60 * 60 * 26, modifiedBy: 'Admin' },
  { policyName: 'premium', capacity: 500, refillRate: 50, algorithm: 'Token Bucket', clients: 412, status: 'ACTIVE', lastModified: Date.now() - 1000 * 60 * 60 * 50, modifiedBy: 'Admin' },
  { policyName: 'login', capacity: 20, refillRate: 2, algorithm: 'Token Bucket', clients: 1103, status: 'ACTIVE', lastModified: Date.now() - 1000 * 60 * 60 * 72, modifiedBy: 'Admin' },
  { policyName: 'internal', capacity: 1000, refillRate: 100, algorithm: 'Token Bucket', clients: 34, status: 'ACTIVE', lastModified: Date.now() - 1000 * 60 * 60 * 120, modifiedBy: 'Admin' },
]

export const investigations: Investigation[] = [
  buildInvestigation('INV-1042', 'client-101', 'Request spike', 'HIGH', 'MONITORING', 'ADJUST_LIMIT', 'NA', 'PENDING', 3),
  buildInvestigation('INV-1041', 'client-331', 'Elevated 429 ratio', 'MEDIUM', 'COMPLETED', 'ADJUST_LIMIT', 'IMPROVED', 'KEPT', 8),
  buildInvestigation('INV-1039', 'client-512', 'Endpoint enumeration', 'HIGH', 'COMPLETED', 'TEMPORARY_BLOCK', 'IMPROVED', 'KEPT', 21),
  buildInvestigation('INV-1037', 'client-884', 'Error spike', 'MEDIUM', 'COMPLETED', 'ALERT', 'NA', 'KEPT', 42),
  buildInvestigation('INV-1035', 'client-101', 'Request spike', 'HIGH', 'REVERTED', 'ADJUST_LIMIT', 'WORSE', 'REVERTED', 90),
]

function buildInvestigation(
  id: string,
  clientId: string,
  trigger: string,
  severity: Investigation['severity'],
  status: Investigation['status'],
  actionType: Investigation['proposal']['actionType'],
  outcome: Investigation['outcome'],
  finalState: Investigation['finalState'],
  minutesAgo: number,
): Investigation {
  const started = Date.now() - minutesAgo * 60 * 1000
  const t = (offsetSec: number) => started + offsetSec * 1000
  const adjust = actionType === 'ADJUST_LIMIT'
  const done = status === 'COMPLETED' || status === 'REVERTED'
  const steps: Investigation['steps'] = [
    { key: 'detect', label: 'Anomaly detected', status: 'done', timestamp: t(0), summary: `${trigger} on ${clientId}` },
    { key: 'metrics', label: 'Metrics inspected', status: 'done', timestamp: t(3), summary: 'Pulled 1/5/10m windows' },
    { key: 'baseline', label: 'Historical baseline', status: 'done', timestamp: t(5), summary: 'Compared against EWMA baseline' },
    { key: 'simulate', label: 'Simulation', status: adjust ? 'done' : 'skipped', timestamp: adjust ? t(8) : undefined, summary: adjust ? 'Dry-run of proposed limit' : 'Not a limit change' },
    { key: 'propose', label: 'Action proposed', status: 'done', timestamp: t(10), summary: actionLabel(actionType) },
    { key: 'gate', label: 'Policy Gate', status: 'done', timestamp: t(12), summary: finalState === 'PENDING' ? 'Held for approval' : finalState === 'REJECTED' ? 'Rejected' : 'Approved' },
    { key: 'act', label: 'Action executed', status: finalState === 'PENDING' || finalState === 'REJECTED' ? 'skipped' : 'done', timestamp: t(14), summary: actionLabel(actionType) },
    { key: 'observe', label: 'Outcome check', status: done ? 'done' : status === 'MONITORING' ? 'active' : 'pending', timestamp: done ? t(300) : undefined, summary: done ? `429 ratio ${outcome === 'WORSE' ? 'rose' : 'fell'}` : 'Observing…' },
    { key: 'final', label: finalState === 'REVERTED' ? 'Action reverted' : 'Action retained', status: done ? 'done' : 'pending', timestamp: done ? t(302) : undefined, summary: finalState },
  ]
  return {
    id,
    clientId,
    trigger,
    severity,
    status,
    steps,
    action: actionLabel(actionType),
    outcome,
    finalState,
    startedAt: started,
    gateDecision: finalState === 'PENDING' ? 'PENDING_APPROVAL' : finalState === 'REJECTED' ? 'REJECTED' : 'APPROVED',
    gateReasons: finalState === 'PENDING' ? ['high-value client: approval required'] : ['within automatic-change bounds'],
    evidence: {
      requestRate: clientId === 'client-101' ? 420 : 96,
      baseline: clientId === 'client-101' ? 80 : 70,
      deviationPct: clientId === 'client-101' ? 4.25 : 0.37,
      zScore: severity === 'HIGH' ? 4.2 : 2.6,
      rejectRatio: 0.182,
      errorRatio: 0.021,
      window: '10 minutes',
    },
    proposal: {
      actionType,
      summary: actionLabel(actionType),
      fromCapacity: adjust ? 100 : undefined,
      toCapacity: adjust ? 150 : undefined,
      blockSeconds: actionType === 'TEMPORARY_BLOCK' ? 600 : undefined,
      reason:
        'Traffic increased substantially above baseline. Historical simulation indicates the proposed limit reduces legitimate 429 responses while remaining within the configured automatic-change boundary.',
    },
    simulation: adjust
      ? {
          clientId,
          windowMinutes: 10,
          currentCapacity: 100,
          proposedCapacity: 150,
          currentRefillRate: 10,
          proposedRefillRate: 15,
          observedRequests: 252000,
          currentAllowed: 205000,
          currentRejected: 47000,
          simulatedAllowed: 237000,
          simulatedRejected: 15000,
          currentRejectRatio: 0.186,
          simulatedRejectRatio: 0.059,
          rejectReductionPct: 0.68,
        }
      : undefined,
  }
}

function actionLabel(a: Investigation['proposal']['actionType']): string {
  if (a === 'ADJUST_LIMIT') return 'Increase limit 100 → 150'
  if (a === 'TEMPORARY_BLOCK') return 'Temporary block 600s'
  return 'Raise alert'
}

export const policyDecisions: PolicyDecision[] = [
  { id: 'PD-5001', timestamp: Date.now() - 1000 * 60 * 3, clientId: 'client-101', requestedAction: 'Increase limit 100 → 150', decision: 'APPROVED', reason: 'Within ±50% bounds', source: 'AGENT' },
  { id: 'PD-5000', timestamp: Date.now() - 1000 * 60 * 9, clientId: 'client-204', requestedAction: 'Block 60 min', decision: 'REJECTED', reason: 'Maximum block duration exceeded', source: 'AGENT' },
  { id: 'PD-4999', timestamp: Date.now() - 1000 * 60 * 14, clientId: 'client-884', requestedAction: 'Temporary block', decision: 'PENDING_APPROVAL', reason: 'High-value client', source: 'AGENT' },
  { id: 'PD-4998', timestamp: Date.now() - 1000 * 60 * 26, clientId: 'client-331', requestedAction: 'Increase limit 100 → 300', decision: 'REJECTED', reason: 'Change exceeds ±50%', source: 'AGENT' },
]

export const auditEvents: AuditEvent[] = [
  { id: 'A-9001', timestamp: Date.now() - 1000 * 60 * 3, type: 'ANOMALY', clientId: 'client-101', summary: 'Request rate anomaly (z=4.2)' },
  { id: 'A-9002', timestamp: Date.now() - 1000 * 60 * 3 + 7000, type: 'INVESTIGATION', clientId: 'client-101', summary: 'Investigation INV-1042 started' },
  { id: 'A-9003', timestamp: Date.now() - 1000 * 60 * 3 + 14000, type: 'SIMULATION', clientId: 'client-101', summary: 'Limit 100 → 150 dry-run (429 18.6% → 5.9%)' },
  { id: 'A-9004', timestamp: Date.now() - 1000 * 60 * 3 + 17000, type: 'POLICY', clientId: 'client-101', summary: 'Policy Gate decision', decision: 'APPROVED' },
  { id: 'A-9005', timestamp: Date.now() - 1000 * 60 * 3 + 19000, type: 'ACTION', clientId: 'client-101', summary: 'Limit changed 100 → 150' },
  { id: 'A-9006', timestamp: Date.now() - 1000 * 60 * 3 + 320000, type: 'OUTCOME', clientId: 'client-101', summary: 'Outcome verified', decision: 'IMPROVED' },
  { id: 'A-9007', timestamp: Date.now() - 1000 * 60 * 90, type: 'ROLLBACK', clientId: 'client-101', summary: 'Change reverted — outcome worse than baseline' },
  { id: 'A-9008', timestamp: Date.now() - 1000 * 60 * 21, type: 'ACTION', clientId: 'client-512', summary: 'Temporary block 600s (slow-and-low)' },
]

// Evaluation numbers mirror the committed harness run (evaluation/results/results.md).
export const evaluations: EvaluationResult[] = [
  {
    scenario: 'scraper_burst',
    name: 'Scraper Burst',
    description: 'A scraper sends a normal baseline, then bursty high-volume traffic.',
    rows: [
      { metric: 'Abuse block rate', static: '69.3%', adaptive: '79.1%', better: 'adaptive' },
      { metric: 'Legitimate blocked', static: 0, adaptive: 0, better: 'equal' },
      { metric: 'Agent actions', static: 0, adaptive: 3, better: 'adaptive' },
      { metric: 'Rollbacks', static: '—', adaptive: 0, better: 'equal' },
    ],
  },
  {
    scenario: 'legit_spike',
    name: 'Legitimate Traffic Spike',
    description: "A legitimate client's steady traffic rises above the static limit.",
    rows: [
      { metric: 'False blocks (legit)', static: '26.3%', adaptive: '2.1%', better: 'adaptive' },
      { metric: 'Agent actions', static: 0, adaptive: 3, better: 'adaptive' },
      { metric: 'Rollbacks', static: '—', adaptive: 1, better: 'equal' },
    ],
  },
  {
    scenario: 'slow_and_low',
    name: 'Slow-and-Low Abuse',
    description: 'A client probes many endpoints at a deliberately low rate.',
    rows: [
      { metric: 'Abuse block rate', static: '0.0%', adaptive: '83.3%', better: 'adaptive' },
      { metric: 'Time to mitigate', static: '—', adaptive: '60s', better: 'adaptive' },
    ],
  },
  {
    scenario: 'noisy_tenant',
    name: 'Noisy Tenant',
    description: 'A high-value tenant becomes noisy and bursty.',
    rows: [
      { metric: 'False blocks', static: '54.3%', adaptive: '49.2%', better: 'adaptive' },
      { metric: 'Pending approvals', static: 0, adaptive: 3, better: 'adaptive' },
      { metric: 'Auto-blocks of VIP', static: 0, adaptive: 0, better: 'equal' },
    ],
  },
  {
    scenario: 'error_spike',
    name: 'API Error Spike',
    description: 'The downstream service starts returning 5xx for a client.',
    rows: [
      { metric: 'Alerts raised', static: 0, adaptive: 17, better: 'adaptive' },
      { metric: 'Wrongful throttles', static: 0, adaptive: 0, better: 'equal' },
      { metric: '5xx served', static: 3240, adaptive: 3240, better: 'equal' },
    ],
  },
]

// --- mutable demo state -------------------------------------------------------
export interface GateState {
  config: PolicyGateConfig
  decisions: PolicyDecision[]
  pending: PendingApproval[]
}

export const state = {
  killSwitchEnabled: true,
  agentOffline: false,
  gateConfig: {
    maxChangeRatio: 0.5,
    maxBlockSeconds: 3600,
    cooldownSeconds: 60,
    highValueApprovalRequired: true,
    killSwitchEnabled: true,
    minEvidenceDeviation: 2.0,
    maxActionsPerWindow: 10,
  } as PolicyGateConfig,
  pending: [
    {
      actionId: 'ACT-7721',
      clientId: 'client-884',
      actionType: 'TEMPORARY_BLOCK',
      requestedAt: Date.now() - 1000 * 60 * 14,
      reason: 'High-value client: approval required',
      detail: 'Temporary block 600s — bursty, heavily rejected',
    },
  ] as PendingApproval[],
}

export function services(): ServiceHealth[] {
  const agentState: ServiceHealth['state'] = state.agentOffline ? 'OFFLINE' : 'HEALTHY'
  return [
    { name: 'Spring Boot Gateway', state: 'HEALTHY', detail: 'All routes responding', critical: true },
    { name: 'Rate Limiter', state: 'HEALTHY', detail: 'Processing traffic', critical: true },
    { name: 'Redis', state: 'HEALTHY', detail: 'Connected, 3 nodes', critical: true },
    { name: 'Traffic Metrics', state: 'HEALTHY', detail: 'Aggregating', critical: false },
    { name: 'Anomaly Detector', state: 'HEALTHY', detail: 'EWMA + rules active', critical: false },
    { name: 'Policy Gate', state: 'HEALTHY', detail: 'Validating mutations', critical: false },
    { name: 'AI Agent', state: agentState, detail: state.agentOffline ? 'Service unreachable' : 'Autonomous mode', critical: false },
  ]
}
