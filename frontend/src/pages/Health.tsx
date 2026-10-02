import { CheckCircle2, Power, XCircle } from 'lucide-react'
import { useAgentOffline } from '@/api/agentApi'
import { useHealth } from '@/api/healthApi'
import { PageHeader, Card, CardHeader } from '@/components/ui/Card'
import { HealthIndicator } from '@/components/ui/HealthIndicator'
import { QueryBoundary } from '@/components/ui/states'
import { useToast } from '@/components/ui/Toaster'
import type { ServiceHealth } from '@/types'

function ServiceRow({ s }: { s: ServiceHealth }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 px-1 py-3 last:border-0">
      <div className="flex items-center gap-3">
        {s.state === 'HEALTHY' ? (
          <CheckCircle2 className="h-4 w-4 text-ok" />
        ) : (
          <XCircle className="h-4 w-4 text-danger" />
        )}
        <div>
          <div className="text-sm font-medium text-fg">
            {s.name}
            {s.critical && <span className="ml-2 rounded bg-surface-3 px-1.5 py-0.5 text-2xs text-muted">core path</span>}
          </div>
          <div className="text-xs text-muted">{s.detail}</div>
        </div>
      </div>
      <HealthIndicator state={s.state} />
    </div>
  )
}

export default function Health() {
  const health = useHealth()
  const agentOffline = useAgentOffline()
  const { toast } = useToast()
  const offline = health.data?.services.find((s) => s.name === 'AI Agent')?.state === 'OFFLINE'

  return (
    <div>
      <PageHeader
        title="System Health"
        subtitle="Service status across the protection platform"
        actions={
          <button
            className="btn-ghost text-xs"
            onClick={() =>
              agentOffline.mutate(!offline, {
                onSuccess: () => toast(offline ? 'Agent back online' : 'Agent taken offline (limiter unaffected)', 'info'),
              })
            }
          >
            <Power className="h-3.5 w-3.5" />
            {offline ? 'Bring agent online' : 'Simulate agent outage'}
          </button>
        }
      />

      <QueryBoundary query={health}>
        {(h) => (
          <>
            {offline && (
              <Card className="mb-4 border-ok/40 bg-ok-dim/40">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ok" />
                  <div>
                    <div className="text-sm font-semibold text-fg">AI agent is offline — and that's safe by design</div>
                    <p className="mt-1 text-sm text-muted">
                      The rate limiter, gateway and Redis continue processing traffic on the current static policy. The AI
                      is an enhancement, never a dependency (architectural rule 1). Autonomous optimisation pauses until the
                      agent returns.
                    </p>
                  </div>
                </div>
              </Card>
            )}
            <div className="mb-4 flex items-center gap-3">
              <span className="text-sm text-muted">Overall</span>
              <HealthIndicator state={h.overall} />
            </div>
            <Card>
              <CardHeader title="Services" />
              {h.services.map((s) => (
                <ServiceRow key={s.name} s={s} />
              ))}
            </Card>
          </>
        )}
      </QueryBoundary>
    </div>
  )
}
