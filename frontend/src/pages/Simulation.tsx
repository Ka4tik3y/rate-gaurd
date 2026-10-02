import { useState } from 'react'
import { FlaskConical, ShieldAlert } from 'lucide-react'
import { useClients } from '@/api/clientsApi'
import { useRunSimulation } from '@/api/simulationApi'
import { PageHeader, Card, CardHeader } from '@/components/ui/Card'
import { SimulationComparison } from '@/components/charts/SimulationComparison'
import { LoadingState } from '@/components/ui/states'
import { useToast } from '@/components/ui/Toaster'
import { compactNumber, pct } from '@/lib/format'
import type { SimulationResult } from '@/types'

function Column({ title, sim, kind }: { title: string; sim: SimulationResult; kind: 'current' | 'simulated' }) {
  const allowed = kind === 'current' ? sim.currentAllowed : sim.simulatedAllowed
  const rejected = kind === 'current' ? sim.currentRejected : sim.simulatedRejected
  const ratio = kind === 'current' ? sim.currentRejectRatio : sim.simulatedRejectRatio
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-4">
      <div className="mb-3 text-2xs font-semibold uppercase tracking-wider text-faint">{title}</div>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between"><dt className="text-muted">Requests</dt><dd className="font-semibold tabular-nums text-fg">{compactNumber(sim.observedRequests)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">Allowed</dt><dd className="font-semibold tabular-nums text-ok">{compactNumber(allowed)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">Rejected</dt><dd className="font-semibold tabular-nums text-warn">{compactNumber(rejected)}</dd></div>
        <div className="flex justify-between border-t border-border pt-2"><dt className="text-muted">429 rate</dt><dd className="font-semibold tabular-nums text-fg">{pct(ratio)}</dd></div>
      </dl>
    </div>
  )
}

export default function Simulation() {
  const clients = useClients({ pageSize: 50 })
  const sim = useRunSimulation()
  const { toast } = useToast()
  const [clientId, setClientId] = useState('client-101')
  const [windowMinutes, setWindowMinutes] = useState(10)
  const [currentCapacity, setCurrentCapacity] = useState(100)
  const [proposedCapacity, setProposedCapacity] = useState(150)

  const run = () => {
    sim.mutate(
      { clientId, currentCapacity, proposedCapacity, windowMinutes },
      { onError: (e) => toast((e as Error).message, 'error') },
    )
  }

  return (
    <div>
      <PageHeader title="Simulation" subtitle="Dry-run a proposed limit against historical traffic — no production changes" />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Parameters" />
          <label className="mb-1 block text-xs text-muted">Client</label>
          <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            {(clients.data?.rows ?? [{ clientId: 'client-101' }]).map((c) => (
              <option key={c.clientId} value={c.clientId}>
                {c.clientId}
              </option>
            ))}
          </select>

          <label className="mb-1 mt-3 block text-xs text-muted">Historical window (minutes)</label>
          <select className="input" value={windowMinutes} onChange={(e) => setWindowMinutes(Number(e.target.value))}>
            {[5, 10, 30, 60].map((m) => (
              <option key={m} value={m}>
                Last {m} minutes
              </option>
            ))}
          </select>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">Current (req/s)</label>
              <input className="input" type="number" min={1} value={currentCapacity} onChange={(e) => setCurrentCapacity(Number(e.target.value))} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Proposed (req/s)</label>
              <input className="input" type="number" min={1} value={proposedCapacity} onChange={(e) => setProposedCapacity(Number(e.target.value))} />
            </div>
          </div>

          <button className="btn-primary mt-4 w-full" onClick={run} disabled={sim.isPending}>
            <FlaskConical className="h-4 w-4" />
            {sim.isPending ? 'Running…' : 'Run simulation'}
          </button>
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <CardHeader title="Simulation result" />
            <span className="inline-flex items-center gap-1.5 rounded-md border border-warn/40 bg-warn-dim px-2.5 py-1 text-2xs font-bold uppercase tracking-wider text-warn">
              <ShieldAlert className="h-3.5 w-3.5" /> Dry run — no production changes
            </span>
          </div>

          {sim.isPending && <LoadingState label="Replaying historical traffic…" />}
          {!sim.data && !sim.isPending && (
            <div className="py-10 text-center text-sm text-muted">Set parameters and run a simulation to compare outcomes.</div>
          )}
          {sim.data && !sim.isPending && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Column title="Current" sim={sim.data} kind="current" />
                <Column title="Simulated" sim={sim.data} kind="simulated" />
              </div>
              <div className="my-4 rounded-lg border border-ok/40 bg-ok-dim px-4 py-3 text-center">
                <span className="text-sm text-muted">429 reduction</span>
                <span className="ml-3 text-2xl font-bold text-ok">{pct(sim.data.rejectReductionPct, 0)}</span>
              </div>
              <SimulationComparison sim={sim.data} />
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
