# Frontend ↔ backend API contract (SentinelFlow dashboard)

The dashboard (`frontend/`) is built against this contract. In **mock mode** (`VITE_USE_MOCKS=true`,
the default) every call is served by `src/mocks/`. To connect real backends set `VITE_USE_MOCKS=false`
and point `VITE_API_BASE_URL` (Spring Boot gateway) and `VITE_AGENT_API_URL` (FastAPI agent) at them.

Endpoints marked **exists** are already implemented by the current backend; **future** endpoints must be
added (several are aggregations the admin API does not yet expose). Auth: all `/admin/**` and
`/agent/**` routes require HTTP Basic (`ADMIN` / `AGENT` roles). The browser must never hold those
credentials — in a real deployment a thin backend-for-frontend should inject them and expose only the
read/summary routes below. **Do not modify the backend to match this doc without review.**

## Conventions

- All responses are JSON. Errors use `{ "detail": "<message>" }` with a 4xx/5xx status.
- Times are epoch milliseconds unless noted.
- Pagination: `{ rows: T[], total, page, pageSize }`.

## Overview / dashboard

| Method | Path | Status | Response | Notes |
|---|---|---|---|---|
| GET | `/api/admin/overview/kpis` | future | `Kpis` | Aggregate counters for the KPI cards |
| GET | `/api/admin/overview/endpoints` | future | `EndpointRow[]` | Top endpoints by volume |
| GET | `/api/admin/traffic?rangeSeconds=` | future | `TrafficSeries` | Time-series points + anomaly markers |
| GET | `/api/admin/anomalies` | future | `Anomaly[]` | Active anomalies (from the detector's sink) |

## Clients & policies

| Method | Path | Status | Response |
|---|---|---|---|
| GET | `/api/admin/clients?search=&risk=&status=&page=&pageSize=&sort=&dir=` | future | `Paginated<Client>` |
| GET | `/api/admin/clients/{clientId}` | future (compose) | `ClientDetail` — compose from the three below |
| GET | `/admin/rate-limits/{clientId}` | **exists** | effective limit, block status, classification |
| GET | `/admin/metrics/{clientId}` | **exists** | windowed traffic metrics |
| GET | `/admin/audit/{clientId}` | **exists** | audit trail for one client |
| GET | `/api/admin/policies` | future | `PolicySummary[]` |

## AI agent & policy gate

| Method | Path | Status | Request → Response |
|---|---|---|---|
| GET | `/admin/agent/status` | **exists** | → `AgentStatus` |
| GET | `/api/admin/agent/events` | future | → `AgentEvent[]` (investigation lifecycle) |
| POST | `/admin/agent/kill-switch` | **exists** | `{ enabled }` → `{ killSwitchEnabled }` |
| GET | `/admin/agent/pending` | **exists** | → `PendingApproval[]` |
| POST | `/admin/agent/pending/{id}/approve` · `/reject` | **exists** | → `{ decision }` |
| GET | `/api/admin/policy-gate/config` | future | → `PolicyGateConfig` (mirrors `policy-gate:` yaml) |
| GET | `/api/admin/policy-gate/decisions` | future | → `PolicyDecision[]` |
| POST | `/agent/actions` | **exists** | agent proposes an action (always gated) |

## Simulation, audit, evaluation, health

| Method | Path | Status | Request → Response |
|---|---|---|---|
| POST | `/admin/rate-limits/{clientId}/simulate` | **exists** | dry-run → `SimulationResult` |
| GET | `/api/admin/audit?type=&clientId=&search=` | future (global) | → `AuditEvent[]` (per-client exists at `/admin/audit/{id}`) |
| GET | `/api/admin/evaluation/results` | future | → `EvaluationResult[]` (from the evaluation harness) |
| GET | `/actuator/health` | **exists** | gateway health |
| GET | `{AGENT}/health` | **exists** | agent health + provider |
| GET | `/api/admin/health` | future (compose) | → `SystemHealth` (per-service roll-up) |

## Types

All response shapes are defined in [`frontend/src/types/index.ts`](../frontend/src/types/index.ts) —
`Kpis`, `TrafficSeries`, `EndpointRow`, `Anomaly`, `Client`, `ClientDetail`, `PolicySummary`,
`AgentStatus`, `AgentEvent`, `PolicyGateConfig`, `PolicyDecision`, `PendingApproval`,
`SimulationResult`, `Investigation`, `AuditEvent`, `EvaluationResult`, `SystemHealth`.

## Real-time (future)

Polling via TanStack Query is used today (interval `VITE_POLL_INTERVAL_MS`). The API layer is shaped so
a WebSocket/SSE stream for anomalies, agent actions and investigation progress can replace polling
without changing components — a stream would push into the same query caches by key (`src/api/queryKeys.ts`).
