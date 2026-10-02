import { useState } from 'react'
import { Power, ShieldAlert } from 'lucide-react'
import { useAgentEvents, useAgentOffline, useAgentStatus, useKillSwitch, usePending, useResolvePending } from '@/api/agentApi'
import { PageHeader, Card, CardHeader } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { QueryBoundary } from '@/components/ui/states'
import { useToast } from '@/components/ui/Toaster'
import { AgentActivityTimeline } from '@/components/domain/AgentActivityTimeline'
import { ApprovalCard } from '@/components/domain/ApprovalCard'
import { timeAgo } from '@/lib/format'

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-3 text-center">
      <div className={`text-2xl font-semibold tabular-nums ${tone ?? 'text-fg'}`}>{value}</div>
      <div className="mt-0.5 text-2xs uppercase tracking-wide text-faint">{label}</div>
    </div>
  )
}

export default function Agent() {
  const status = useAgentStatus()
  const events = useAgentEvents()
  const pending = usePending()
  const killSwitch = useKillSwitch()
  const agentOffline = useAgentOffline()
  const resolve = useResolvePending()
  const { toast } = useToast()
  const [confirm, setConfirm] = useState(false)

  const enabled = status.data?.killSwitchEnabled ?? true
  const offline = status.data?.state === 'OFFLINE'

  const doToggleKill = () => {
    killSwitch.mutate(!enabled, {
      onSuccess: () => toast(enabled ? 'Autonomous actions disabled' : 'Autonomous actions enabled', enabled ? 'info' : 'success'),
      onError: (e) => toast((e as Error).message, 'error'),
    })
    setConfirm(false)
  }

  return (
    <div>
      <PageHeader
        title="AI Operations"
        subtitle="Autonomous agent control center — not a chatbot"
        actions={
          <button
            className="btn-ghost text-xs"
            onClick={() => agentOffline.mutate(!offline, { onSuccess: () => toast(offline ? 'Agent back online' : 'Agent taken offline (limiter unaffected)', 'info') })}
          >
            <Power className="h-3.5 w-3.5" />
            {offline ? 'Bring agent online' : 'Simulate agent outage'}
          </button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <QueryBoundary query={status}>
            {(s) => (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-fg">AI Agent</div>
                    <div className="mt-0.5 text-xs text-muted">Provider: {s.provider}</div>
                  </div>
                  <StatusBadge value={s.state} />
                </div>
                <div className="mb-4 flex items-center gap-2">
                  <span className="text-xs text-muted">Mode</span>
                  <StatusBadge value={s.mode} />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <Stat label="Actions today" value={s.actionsToday} />
                  <Stat label="Successful" value={s.successfulActions} tone="text-ok" />
                  <Stat label="Reverted" value={s.revertedActions} tone="text-danger" />
                  <Stat label="Awaiting approval" value={s.pendingApprovals} tone="text-warn" />
                </div>
                {s.lastActionAt && (
                  <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3 text-xs">
                    <div className="text-faint">Last action · {timeAgo(s.lastActionAt)}</div>
                    <div className="mt-1 text-fg">{s.lastAction}</div>
                  </div>
                )}

                <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-fg">
                      <ShieldAlert className="h-4 w-4 text-warn" /> Global AI kill switch
                    </div>
                    <StatusBadge value={enabled ? 'ENABLED' : 'DISABLED'} tone={enabled ? 'ok' : 'danger'} />
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    {enabled
                      ? 'Agent may take autonomous actions within the Policy Gate guardrails.'
                      : 'Autonomous actions are disabled. The core rate limiter continues operating normally.'}
                  </p>
                  <button
                    className={enabled ? 'btn-danger mt-3 w-full text-sm' : 'btn-primary mt-3 w-full text-sm'}
                    onClick={() => setConfirm(true)}
                    disabled={killSwitch.isPending}
                  >
                    {enabled ? 'Disable autonomous actions' : 'Enable autonomous actions'}
                  </button>
                </div>
              </>
            )}
          </QueryBoundary>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Agent activity" subtitle="Most recent investigation lifecycle" />
          <QueryBoundary query={events} isEmpty={(d) => d.length === 0}>
            {(d) => <AgentActivityTimeline events={d} linkTo="/investigations/INV-1042" />}
          </QueryBoundary>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Pending approvals" subtitle="High-risk actions held for a human decision" />
        <QueryBoundary query={pending} isEmpty={(d) => d.length === 0} emptyTitle="No actions awaiting approval">
          {(d) => (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {d.map((p) => (
                <ApprovalCard
                  key={p.actionId}
                  approval={p}
                  busy={resolve.isPending}
                  onApprove={() =>
                    resolve.mutate({ actionId: p.actionId, decision: 'approve' }, { onSuccess: () => toast('Action approved', 'success') })
                  }
                  onReject={() =>
                    resolve.mutate({ actionId: p.actionId, decision: 'reject' }, { onSuccess: () => toast('Action rejected', 'info') })
                  }
                />
              ))}
            </div>
          )}
        </QueryBoundary>
      </Card>

      <ConfirmDialog
        open={confirm}
        title={enabled ? 'Disable autonomous actions?' : 'Enable autonomous actions?'}
        description={
          enabled
            ? 'The agent will stop making changes. The core rate limiter keeps running on the current policy. You can re-enable at any time.'
            : 'The agent will resume taking autonomous actions within the Policy Gate guardrails.'
        }
        confirmLabel={enabled ? 'Disable' : 'Enable'}
        tone={enabled ? 'danger' : 'primary'}
        busy={killSwitch.isPending}
        onConfirm={doToggleKill}
        onCancel={() => setConfirm(false)}
      />
    </div>
  )
}
