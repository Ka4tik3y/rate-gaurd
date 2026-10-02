import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { SimulationResult } from '@/types'
import { compactNumber } from '@/lib/format'
import { AXIS, COLORS, GRID, ChartTooltip } from './chartTheme'

export function SimulationComparison({ sim, height = 240 }: { sim: SimulationResult; height?: number }) {
  const data = [
    { name: 'Allowed', Current: sim.currentAllowed, Simulated: sim.simulatedAllowed },
    { name: 'Rejected (429)', Current: sim.currentRejected, Simulated: sim.simulatedRejected },
  ]
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tick={AXIS} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis tickFormatter={(v) => compactNumber(Number(v))} tick={AXIS} axisLine={false} tickLine={false} width={48} />
        <Tooltip content={<ChartTooltip formatter={(_n, v) => compactNumber(Number(v))} />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Current" fill={COLORS.baseline} radius={[4, 4, 0, 0]} />
        <Bar dataKey="Simulated" fill={COLORS.requests} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
