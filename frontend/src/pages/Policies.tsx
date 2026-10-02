import { usePolicies } from '@/api/policiesApi'
import { PageHeader, Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { QueryBoundary } from '@/components/ui/states'
import { compactNumber, timeAgo } from '@/lib/format'
import type { PolicySummary } from '@/types'

const cols: Column<PolicySummary>[] = [
  { key: 'policyName', header: 'Policy', render: (p) => <span className="font-medium text-fg">{p.policyName}</span> },
  { key: 'capacity', header: 'Capacity', align: 'right', render: (p) => <span className="tabular-nums">{p.capacity}</span> },
  { key: 'refillRate', header: 'Refill Rate', align: 'right', render: (p) => <span className="tabular-nums">{p.refillRate}/s</span> },
  { key: 'algorithm', header: 'Algorithm', render: (p) => <span className="text-muted">{p.algorithm}</span> },
  { key: 'clients', header: 'Clients', align: 'right', render: (p) => <span className="tabular-nums">{compactNumber(p.clients)}</span> },
  { key: 'status', header: 'Status', render: (p) => <StatusBadge value={p.status} /> },
  { key: 'modified', header: 'Modified', align: 'right', render: (p) => <span className="text-xs text-muted">{timeAgo(p.lastModified)} · {p.modifiedBy}</span> },
]

export default function Policies() {
  const policies = usePolicies()
  return (
    <div>
      <PageHeader title="Policies" subtitle="Rate-limit policies and the clients bound to them" />
      <Card>
        <QueryBoundary query={policies} isEmpty={(d) => d.length === 0}>
          {(d) => <DataTable columns={cols} rows={d} getRowKey={(p) => p.policyName} />}
        </QueryBoundary>
      </Card>
      <p className="mt-3 text-xs text-faint">
        Policy mutations are performed only through the Policy Gate — see the Policy Gate page for guardrails and recent
        decisions.
      </p>
    </div>
  )
}
