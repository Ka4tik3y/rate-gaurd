import { useGateConfig, usePolicyDecisions } from '@/api/agentApi'
import { PageHeader, Card, CardHeader } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { QueryBoundary } from '@/components/ui/states'
import { clockTime } from '@/lib/format'
import type { PolicyDecision } from '@/types'

const cols: Column<PolicyDecision>[] = [
  { key: 'clientId', header: 'Client', render: (d) => <span className="font-mono text-xs text-fg">{d.clientId}</span> },
  { key: 'action', header: 'Requested Action', render: (d) => <span className="text-sm text-fg">{d.requestedAction}</span> },
  { key: 'source', header: 'Source', render: (d) => <StatusBadge value={d.source} tone={d.source === 'AGENT' ? 'info' : 'neutral'} /> },
  { key: 'decision', header: 'Decision', render: (d) => <StatusBadge value={d.decision} /> },
  { key: 'reason', header: 'Reason', render: (d) => <span className="text-xs text-muted">{d.reason}</span> },
  { key: 't', header: 'Time', align: 'right', render: (d) => <span className="text-xs text-muted">{clockTime(d.timestamp)}</span> },
]

function Guardrail({ label, value, hint }: { label: string; value: React.ReactNode; hint: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-4">
      <div className="text-2xs uppercase tracking-wide text-faint">{label}</div>
      <div className="mt-1 text-xl font-semibold text-fg">{value}</div>
      <div className="mt-1 text-xs text-muted">{hint}</div>
    </div>
  )
}

export default function PolicyGate() {
  const cfg = useGateConfig()
  const decisions = usePolicyDecisions()

  return (
    <div>
      <PageHeader title="Policy Gate" subtitle="The single validated, audited path for every policy mutation" />

      <Card className="mb-4 border-info/30 bg-info-dim/30">
        <p className="text-sm text-fg">
          The AI agent is <span className="font-semibold text-info">constrained</span>: it can never touch Redis or admin
          endpoints. Every proposed action passes these guardrails before it can take effect.
        </p>
      </Card>

      <QueryBoundary query={cfg}>
        {(c) => (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Guardrail label="Max limit change" value={`±${Math.round(c.maxChangeRatio * 100)}%`} hint="Automatic changes are bounded" />
            <Guardrail label="Max block duration" value={`${Math.round(c.maxBlockSeconds / 60)} min`} hint="Temporary blocks expire" />
            <Guardrail label="Client cooldown" value={`${c.cooldownSeconds}s`} hint="Between actions per client" />
            <Guardrail
              label="High-value blocks"
              value={c.highValueApprovalRequired ? 'Approval' : 'Auto'}
              hint="Human approval required"
            />
            <Guardrail
              label="Kill switch"
              value={<StatusBadge value={c.killSwitchEnabled ? 'ENABLED' : 'DISABLED'} tone={c.killSwitchEnabled ? 'ok' : 'danger'} />}
              hint="Global autonomous-action toggle"
            />
          </div>
        )}
      </QueryBoundary>

      <Card className="mt-4">
        <CardHeader title="Recent policy decisions" subtitle="Approvals, rejections and approval-required holds" />
        <QueryBoundary query={decisions} isEmpty={(d) => d.length === 0}>
          {(d) => <DataTable columns={cols} rows={d} getRowKey={(x) => x.id} />}
        </QueryBoundary>
      </Card>
    </div>
  )
}
