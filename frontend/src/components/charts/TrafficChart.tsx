import { useNavigate } from 'react-router-dom'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TrafficSeries } from '@/types'
import { clockTime } from '@/lib/format'
import { AXIS, COLORS, GRID, ChartTooltip } from './chartTheme'

export function TrafficChart({ data, height = 280 }: { data: TrafficSeries; height?: number }) {
  const navigate = useNavigate()
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data.points} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="gAllowed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS.allowed} stopOpacity={0.16} />
            <stop offset="100%" stopColor={COLORS.allowed} stopOpacity={0.01} />
          </linearGradient>
          <linearGradient id="gLimited" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS.limited} stopOpacity={0.18} />
            <stop offset="100%" stopColor={COLORS.limited} stopOpacity={0.01} />
          </linearGradient>
        </defs>
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
        <Tooltip
          content={<ChartTooltip />}
          labelFormatter={(t) => clockTime(Number(t))}
        />
        <Area
          type="monotone"
          dataKey="allowed"
          name="Allowed"
          stackId="1"
          stroke={COLORS.allowed}
          fill="url(#gAllowed)"
          strokeWidth={1.5}
        />
        <Area
          type="monotone"
          dataKey="limited"
          name="Rate limited"
          stackId="1"
          stroke={COLORS.limited}
          fill="url(#gLimited)"
          strokeWidth={1.5}
        />
        {data.anomalies.map((a) => (
          <ReferenceDot
            key={a.investigationId}
            x={a.t}
            y={0}
            r={6}
            fill={a.severity === 'HIGH' ? COLORS.error : COLORS.reject}
            stroke="#f7f2e6"
            strokeWidth={2}
            ifOverflow="extendDomain"
            onClick={() => navigate(`/investigations/${a.investigationId}`)}
            style={{ cursor: 'pointer' }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}
