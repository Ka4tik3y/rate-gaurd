import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useClients, type ClientQuery } from '@/api/clientsApi'
import { PageHeader, Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Pagination } from '@/components/ui/Pagination'
import { QueryBoundary } from '@/components/ui/states'
import { pct } from '@/lib/format'
import type { Client } from '@/types'

const cols: Column<Client>[] = [
  { key: 'clientId', header: 'Client ID', sortable: true, render: (c) => <span className="font-mono text-sm text-fg">{c.clientId}</span> },
  { key: 'requestsPerSec', header: 'Req/s', align: 'right', sortable: true, render: (c) => <span className="tabular-nums">{c.requestsPerSec}</span> },
  { key: 'rejectRatio', header: '429 Ratio', align: 'right', sortable: true, render: (c) => <span className="tabular-nums">{pct(c.rejectRatio)}</span> },
  { key: 'errorRatio', header: 'Error Ratio', align: 'right', render: (c) => <span className="tabular-nums">{pct(c.errorRatio)}</span> },
  { key: 'currentLimit', header: 'Limit', align: 'right', render: (c) => <span className="tabular-nums">{c.currentLimit} req/s</span> },
  { key: 'status', header: 'Status', render: (c) => <StatusBadge value={c.status} /> },
  { key: 'risk', header: 'Risk', render: (c) => <StatusBadge value={c.risk} /> },
]

export default function Clients() {
  const [query, setQuery] = useState<ClientQuery>({ page: 1, pageSize: 8, sort: 'requestsPerSec', dir: 'desc', risk: 'all', status: 'all' })
  const clients = useClients(query)
  const navigate = useNavigate()
  const set = (patch: Partial<ClientQuery>) => setQuery((q) => ({ ...q, page: 1, ...patch }))

  return (
    <div>
      <PageHeader title="Clients" subtitle="Per-client traffic, limits and risk classification" />

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-faint" />
            <input
              className="input pl-8"
              placeholder="Search client id…"
              value={query.search ?? ''}
              onChange={(e) => set({ search: e.target.value })}
              aria-label="Search clients"
            />
          </div>
          <select className="input w-auto" value={query.risk} onChange={(e) => set({ risk: e.target.value })} aria-label="Filter by risk">
            <option value="all">All risk</option>
            <option value="HIGH">High</option>
            <option value="ELEVATED">Elevated</option>
            <option value="NORMAL">Normal</option>
          </select>
          <select className="input w-auto" value={query.status} onChange={(e) => set({ status: e.target.value })} aria-label="Filter by status">
            <option value="all">All status</option>
            <option value="ACTIVE">Active</option>
            <option value="IDLE">Idle</option>
            <option value="BLOCKED">Blocked</option>
          </select>
        </div>

        <QueryBoundary query={clients}>
          {(d) => (
            <>
              <DataTable
                columns={cols}
                rows={d.rows}
                getRowKey={(c) => c.clientId}
                sort={{ key: query.sort as string, dir: query.dir ?? 'desc' }}
                onSort={(key) =>
                  set({
                    sort: key as keyof Client,
                    dir: query.sort === key && query.dir === 'desc' ? 'asc' : 'desc',
                    page: query.page,
                  })
                }
                onRowClick={(c) => navigate(`/clients/${encodeURIComponent(c.clientId)}`)}
              />
              <Pagination
                page={d.page}
                pageSize={d.pageSize}
                total={d.total}
                onPage={(p) => setQuery((q) => ({ ...q, page: p }))}
              />
            </>
          )}
        </QueryBoundary>
      </Card>
    </div>
  )
}
