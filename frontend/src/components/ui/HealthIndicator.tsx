import { cn } from '@/lib/cn'
import type { HealthState } from '@/types'

const MAP: Record<HealthState, { dot: string; text: string; label: string }> = {
  HEALTHY: { dot: 'bg-ok', text: 'text-ok', label: 'Operational' },
  DEGRADED: { dot: 'bg-warn', text: 'text-warn', label: 'Degraded' },
  OFFLINE: { dot: 'bg-danger', text: 'text-danger', label: 'Offline' },
}

export function HealthIndicator({ state, label, className }: { state: HealthState; label?: string; className?: string }) {
  const m = MAP[state]
  return (
    <span className={cn('inline-flex items-center gap-2 text-xs font-medium', m.text, className)}>
      <span className={cn('h-2 w-2 rounded-full', m.dot)} aria-hidden />
      {label ?? m.label}
    </span>
  )
}
