import { StatusBadge } from '@/components/ui/StatusBadge'
import { clockTime } from '@/lib/format'
import type { AuditEvent } from '@/types'

export function AuditTimeline({ events }: { events: AuditEvent[] }) {
  return (
    <ol className="space-y-1">
      {events.map((e) => (
        <li key={e.id} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
          <span className="w-16 shrink-0 pt-0.5 text-right font-mono text-2xs text-faint">{clockTime(e.timestamp)}</span>
          <span className="w-28 shrink-0">
            <StatusBadge value={e.type} />
          </span>
          {e.clientId && <span className="w-24 shrink-0 truncate pt-0.5 font-mono text-xs text-muted">{e.clientId}</span>}
          <span className="flex-1 pt-0.5 text-sm text-fg">{e.summary}</span>
          {e.decision && <StatusBadge value={e.decision} />}
        </li>
      ))}
    </ol>
  )
}
