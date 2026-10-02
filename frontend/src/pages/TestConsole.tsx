import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, Bot, Send } from 'lucide-react'
import { useGenerateTraffic } from '@/api/trafficApi'
import { useInvestigate } from '@/api/investigationApi'
import { PageHeader, Card, CardHeader } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useToast } from '@/components/ui/Toaster'
import { config } from '@/config'

const METRICS = [
  { v: 'reject_ratio', label: 'Sustained 429s (limit too tight)' },
  { v: 'request_rate', label: 'Request-rate spike' },
  { v: 'burstiness', label: 'Bursty traffic (scraper)' },
  { v: 'slow_and_low', label: 'Slow-and-low scanning' },
  { v: 'error_ratio', label: 'Downstream 5xx spike' },
]

function Stat({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-3 text-center">
      <div className={`text-2xl font-semibold tabular-nums ${tone}`}>{n}</div>
      <div className="mt-0.5 text-2xs uppercase tracking-wide text-faint">{label}</div>
    </div>
  )
}

export default function TestConsole() {
  const { toast } = useToast()
  const traffic = useGenerateTraffic()
  const invest = useInvestigate()

  const [client, setClient] = useState('demo-client-1')
  const [count, setCount] = useState(200)
  const [concurrency, setConcurrency] = useState(15)

  const [invClient, setInvClient] = useState('demo-client-1')
  const [metric, setMetric] = useState('reject_ratio')
  const [severity, setSeverity] = useState('HIGH')

  const sendTraffic = () =>
    traffic.mutate(
      { clientId: client, count, concurrency },
      { onError: (e) => toast((e as Error).message, 'error'), onSuccess: () => toast('Traffic sent', 'success') },
    )

  const runInvestigation = () =>
    invest.mutate(
      { clientId: invClient, metric, severity, window: '1m', currentValue: 0.4, baseline: 0.05, deviation: 4.2 },
      { onError: (e) => toast((e as Error).message, 'error'), onSuccess: () => toast('Investigation complete', 'success') },
    )

  return (
    <div>
      <PageHeader
        title="Test Console"
        subtitle="Drive the live system: generate traffic through the rate limiter, then let the agent investigate"
      />

      {config.useMocks && (
        <Card className="mb-4 border-warn/40 bg-warn-dim/40">
          <p className="text-sm text-fg">
            Running in <b>mock mode</b> — actions are simulated. Build with <code>VITE_USE_MOCKS=false</code> (the BFF image
            does this) to drive the real limiter and agent.
          </p>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Traffic generator */}
        <Card>
          <CardHeader title="1 · Generate traffic" subtitle="Send a burst through the gateway as one client" />
          <label className="mb-1 block text-xs text-muted">Client ID</label>
          <input className="input" value={client} onChange={(e) => setClient(e.target.value)} />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">Requests ({count})</label>
              <input type="range" min={10} max={500} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Concurrency ({concurrency})</label>
              <input type="range" min={1} max={25} value={concurrency} onChange={(e) => setConcurrency(Number(e.target.value))} className="w-full" />
            </div>
          </div>
          <button className="btn-primary mt-4 w-full" onClick={sendTraffic} disabled={traffic.isPending}>
            <Send className="h-4 w-4" />
            {traffic.isPending ? 'Sending…' : `Send ${count} requests`}
          </button>

          {traffic.data && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Stat n={traffic.data.allowed} label="allowed" tone="text-ok" />
              <Stat n={traffic.data.limited} label="429 limited" tone="text-warn" />
              <Stat n={traffic.data.errors} label="5xx" tone="text-danger" />
            </div>
          )}
          <p className="mt-3 text-2xs text-faint">
            With the default limit (capacity 100, refill 10/s) a large burst gets partly rate-limited. The client then
            appears on <Link to="/clients" className="text-info hover:underline">Clients</Link> and in the{' '}
            <Link to="/traffic" className="text-info hover:underline">Traffic</Link> chart.
          </p>
        </Card>

        {/* Investigation trigger */}
        <Card>
          <CardHeader title="2 · Trigger an investigation" subtitle="Hand the AI agent an anomaly for this client" />
          <label className="mb-1 block text-xs text-muted">Client ID</label>
          <input className="input" value={invClient} onChange={(e) => setInvClient(e.target.value)} />
          <label className="mb-1 mt-3 block text-xs text-muted">Anomaly type</label>
          <select className="input" value={metric} onChange={(e) => setMetric(e.target.value)}>
            {METRICS.map((m) => (
              <option key={m.v} value={m.v}>
                {m.label}
              </option>
            ))}
          </select>
          <label className="mb-1 mt-3 block text-xs text-muted">Severity</label>
          <select className="input" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          <button className="btn-primary mt-4 w-full" onClick={runInvestigation} disabled={invest.isPending}>
            <Bot className="h-4 w-4" />
            {invest.isPending ? 'Investigating…' : 'Run investigation'}
          </button>

          {invest.data && (
            <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-fg">{invest.data.id}</span>
                <StatusBadge value={invest.data.finalState} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                <StatusBadge value={invest.data.proposal.actionType} />
                <span>→ gate</span>
                <StatusBadge value={invest.data.gateDecision} />
                {invest.data.outcome !== 'NA' && (
                  <>
                    <span>→ outcome</span>
                    <StatusBadge value={invest.data.outcome} />
                  </>
                )}
              </div>
              <p className="mt-2 text-xs text-muted">{invest.data.proposal.reason}</p>
              <Link to={`/investigations/${invest.data.id}`} className="mt-2 inline-flex items-center gap-1 text-xs text-info hover:underline">
                <Activity className="h-3 w-3" /> View full investigation
              </Link>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
