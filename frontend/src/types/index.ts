// Strongly typed domain models shared across the dashboard.

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH'
export type RiskLevel = 'NORMAL' | 'ELEVATED' | 'HIGH'
export type ClientStatus = 'ACTIVE' | 'IDLE' | 'BLOCKED'
export type HealthState = 'HEALTHY' | 'DEGRADED' | 'OFFLINE'
export type EndpointStatus = 'Healthy' | 'Warning' | 'Critical'
export type Classification = 'NORMAL' | 'HIGH_VALUE'

export type GateDecision = 'APPROVED' | 'REJECTED' | 'PENDING_APPROVAL'
export type ActionType = 'ADJUST_LIMIT' | 'TEMPORARY_BLOCK' | 'ALERT'
export type InvestigationStatus = 'RUNNING' | 'MONITORING' | 'COMPLETED' | 'REVERTED' | 'FAILED'
export type Outcome = 'IMPROVED' | 'UNCHANGED' | 'WORSE' | 'NA'
export type FinalState = 'KEPT' | 'REVERTED' | 'PENDING' | 'REJECTED' | 'NONE' | 'ERROR'
export type AgentMode = 'AUTONOMOUS' | 'SUPERVISED' | 'DISABLED'

export interface Kpis {
  totalRequests: number
  totalRequestsDeltaPct: number
  allowedRequests: number
  allowedPct: number
  rateLimited: number
  rateLimitedPct: number
  activeAnomalies: number
  highAnomalies: number
  activeClients: number
  activePolicies: number
}

export interface TrafficPoint {
  t: number // epoch ms
  requests: number // per second
  allowed: number
  limited: number
  errorRate: number // 0..1 (4xx/5xx share)
  rejectRate: number // 0..1 (429 share)
}

export interface AnomalyMarker {
  t: number
  investigationId: string
  clientId: string
  severity: Severity
  label: string
}

export interface TrafficSeries {
  points: TrafficPoint[]
  anomalies: AnomalyMarker[]
}

export interface EndpointRow {
  endpoint: string
  requestsPerSec: number
  rejectRate: number
  errorRate: number
  latencyMs: number
  status: EndpointStatus
}

export interface Anomaly {
  id: string // investigation id it maps to
  clientId: string
  metric: string
  label: string
  currentValue: number
  baseline: number
  zScore: number
  severity: Severity
  window: string
  detectedAt: number
}

export interface Client {
  clientId: string
  requestsPerSec: number
  rejectRatio: number
  errorRatio: number
  currentLimit: number
  baseline: number
  status: ClientStatus
  risk: RiskLevel
  classification: Classification
}

export interface PolicySummary {
  policyName: string
  capacity: number
  refillRate: number
  algorithm: string
  clients: number
  status: 'ACTIVE' | 'DRAFT'
  lastModified: number
  modifiedBy: string
}

export interface ClientPolicy {
  policyName: string
  capacity: number
  refillRate: number
  algorithm: string
  status: string
  lastModified: number
  modifiedBy: string
}

export interface ClientAction {
  timestamp: number
  action: string
  detail: string
  actor: 'Agent' | 'Admin'
  result: GateDecision
}

export interface ClientDetail extends Client {
  policy: ClientPolicy
  history: TrafficPoint[]
  recentActions: ClientAction[]
  anomalyThreshold: number
}

export interface Evidence {
  requestRate: number
  baseline: number
  deviationPct: number
  zScore: number
  rejectRatio: number
  errorRatio: number
  window: string
}

export interface InvestigationStep {
  key: string
  label: string
  status: 'done' | 'active' | 'pending' | 'skipped'
  timestamp?: number
  summary?: string
}

export interface Proposal {
  actionType: ActionType
  summary: string
  fromCapacity?: number
  toCapacity?: number
  blockSeconds?: number
  reason: string
}

export interface SimulationResult {
  clientId: string
  windowMinutes: number
  currentCapacity: number
  proposedCapacity: number
  currentRefillRate: number
  proposedRefillRate: number
  observedRequests: number
  currentAllowed: number
  currentRejected: number
  simulatedAllowed: number
  simulatedRejected: number
  currentRejectRatio: number
  simulatedRejectRatio: number
  rejectReductionPct: number
}

export interface Investigation {
  id: string
  clientId: string
  trigger: string
  severity: Severity
  status: InvestigationStatus
  action: string
  outcome: Outcome
  finalState: FinalState
  startedAt: number
  evidence: Evidence
  steps: InvestigationStep[]
  proposal: Proposal
  simulation?: SimulationResult
  gateDecision: GateDecision
  gateReasons: string[]
}

export interface AgentStatus {
  state: 'ACTIVE' | 'IDLE' | 'OFFLINE'
  mode: AgentMode
  killSwitchEnabled: boolean
  lastActionAt?: number
  lastAction?: string
  actionsToday: number
  successfulActions: number
  revertedActions: number
  pendingApprovals: number
  provider: string
}

export interface AgentEvent {
  id: string
  timestamp: number
  label: string
  clientId?: string
  detail?: string
  kind: 'detect' | 'inspect' | 'simulate' | 'gate' | 'act' | 'observe' | 'keep' | 'revert'
}

export interface PolicyGateConfig {
  maxChangeRatio: number // 0.5 => ±50%
  maxBlockSeconds: number
  cooldownSeconds: number
  highValueApprovalRequired: boolean
  killSwitchEnabled: boolean
  minEvidenceDeviation: number
  maxActionsPerWindow: number
}

export interface PolicyDecision {
  id: string
  timestamp: number
  clientId: string
  requestedAction: string
  decision: GateDecision
  reason: string
  source: 'AGENT' | 'ADMIN'
}

export interface PendingApproval {
  actionId: string
  clientId: string
  actionType: ActionType
  requestedAt: number
  reason: string
  detail: string
}

export type AuditEventType =
  | 'ANOMALY'
  | 'INVESTIGATION'
  | 'SIMULATION'
  | 'POLICY'
  | 'ACTION'
  | 'OUTCOME'
  | 'ROLLBACK'

export interface AuditEvent {
  id: string
  timestamp: number
  type: AuditEventType
  clientId?: string
  summary: string
  decision?: GateDecision | Outcome
}

export type ScenarioId =
  | 'scraper_burst'
  | 'legit_spike'
  | 'slow_and_low'
  | 'noisy_tenant'
  | 'error_spike'

export interface EvaluationMetricRow {
  metric: string
  static: number | string
  adaptive: number | string
  better: 'static' | 'adaptive' | 'equal'
}

export interface EvaluationResult {
  scenario: ScenarioId
  name: string
  description: string
  rows: EvaluationMetricRow[]
}

export interface ServiceHealth {
  name: string
  state: HealthState
  detail: string
  critical: boolean // true => core request path; stays healthy even if agent is offline
}

export interface SystemHealth {
  overall: HealthState
  services: ServiceHealth[]
  rateLimiterIndependent: boolean
}

export interface Paginated<T> {
  rows: T[]
  total: number
  page: number
  pageSize: number
}
