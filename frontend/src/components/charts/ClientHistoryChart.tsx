import {
  CartesianGrid,
  Line,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ClientDetail } from '@/types'
import { clockTime } from '@/lib/format'
import { AXIS, COLORS, GRID, ChartTooltip } from './chartTheme'

export function ClientHistoryChart({ client, height = 260 }: { client: ClientDetail; height?: number }) {
  const data = client.history.map((p) => ({ ...p, baseline: client.baseline }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(t) => clockTime(Number(t))}
          tick={AXIS}
          axisLine={{ stroke: GRID }}
          tickLine={false}
          minTickGap={48}
        />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} width={44} />
        <Tooltip content={<ChartTooltip />} labelFormatter={(t) => clockTime(Number(t))} />
        <ReferenceLine
          y={client.anomalyThreshold}
          stroke={COLORS.error}
          strokeDasharray="4 4"
          label={{ value: 'anomaly threshold', fill: COLORS.error, fontSize: 10, position: 'insideTopRight' }}
        />
        <Line type="monotone" dataKey="requests" name="Request rate" stroke={COLORS.requests} strokeWidth={1.75} dot={false} />
        <Line type="monotone" dataKey="baseline" name="Baseline" stroke={COLORS.baseline} strokeWidth={1.25} strokeDasharray="5 5" dot={false} />
        <Line type="monotone" dataKey="limited" name="Rate limited" stroke={COLORS.limited} strokeWidth={1.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
