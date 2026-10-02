import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, FlaskConical, Gauge, RotateCcw, Search, ShieldCheck, Zap } from 'lucide-react'
import type { AgentEvent } from '@/types'
import { cn } from '@/lib/cn'
import { clockTime } from '@/lib/format'

const ICON = {
  detect: AlertTriangle,
  inspect: Search,
  simulate: FlaskConical,
  gate: ShieldCheck,
  act: Zap,
  observe: Gauge,
  keep: CheckCircle2,
  revert: RotateCcw,
}
const TONE = {
  detect: 'text-danger',
  inspect: 'text-info',
  simulate: 'text-info',
  gate: 'text-warn',
  act: 'text-info',
  observe: 'text-info',
  keep: 'text-ok',
  revert: 'text-danger',
}

export function AgentActivityTimeline({ events, linkTo }: { events: AgentEvent[]; linkTo?: string }) {
  const navigate = useNavigate()
  return (
    <ol className="relative space-y-4">
      {events.map((e, i) => {
        const Icon = ICON[e.kind]
        return (
          <li
            key={e.id}
            className={cn('flex gap-3', linkTo && 'cursor-pointer')}
            onClick={linkTo ? () => navigate(linkTo) : undefined}
          >
            <div className="relative flex flex-col items-center">
              <span className={cn('z-10 grid h-8 w-8 place-items-center rounded-full border border-border bg-surface-2', TONE[e.kind])}>
                <Icon className="h-4 w-4" />
              </span>
              {i < events.length - 1 && <span className="absolute top-8 h-full w-px bg-border" />}
            </div>
            <div className="flex-1 pb-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-fg">{e.label}</span>
                <span className="font-mono text-2xs text-faint">{clockTime(e.timestamp)}</span>
              </div>
              <div className="mt-0.5 text-xs text-muted">
                {e.clientId && <span className="font-mono">{e.clientId}</span>}
                {e.detail && <span>{e.clientId ? ' · ' : ''}{e.detail}</span>}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
