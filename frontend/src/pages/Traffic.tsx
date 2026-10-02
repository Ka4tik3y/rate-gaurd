import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TimeRange } from '@/config'
import { useTopEndpoints } from '@/api/dashboardApi'
import { useTraffic } from '@/api/trafficApi'
import { PageHeader, Card, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { RefreshButton, TimeRangeSelector } from '@/components/ui/TimeRangeSelector'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { QueryBoundary } from '@/components/ui/states'
import { TrafficChart } from '@/components/charts/TrafficChart'
import { RateChart } from '@/components/charts/RateChart'
import { ms, pct } from '@/lib/format'
import type { EndpointRow } from '@/types'

const cols: Column<EndpointRow>[] = [
  { key: 'endpoint', header: 'Endpoint', render: (r) => <span className="font-mono text-sm text-fg">{r.endpoint}</span> },
  { key: 'rps', header: 'Req/s', align: 'right', sortable: true, render: (r) => <span className="tabular-nums">{r.requestsPerSec}</span> },
  { key: 'reject', header: '429 Rate', align: 'right', sortable: true, render: (r) => <span className="tabular-nums">{pct(r.rejectRate)}</span> },
  { key: 'error', header: 'Error Rate', align: 'right', render: (r) => <span className="tabular-nums">{pct(r.errorRate)}</span> },
  { key: 'latency', header: 'Latency', align: 'right', render: (r) => <span className="tabular-nums">{ms(r.latencyMs)}</span> },
  { key: 'status', header: 'Status', align: 'right', render: (r) => <StatusBadge value={r.status} /> },
]

export default function Traffic() {
  const [range, setRange] = useState<TimeRange>('1h')
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'rps', dir: 'desc' })
  const traffic = useTraffic(range)
  const endpoints = useTopEndpoints()
  const navigate = useNavigate()

  const sortedEndpoints = (rows: EndpointRow[]) => {
    const k = sort.key === 'reject' ? 'rejectRate' : 'requestsPerSec'
    return [...rows].sort((a, b) => (sort.dir === 'asc' ? a[k] - b[k] : b[k] - a[k]))
  }

  return (
    <div>
      <PageHeader
        title="Traffic"
        subtitle="Request volume, rate limiting and errors across the gateway"
        actions={
          <>
            <TimeRangeSelector value={range} onChange={setRange} />
            <RefreshButton onClick={() => traffic.refetch()} spinning={traffic.isFetching} />
          </>
        }
      />

      <Card>
        <CardHeader title="Request Traffic" subtitle="Allowed vs rate-limited requests per second" />
        <QueryBoundary query={traffic}>{(d) => <TrafficChart data={d} height={320} />}</QueryBoundary>
      </Card>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="429 Rate" />
          <QueryBoundary query={traffic}>
            {(d) => <RateChart points={d.points} dataKey="rejectRate" color="#b47812" name="429 rate" />}
          </QueryBoundary>
        </Card>
        <Card>
          <CardHeader title="Error Rate" />
          <QueryBoundary query={traffic}>
            {(d) => <RateChart points={d.points} dataKey="errorRate" color="#d23b47" name="Error rate" />}
          </QueryBoundary>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Endpoints" subtitle="Click a row to inspect a route" />
        <QueryBoundary query={endpoints} isEmpty={(d) => d.length === 0}>
          {(d) => (
            <DataTable
              columns={cols}
              rows={sortedEndpoints(d)}
              getRowKey={(r) => r.endpoint}
              sort={sort}
              onSort={(key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))}
              onRowClick={(r) => navigate(`/clients?endpoint=${encodeURIComponent(r.endpoint)}`)}
            />
          )}
        </QueryBoundary>
      </Card>
    </div>
  )
}
