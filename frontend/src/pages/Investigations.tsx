import { useNavigate } from 'react-router-dom'
import { useInvestigations } from '@/api/investigationApi'
import { PageHeader, Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { QueryBoundary } from '@/components/ui/states'
import { timeAgo } from '@/lib/format'
import type { Investigation } from '@/types'

const cols: Column<Investigation>[] = [
  { key: 'id', header: 'Investigation', render: (i) => <span className="font-mono text-sm text-fg">{i.id}</span> },
  { key: 'clientId', header: 'Client', render: (i) => <span className="font-mono text-xs text-muted">{i.clientId}</span> },
  { key: 'trigger', header: 'Trigger', render: (i) => <span className="text-fg">{i.trigger}</span> },
  { key: 'severity', header: 'Severity', render: (i) => <StatusBadge value={i.severity} /> },
  { key: 'status', header: 'Status', render: (i) => <StatusBadge value={i.status} /> },
  { key: 'action', header: 'Action', render: (i) => <span className="text-xs text-muted">{i.action}</span> },
  { key: 'outcome', header: 'Outcome', render: (i) => <StatusBadge value={i.finalState} /> },
  { key: 'started', header: 'Started', align: 'right', render: (i) => <span className="text-xs text-muted">{timeAgo(i.startedAt)}</span> },
]

export default function Investigations() {
  const investigations = useInvestigations()
  const navigate = useNavigate()
  return (
    <div>
      <PageHeader title="Investigations" subtitle="Current and historical AI investigations" />
      <Card>
        <QueryBoundary query={investigations} isEmpty={(d) => d.length === 0}>
          {(d) => (
            <DataTable
              columns={cols}
              rows={d}
              getRowKey={(i) => i.id}
              onRowClick={(i) => navigate(`/investigations/${i.id}`)}
            />
          )}
        </QueryBoundary>
      </Card>
    </div>
  )
}
