import type { ReactNode } from 'react'

export const AXIS = { stroke: '#9d9381', fontSize: 11 }
export const GRID = '#e0d6c1'
// Dusty, low-saturation series colors that sit on cream paper.
export const COLORS = {
  allowed: '#5f6f45',
  limited: '#9a7334',
  requests: '#4f5a63',
  error: '#9b4a3a',
  reject: '#9a7334',
  baseline: '#9d9381',
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
