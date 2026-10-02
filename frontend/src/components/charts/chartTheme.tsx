import type { ReactNode } from 'react'

export const AXIS = { stroke: '#98a1ae', fontSize: 11 }
export const GRID = '#eceef2'
export const COLORS = {
  allowed: '#15935f',
  limited: '#b47812',
  requests: '#2563eb',
  error: '#d23b47',
  reject: '#b47812',
  baseline: '#98a1ae',
}

export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number | string; color?: string }>
  label?: string | number
  formatter?: (name: string, value: number | string) => ReactNode
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs shadow-lg">
      {label !== undefined && <div className="mb-1 font-medium text-muted">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted">{p.name}:</span>
          <span className="font-medium text-fg">
            {formatter && p.name ? formatter(p.name, p.value ?? '') : String(p.value)}
          </span>
        </div>
      ))}
    </div>
  )
}
