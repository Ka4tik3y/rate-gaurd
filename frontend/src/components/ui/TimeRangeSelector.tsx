import { RefreshCw } from 'lucide-react'
import { TIME_RANGES, type TimeRange } from '@/config'
import { cn } from '@/lib/cn'

export function TimeRangeSelector({ value, onChange }: { value: TimeRange; onChange: (v: TimeRange) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-surface p-0.5" role="group" aria-label="Time range">
      {TIME_RANGES.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          aria-pressed={value === r}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            value === r ? 'bg-ink text-surface' : 'text-muted hover:text-fg',
          )}
        >
          {r}
        </button>
      ))}
    </div>
  )
}

export function RefreshButton({ onClick, spinning }: { onClick: () => void; spinning?: boolean }) {
  return (
    <button className="btn-ghost text-xs" onClick={onClick} aria-label="Refresh">
      <RefreshCw className={cn('h-3.5 w-3.5', spinning && 'animate-spin')} />
      Refresh
    </button>
  )
}
