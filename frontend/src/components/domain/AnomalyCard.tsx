import { useNavigate } from 'react-router-dom'
import type { Anomaly } from '@/types'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { timeAgo } from '@/lib/format'

export function AnomalyCard({ anomaly }: { anomaly: Anomaly }) {
  const navigate = useNavigate()
  const isRate = anomaly.metric === 'request_rate'
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-medium text-fg">{anomaly.clientId}</span>
            <StatusBadge value={anomaly.severity} />
          </div>
          <div className="mt-0.5 text-xs text-muted">{anomaly.label}</div>
        </div>
        <span className="text-2xs text-faint">{timeAgo(anomaly.detectedAt)}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <Metric label={isRate ? 'Rate' : 'Value'} value={isRate ? `${anomaly.currentValue} req/s` : String(anomaly.currentValue)} />
        <Metric label="Baseline" value={isRate ? `${anomaly.baseline} req/s` : String(anomaly.baseline)} />
        <Metric label="Z-score" value={anomaly.zScore.toFixed(1)} />
      </div>
      <button className="btn-ghost mt-3 w-full text-xs" onClick={() => navigate(`/investigations/${anomaly.id}`)}>
        Investigate
      </button>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface px-2 py-1.5">
      <div className="text-2xs uppercase tracking-wide text-faint">{label}</div>
      <div className="mt-0.5 font-medium text-fg">{value}</div>
    </div>
  )
}
