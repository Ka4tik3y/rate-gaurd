import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TrafficPoint } from '@/types'
import { clockTime, pct } from '@/lib/format'
import { AXIS, GRID, ChartTooltip } from './chartTheme'

export function RateChart({
  points,
  dataKey,
  color,
  name,
  height = 180,
}: {
  points: TrafficPoint[]
  dataKey: 'rejectRate' | 'errorRate'
  color: string
  name: string
  height?: number
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
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
        <YAxis tickFormatter={(v) => pct(Number(v), 0)} tick={AXIS} axisLine={false} tickLine={false} width={40} />
        <Tooltip
          content={<ChartTooltip formatter={(_n, v) => pct(Number(v))} />}
          labelFormatter={(t) => clockTime(Number(t))}
        />
        <Line type="monotone" dataKey={dataKey} name={name} stroke={color} strokeWidth={1.75} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
