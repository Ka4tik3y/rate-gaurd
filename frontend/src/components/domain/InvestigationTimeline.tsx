import { Check, Circle, Loader2, Minus } from 'lucide-react'
import type { InvestigationStep } from '@/types'
import { cn } from '@/lib/cn'
import { clockTime } from '@/lib/format'

const ICON = {
  done: <Check className="h-3.5 w-3.5" />,
  active: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
  pending: <Circle className="h-3 w-3" />,
  skipped: <Minus className="h-3.5 w-3.5" />,
}

const RING = {
  done: 'border-ok bg-ok-dim text-ok',
  active: 'border-info bg-info-dim text-info',
  pending: 'border-border bg-surface-2 text-faint',
  skipped: 'border-border bg-surface-2 text-faint',
}

export function InvestigationTimeline({ steps }: { steps: InvestigationStep[] }) {
  return (
    <ol className="relative">
      {steps.map((s, i) => (
        <li key={s.key} className="flex gap-3 pb-5 last:pb-0">
          <div className="relative flex flex-col items-center">
            <span className={cn('z-10 grid h-7 w-7 place-items-center rounded-full border', RING[s.status])}>
              {ICON[s.status]}
            </span>
            {i < steps.length - 1 && (
              <span className={cn('absolute top-7 h-full w-px', s.status === 'done' ? 'bg-ok/40' : 'bg-border')} />
            )}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-center justify-between gap-2">
              <span className={cn('text-sm font-medium', s.status === 'pending' ? 'text-faint' : 'text-fg')}>
                {s.label}
              </span>
              {s.timestamp && <span className="text-2xs text-faint">{clockTime(s.timestamp)}</span>}
            </div>
            {s.summary && <div className="mt-0.5 text-xs text-muted">{s.summary}</div>}
          </div>
        </li>
      ))}
    </ol>
  )
}
