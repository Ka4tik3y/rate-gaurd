import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useInvestigation } from '@/api/investigationApi'
import { PageHeader, Card, CardHeader } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { QueryBoundary } from '@/components/ui/states'
import { InvestigationTimeline } from '@/components/domain/InvestigationTimeline'
import { EvidencePanel } from '@/components/domain/EvidencePanel'
import { SimulationComparison } from '@/components/charts/SimulationComparison'
import { pct } from '@/lib/format'
import type { Investigation } from '@/types'

export default function InvestigationDetail() {
  const { id = '' } = useParams()
  const inv = useInvestigation(id)

  return (
    <div>
      <Link to="/investigations" className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to investigations
      </Link>
      <QueryBoundary query={inv}>
        {(i: Investigation) => (
          <>
            <PageHeader
              title={i.id}
              subtitle={
                <>
                  <Link to={`/clients/${i.clientId}`} className="font-mono text-info hover:underline">
                    {i.clientId}
                  </Link>{' '}
                  · {i.trigger}
                </>
              }
              actions={
                <div className="flex items-center gap-2">
                  <StatusBadge value={i.severity} />
                  <StatusBadge value={i.status} />
                </div>
              }
            />

            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-1">
                <CardHeader title="Workflow" subtitle="Detect → investigate → gate → act → verify" />
                <InvestigationTimeline steps={i.steps} />
              </Card>

              <div className="space-y-4 lg:col-span-2">
                <Card>
                  <CardHeader title="Evidence" subtitle="Concise detector evidence (no hidden reasoning)" />
                  <EvidencePanel evidence={i.evidence} />
                </Card>

                <Card>
                  <CardHeader title="Proposed action" action={<StatusBadge value={i.proposal.actionType} />} />
                  <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-4 py-3">
                    <span className="text-sm font-medium text-fg">{i.action}</span>
                    {i.proposal.fromCapacity && i.proposal.toCapacity && (
                      <span className="inline-flex items-center gap-2 font-mono text-sm text-info">
                        {i.proposal.fromCapacity} <ArrowRight className="h-3.5 w-3.5" /> {i.proposal.toCapacity} req/s
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{i.proposal.reason}</p>
                </Card>

                {i.simulation && (
                  <Card>
                    <CardHeader
                      title="Simulation (dry run)"
                      subtitle={`429 ${pct(i.simulation.currentRejectRatio)} → ${pct(i.simulation.simulatedRejectRatio)} · ${pct(i.simulation.rejectReductionPct, 0)} reduction`}
                      action={<StatusBadge value="DRY RUN" tone="info" />}
                    />
                    <SimulationComparison sim={i.simulation} />
                  </Card>
                )}

                <div className="grid gap-4 sm:grid-cols-3">
                  <ResultBox title="Policy Gate" value={i.gateDecision} reasons={i.gateReasons} />
                  <ResultBox title="Execution" value={i.finalState === 'PENDING' || i.finalState === 'REJECTED' ? 'NOT EXECUTED' : 'EXECUTED'} />
                  <ResultBox title="Outcome" value={i.outcome} />
                </div>
              </div>
            </div>
          </>
        )}
      </QueryBoundary>
    </div>
  )
}

function ResultBox({ title, value, reasons }: { title: string; value: string; reasons?: string[] }) {
  return (
    <Card>
      <div className="text-2xs uppercase tracking-wide text-faint">{title}</div>
      <div className="mt-2">
        <StatusBadge value={value} />
      </div>
      {reasons && reasons.length > 0 && <div className="mt-2 text-xs text-muted">{reasons.join('; ')}</div>}
    </Card>
  )
}
