import { useState } from 'react'
import { Search } from 'lucide-react'
import { useAudit, type AuditQuery } from '@/api/auditApi'
import { PageHeader, Card } from '@/components/ui/Card'
import { QueryBoundary } from '@/components/ui/states'
import { AuditTimeline } from '@/components/domain/AuditTimeline'

const TYPES = ['all', 'ANOMALY', 'INVESTIGATION', 'SIMULATION', 'POLICY', 'ACTION', 'OUTCOME', 'ROLLBACK']

export default function Audit() {
  const [query, setQuery] = useState<AuditQuery>({ type: 'all' })
  const audit = useAudit(query)

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Every anomaly, decision, action and outcome — immutable record" />
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-faint" />
            <input
              className="input pl-8"
              placeholder="Search events…"
              value={query.search ?? ''}
              onChange={(e) => setQuery((q) => ({ ...q, search: e.target.value }))}
              aria-label="Search audit log"
            />
          </div>
          <select
            className="input w-auto"
            value={query.type}
            onChange={(e) => setQuery((q) => ({ ...q, type: e.target.value }))}
            aria-label="Filter by event type"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t === 'all' ? 'All event types' : t}
              </option>
            ))}
          </select>
          <input
            className="input w-40"
            placeholder="Client id"
            value={query.clientId ?? ''}
            onChange={(e) => setQuery((q) => ({ ...q, clientId: e.target.value || undefined }))}
            aria-label="Filter by client"
          />
        </div>
        <QueryBoundary query={audit} isEmpty={(d) => d.length === 0} emptyTitle="No matching events">
          {(d) => <AuditTimeline events={d} />}
        </QueryBoundary>
      </Card>
    </div>
  )
}
