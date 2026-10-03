import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import { useClient, useResetClientLimit } from '@/api/clientsApi'
import { useToast } from '@/components/ui/Toaster'
import { PageHeader, Card, CardHeader } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { QueryBoundary } from '@/components/ui/states'
import { ClientHistoryChart } from '@/components/charts/ClientHistoryChart'
import { clockTime, dateTime, pct, timeAgo } from '@/lib/format'
import type { ClientAction, ClientDetail as TClientDetail } from '@/types'

const actionCols: Column<ClientAction>[] = [
  { key: 't', header: 'Time', render: (a) => <span className="tabular-nums text-muted">{clockTime(a.timestamp)}</span> },
  { key: 'action', header: 'Action', render: (a) => <span className="text-fg">{a.action}</span> },
  { key: 'detail', header: 'Detail', render: (a) => <span className="font-mono text-xs text-muted">{a.detail}</span> },
  { key: 'actor', header: 'Actor', render: (a) => <StatusBadge value={a.actor} tone={a.actor === 'Agent' ? 'info' : 'neutral'} /> },
  { key: 'result', header: 'Result', render: (a) => <StatusBadge value={a.result} /> },
]

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
      <div className="text-2xs uppercase tracking-wide text-faint">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-fg">{value}</div>
    </div>
  )
}

export default function ClientDetail() {
  const { clientId = '' } = useParams()
  const client = useClient(clientId)
  const reset = useResetClientLimit(clientId)
  const { toast } = useToast()
  const resetLimit = () =>
    reset.mutate(undefined, {
      onSuccess: () => toast(`${clientId} is back on the default limit`, 'success'),
      onError: (e) => toast((e as Error).message, 'error'),
    })

  return (
    <div>
      <Link to="/clients" className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to clients
      </Link>
      <QueryBoundary query={client}>
        {(c: TClientDetail) => (
          <>
            <PageHeader
              title={c.clientId}
              subtitle={`Classification: ${c.classification.replace('_', ' ')}`}
              actions={
                <div className="flex items-center gap-2">
                  <StatusBadge value={c.status} />
                  <StatusBadge value={`${c.risk} RISK`} tone={c.risk === 'HIGH' ? 'danger' : c.risk === 'ELEVATED' ? 'warn' : 'neutral'} />
                </div>
              }
            />

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Request rate" value={`${c.requestsPerSec} req/s`} />
              <Stat label="Baseline" value={`${c.baseline} req/s`} />
              <Stat label="429 ratio" value={pct(c.rejectRatio)} />
              <Stat label="Error ratio" value={pct(c.errorRatio)} />
            </div>

            <Card className="mt-4">
              <CardHeader title="Traffic history" subtitle="Request rate vs baseline and anomaly threshold" />
              <ClientHistoryChart client={c} />
            </Card>

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader title="Current policy" />
                <dl className="space-y-2 text-sm">
                  <Row k="Policy" v={c.policy.policyName} />
                  <Row k="Capacity" v={`${c.policy.capacity} tokens`} />
                  <Row k="Refill rate" v={`${c.policy.refillRate}/s`} />
                  <Row k="Algorithm" v={c.policy.algorithm} />
                  <Row k="Status" v={<StatusBadge value={c.policy.status} />} />
                  <Row k="Last modified" v={`${timeAgo(c.policy.lastModified)}`} />
                  <Row k="Modified by" v={<StatusBadge value={c.policy.modifiedBy} tone={c.policy.modifiedBy === 'Agent' ? 'info' : 'neutral'} />} />
                  {c.policy.overridden && (
                    <Row
                      k="Custom limit"
                      v={
                        (c.policy.expiresInSeconds ?? -1) > 0
                          ? `expires in ${Math.ceil((c.policy.expiresInSeconds ?? 0) / 60)} min`
                          : 'permanent'
                      }
                    />
                  )}
                  {c.policy.recentlyBlocked && <Row k="Recently blocked" v="agent won't raise limit" />}
                </dl>
                {c.policy.overridden && (
                  <button className="btn-ghost mt-4 w-full text-xs" onClick={resetLimit} disabled={reset.isPending}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    {reset.isPending ? 'Resetting…' : `Reset to default limit${c.policy.defaultCapacity ? ` (${c.policy.defaultCapacity})` : ''}`}
                  </button>
                )}
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader title="Recent actions" subtitle="Policy changes affecting this client" />
                {c.recentActions.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted">No recent actions.</div>
                ) : (
                  <DataTable columns={actionCols} rows={c.recentActions} getRowKey={(a) => String(a.timestamp)} />
                )}
                <div className="mt-2 text-2xs text-faint">As of {dateTime(Date.now())}</div>
              </Card>
            </div>
          </>
        )}
      </QueryBoundary>
    </div>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 pb-2 last:border-0">
      <dt className="text-muted">{k}</dt>
      <dd className="font-medium text-fg">{v}</dd>
    </div>
  )
}
