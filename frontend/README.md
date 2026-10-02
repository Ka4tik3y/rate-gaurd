# SentinelFlow — dashboard frontend

Production-style operations dashboard for the autonomous AI rate-limiting platform: traffic
intelligence, client/policy management, an AI operations control center (agent, investigations,
policy gate, simulation, audit) and a static-vs-adaptive evaluation view.

**Stack:** React + TypeScript + Vite + Tailwind CSS + React Router + TanStack Query + Recharts +
lucide-react.

## Run

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173  (mock mode by default)
```

```bash
npm run build      # type-check + production bundle (dist/)
npm run lint       # eslint (no-explicit-any enforced)
npm test           # vitest + React Testing Library
```

## Mock vs live

The app ships in **mock mode** (`VITE_USE_MOCKS=true`) so it runs with no backend — all data comes from
`src/mocks/`. To connect the real services, copy `.env.example` to `.env`, set `VITE_USE_MOCKS=false`,
and point `VITE_API_BASE_URL` / `VITE_AGENT_API_URL` at the Spring Boot gateway and FastAPI agent.
Components never know which mode is active — only the `src/api/*` adapters do. Expected endpoints are in
[`../docs/api-contract.md`](../docs/api-contract.md).

## Architecture

```
src/
  config.ts            env + time-range config
  types/               all domain models (strongly typed; no `any`)
  lib/                 http wrapper, formatting, classnames
  api/                 one adapter per domain + TanStack Query hooks + query keys
  mocks/               deterministic dataset (db.ts) + mock API (api.ts)
  components/
    layout/            Sidebar, TopBar, Layout, nav config
    ui/                KpiCard, StatusBadge, HealthIndicator, DataTable, Pagination,
                       TimeRangeSelector, ConfirmDialog, Toaster, Card, states (loading/error/empty)
    charts/            TrafficChart, RateChart, SimulationComparison, ClientHistoryChart
    domain/            AnomalyCard, InvestigationTimeline, EvidencePanel,
                       AgentActivityTimeline, AuditTimeline, ApprovalCard
  pages/               one component per route
  test/                render helper + vitest suites
```

## Routes

`/dashboard` · `/traffic` · `/clients` · `/clients/:clientId` · `/policies` · `/agent` ·
`/investigations` · `/investigations/:id` · `/policy-gate` · `/simulation` · `/audit` ·
`/evaluation` · `/health` · `/settings`

## Design notes

- Dark-first SOC palette; colour communicates status only (green=healthy/allowed, amber=warning/approval,
  red=anomaly/blocked, blue=info). Status is never conveyed by colour alone (icons + labels).
- No business logic lives in the UI: the ±50% change cap, cooldowns, approval rules and the kill switch
  are backend Policy Gate concerns — the dashboard only displays backend decisions.
- No fake AI: the agent views render real backend state (or clearly-labelled mock data), and the UI
  supports the real `Anomaly → Agent → Policy Gate → Action → Outcome` lifecycle.
- The Health and Agent pages demonstrate the key architectural property: the agent can go offline while
  the rate limiter keeps processing traffic.
