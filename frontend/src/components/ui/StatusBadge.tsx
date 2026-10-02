import { cn } from '@/lib/cn'

type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral'

const TONE_BY_VALUE: Record<string, Tone> = {
  // health
  HEALTHY: 'ok', DEGRADED: 'warn', OFFLINE: 'danger',
  // decisions / outcomes
  APPROVED: 'ok', KEPT: 'ok', IMPROVED: 'ok',
  REJECTED: 'danger', REVERTED: 'danger', WORSE: 'danger',
  PENDING_APPROVAL: 'warn', PENDING: 'warn', UNCHANGED: 'neutral', NA: 'neutral',
  // severity / risk
  HIGH: 'danger', MEDIUM: 'warn', LOW: 'info',
  NORMAL: 'neutral', ELEVATED: 'warn',
  // client status
  ACTIVE: 'ok', IDLE: 'neutral', BLOCKED: 'danger',
  // endpoint status
  Healthy: 'ok', Warning: 'warn', Critical: 'danger',
  // classification
  HIGH_VALUE: 'info',
  // agent
  AUTONOMOUS: 'ok', SUPERVISED: 'warn', DISABLED: 'danger',
  // audit types
  ANOMALY: 'danger', INVESTIGATION: 'info', SIMULATION: 'info', POLICY: 'warn',
  ACTION: 'info', OUTCOME: 'ok', ROLLBACK: 'danger', RUNNING: 'info', MONITORING: 'warn',
  COMPLETED: 'ok', FAILED: 'danger', ERROR: 'danger', NONE: 'neutral',
}

const CLASSES: Record<Tone, string> = {
  ok: 'bg-ok-dim text-ok',
  warn: 'bg-warn-dim text-warn',
  danger: 'bg-danger-dim text-danger',
  info: 'bg-info-dim text-info',
  neutral: 'bg-surface-3 text-muted',
}

// Literal classes so Tailwind's content scanner keeps them.
const DOT: Record<Tone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
  info: 'bg-info',
  neutral: 'bg-muted',
}

export function StatusBadge({ value, tone, className }: { value: string; tone?: Tone; className?: string }) {
  const resolved = tone ?? TONE_BY_VALUE[value] ?? 'neutral'
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-2xs font-semibold', CLASSES[resolved], className)}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', DOT[resolved])} aria-hidden />
      {value.replace(/_/g, ' ')}
    </span>
  )
}
