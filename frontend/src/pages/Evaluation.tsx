import { useState } from 'react'
import { useEvaluations } from '@/api/evaluationApi'
import { PageHeader, Card, CardHeader } from '@/components/ui/Card'
import { QueryBoundary } from '@/components/ui/states'
import { cn } from '@/lib/cn'
import type { EvaluationResult } from '@/types'

type View = 'both' | 'static' | 'adaptive'

export default function Evaluation() {
  const evals = useEvaluations()
  const [active, setActive] = useState(0)
  const [view, setView] = useState<View>('both')

  return (
    <div>
      <PageHeader
        title="Evaluation"
        subtitle="Measured comparison: static rate limiting vs AI-assisted adaptive limiting"
        actions={
          <div className="inline-flex rounded-lg border border-border bg-surface p-0.5" role="group" aria-label="View mode">
            {(['static', 'adaptive', 'both'] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={cn('rounded-md px-2.5 py-1 text-xs font-medium capitalize', view === v ? 'bg-info text-white' : 'text-muted hover:text-fg')}
              >
                {v}
              </button>
            ))}
          </div>
        }
      />

      <QueryBoundary query={evals} isEmpty={(d) => d.length === 0}>
        {(d: EvaluationResult[]) => {
          const scenario = d[Math.min(active, d.length - 1)]
          return (
            <div className="grid gap-4 lg:grid-cols-4">
              <div className="space-y-2 lg:col-span-1">
                {d.map((s, i) => (
                  <button
                    key={s.scenario}
                    onClick={() => setActive(i)}
                    className={cn(
                      'w-full rounded-lg border px-3 py-3 text-left transition-colors',
                      i === active ? 'border-info bg-info-dim' : 'border-border bg-surface hover:bg-surface-2',
                    )}
                  >
                    <div className="text-sm font-medium text-fg">{s.name}</div>
                    <div className="mt-0.5 text-xs text-muted line-clamp-2">{s.description}</div>
                  </button>
                ))}
              </div>

              <Card className="lg:col-span-3">
                <CardHeader title={scenario.name} subtitle={scenario.description} />
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="th">Metric</th>
                        {(view === 'both' || view === 'static') && <th className="th text-right">Static</th>}
                        {(view === 'both' || view === 'adaptive') && <th className="th text-right">AI Adaptive</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {scenario.rows.map((r) => (
                        <tr key={r.metric}>
                          <td className="td text-sm text-fg">{r.metric}</td>
                          {(view === 'both' || view === 'static') && (
                            <td className={cn('td text-right tabular-nums', r.better === 'static' ? 'font-semibold text-ok' : 'text-muted')}>
                              {r.static}
                            </td>
                          )}
                          {(view === 'both' || view === 'adaptive') && (
                            <td className={cn('td text-right tabular-nums', r.better === 'adaptive' ? 'font-semibold text-ok' : 'text-muted')}>
                              {r.adaptive}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-faint">
                  Results are produced by the offline evaluation harness replaying identical traffic under each policy —
                  measured, not asserted. Winning column highlighted in green.
                </p>
              </Card>
            </div>
          )
        }}
      </QueryBoundary>
    </div>
  )
}
