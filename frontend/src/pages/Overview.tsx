import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, AlertTriangle, Ban, CheckCircle2, Gauge, Users } from 'lucide-react'
import type { TimeRange } from '@/config'
import { useKpis, useTopEndpoints } from '@/api/dashboardApi'
import { useAnomalies, useTraffic } from '@/api/trafficApi'
import { PageHeader, Card, CardHeader } from '@/components/ui/Card'
import { KpiCard } from '@/components/ui/KpiCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { RefreshButton, TimeRangeSelector } from '@/components/ui/TimeRangeSelector'
import { EmptyState, QueryBoundary } from '@/components/ui/states'
import { TrafficChart } from '@/components/charts/TrafficChart'
import { RateChart } from '@/components/charts/RateChart'
import { AnomalyCard } from '@/components/domain/AnomalyCard'
import { compactNumber, ms, pct } from '@/lib/format'
import type { EndpointRow } from '@/types'

const endpointCols: Column<EndpointRow>[] = [
  { key: 'endpoint', header: 'Endpoint', render: (r) => <span className="font-mono text-sm text-fg">{r.endpoint}</span> },
  { key: 'rps', header: 'Req/s', align: 'right', render: (r) => <span className="tabular-nums">{r.requestsPerSec}</span> },
  { key: 'reject', header: '429 Rate', align: 'right', render: (r) => <span className="tabular-nums">{pct(r.rejectRate)}</span> },
  { key: 'error', header: 'Error Rate', align: 'right', render: (r) => <span className="tabular-nums">{pct(r.errorRate)}</span> },
  { key: 'latency', header: 'Latency', align: 'right', render: (r) => <span className="tabular-nums">{ms(r.latencyMs)}</span> },
  { key: 'status', header: 'Status', align: 'right', render: (r) => <StatusBadge value={r.status} /> },
]

export default function Overview() {
  const [range, setRange] = useState<TimeRange>('1h')
  const kpis = useKpis()
  const traffic = useTraffic(range)
  const endpoints = useTopEndpoints()
  const anomalies = useAnomalies()
  const navigate = useNavigate()

  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle="Real-time API protection and traffic intelligence"
        actions={
          <>
            <TimeRangeSelector value={range} onChange={setRange} />
            <RefreshButton onClick={() => traffic.refetch()} spinning={traffic.isFetching} />
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Total Requests" loading={kpis.isLoading} value={kpis.data && compactNumber(kpis.data.totalRequests)} deltaPct={kpis.data?.totalRequestsDeltaPct} icon={<Activity className="h-4 w-4" />} />
        <KpiCard label="Allowed" loading={kpis.isLoading} value={kpis.data && compactNumber(kpis.data.allowedRequests)} sub={kpis.data && pct(kpis.data.allowedPct)} tone="ok" icon={<CheckCircle2 className="h-4 w-4" />} />
        <KpiCard label="Rate Limited" loading={kpis.isLoading} value={kpis.data && compactNumber(kpis.data.rateLimited)} sub={kpis.data && pct(kpis.data.rateLimitedPct)} tone="warn" icon={<Ban className="h-4 w-4" />} />
        <KpiCard label="Active Anomalies" loading={kpis.isLoading} value={kpis.data?.activeAnomalies} sub={kpis.data && `${kpis.data.highAnomalies} HIGH`} tone="danger" icon={<AlertTriangle className="h-4 w-4" />} />
        <KpiCard label="Active Clients" loading={kpis.isLoading} value={kpis.data && compactNumber(kpis.data.activeClients)} icon={<Users className="h-4 w-4" />} />
        <KpiCard label="Active Policies" loading={kpis.isLoading} value={kpis.data?.activePolicies} icon={<Gauge className="h-4 w-4" />} />
      </div>

      {/* Traffic + anomalies */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Request Traffic" subtitle="Allowed vs rate-limited; markers are anomalies — click to investigate" />
          <QueryBoundary query={traffic}>{(d) => <TrafficChart data={d} />}</QueryBoundary>
        </Card>
        <Card>
          <CardHeader title="Active Anomalies" subtitle="Live detections from the deterministic detector" />
          <QueryBoundary query={anomalies} isEmpty={(d) => d.length === 0} emptyTitle="No active anomalies">
            {(d) => (
              <div className="space-y-2.5">
                {d.map((a) => (
                  <AnomalyCard key={a.id} anomaly={a} />
                ))}
              </div>
            )}
          </QueryBoundary>
        </Card>
      </div>

      {/* Secondary rate charts */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="429 Rate" subtitle="Rate-limited share over time" />
          <QueryBoundary query={traffic}>
            {(d) => <RateChart points={d.points} dataKey="rejectRate" color="#b47812" name="429 rate" />}
          </QueryBoundary>
        </Card>
        <Card>
          <CardHeader title="Error Rate" subtitle="4xx / 5xx share over time" />
          <QueryBoundary query={traffic}>
            {(d) => <RateChart points={d.points} dataKey="errorRate" color="#d23b47" name="Error rate" />}
          </QueryBoundary>
        </Card>
      </div>

      {/* Top endpoints */}
      <Card className="mt-4">
        <CardHeader title="Top Endpoints" subtitle="Busiest routes in the selected window" />
        <QueryBoundary query={endpoints} isEmpty={(d) => d.length === 0}>
          {(d) => (
            <DataTable
              columns={endpointCols}
              rows={d}
              getRowKey={(r) => r.endpoint}
              onRowClick={(r) => navigate(`/traffic?endpoint=${encodeURIComponent(r.endpoint)}`)}
              empty={<EmptyState title="No endpoints" />}
            />
          )}
        </QueryBoundary>
      </Card>
    </div>
  )
}
