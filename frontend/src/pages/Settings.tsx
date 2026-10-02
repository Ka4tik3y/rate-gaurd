import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { config } from '@/config'
import { useAgentStatus, useKillSwitch } from '@/api/agentApi'
import { PageHeader, Card, CardHeader } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { QueryBoundary } from '@/components/ui/states'
import { useToast } from '@/components/ui/Toaster'

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-2.5 last:border-0">
      <span className="text-sm text-muted">{k}</span>
      <span className="font-mono text-sm text-fg">{v}</span>
    </div>
  )
}

export default function Settings() {
  const status = useAgentStatus()
  const killSwitch = useKillSwitch()
  const { toast } = useToast()
  const [confirm, setConfirm] = useState(false)
  const enabled = status.data?.killSwitchEnabled ?? true

  return (
    <div>
      <PageHeader title="Settings" subtitle="Environment and global controls" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Environment" />
          <Row k="Data source" v={<StatusBadge value={config.useMocks ? 'MOCK' : 'LIVE'} tone={config.useMocks ? 'warn' : 'ok'} />} />
          <Row k="API base URL" v={config.apiBaseUrl} />
          <Row k="Agent API URL" v={config.agentApiUrl} />
          <Row k="Poll interval" v={`${config.pollIntervalMs} ms`} />
          {config.useMocks && (
            <p className="mt-3 text-xs text-faint">
              Running on the in-repo mock layer. Set <code>VITE_USE_MOCKS=false</code> and the backend URLs to connect the
              live Spring Boot gateway and FastAPI agent (see docs/api-contract.md).
            </p>
          )}
        </Card>

        <Card>
          <CardHeader title="Global AI kill switch" />
          <QueryBoundary query={status}>
            {(s) => (
              <>
                <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-fg">
                    <ShieldAlert className="h-4 w-4 text-warn" /> Autonomous actions
                  </div>
                  <StatusBadge value={s.killSwitchEnabled ? 'ENABLED' : 'DISABLED'} tone={s.killSwitchEnabled ? 'ok' : 'danger'} />
                </div>
                <p className="mt-3 text-sm text-muted">
                  {s.killSwitchEnabled
                    ? 'The agent may take autonomous actions within the Policy Gate guardrails.'
                    : 'Autonomous actions are disabled. The core rate limiter continues operating normally.'}
                </p>
                <button
                  className={enabled ? 'btn-danger mt-3 w-full' : 'btn-primary mt-3 w-full'}
                  onClick={() => setConfirm(true)}
                  disabled={killSwitch.isPending}
                >
                  {enabled ? 'Disable autonomous actions' : 'Enable autonomous actions'}
                </button>
              </>
            )}
          </QueryBoundary>
        </Card>
      </div>

      <ConfirmDialog
        open={confirm}
        title={enabled ? 'Disable autonomous actions?' : 'Enable autonomous actions?'}
        description={
          enabled
            ? 'The agent will stop making changes. The core rate limiter keeps running on the current policy.'
            : 'The agent will resume taking autonomous actions within the Policy Gate guardrails.'
        }
        confirmLabel={enabled ? 'Disable' : 'Enable'}
        tone={enabled ? 'danger' : 'primary'}
        busy={killSwitch.isPending}
        onConfirm={() => {
          killSwitch.mutate(!enabled, {
            onSuccess: () => toast(enabled ? 'Autonomous actions disabled' : 'Autonomous actions enabled', enabled ? 'info' : 'success'),
          })
          setConfirm(false)
        }}
        onCancel={() => setConfirm(false)}
      />
    </div>
  )
}
