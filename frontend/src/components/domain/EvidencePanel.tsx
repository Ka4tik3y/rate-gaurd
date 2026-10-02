import type { Evidence } from '@/types'
import { pct, signedPct } from '@/lib/format'

export function EvidencePanel({ evidence }: { evidence: Evidence }) {
  const items: Array<{ label: string; value: string; tone?: string }> = [
    { label: 'Current request rate', value: `${evidence.requestRate} req/s` },
    { label: 'Baseline', value: `${evidence.baseline} req/s` },
    { label: 'Deviation', value: signedPct(evidence.deviationPct, 0), tone: 'text-danger' },
    { label: 'Z-score', value: evidence.zScore.toFixed(1), tone: 'text-danger' },
    { label: '429 ratio', value: pct(evidence.rejectRatio) },
    { label: 'Error ratio', value: pct(evidence.errorRatio) },
    { label: 'Time window', value: evidence.window },
  ]
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
      {items.map((it) => (
        <div key={it.label} className="bg-surface px-3 py-2.5">
          <dt className="text-2xs uppercase tracking-wide text-faint">{it.label}</dt>
          <dd className={`mt-0.5 text-sm font-semibold tabular-nums ${it.tone ?? 'text-fg'}`}>{it.value}</dd>
        </div>
      ))}
    </dl>
  )
}
