import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Skeleton } from './states'

export function KpiCard({
  label,
  value,
  sub,
  deltaPct,
  icon,
  tone = 'info',
  loading,
}: {
  label: string
  value?: ReactNode
  sub?: ReactNode
  deltaPct?: number
  icon?: ReactNode
  tone?: 'ok' | 'warn' | 'danger' | 'info'
  loading?: boolean
}) {
  const toneText = { ok: 'text-ok', warn: 'text-warn', danger: 'text-danger', info: 'text-info' }[tone]
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="text-2xs font-semibold uppercase tracking-wider text-muted">{label}</span>
        {icon && <span className={cn('opacity-80', toneText)}>{icon}</span>}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-24" />
      ) : (
        <div className="mt-2 text-2xl font-semibold tabular-nums text-fg">{value}</div>
      )}
      <div className="mt-1 flex items-center gap-2 text-xs">
        {sub && <span className="text-muted">{sub}</span>}
        {deltaPct !== undefined && (
          <span className={cn('inline-flex items-center gap-0.5 font-medium', deltaPct >= 0 ? 'text-ok' : 'text-danger')}>
            {deltaPct >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(deltaPct * 100).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  )
}
