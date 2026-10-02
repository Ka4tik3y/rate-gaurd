import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useKpis } from '@/api/dashboardApi'
import { useRunSimulation } from '@/api/simulationApi'

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('API hooks (mock mode)', () => {
  it('useKpis resolves with KPI data', async () => {
    const { result } = renderHook(() => useKpis(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.totalRequests).toBeGreaterThan(0)
    expect(result.current.data?.allowedPct).toBeGreaterThan(0)
  })

  it('useRunSimulation returns a reduced 429 ratio for a higher limit', async () => {
    const { result } = renderHook(() => useRunSimulation(), { wrapper: wrapper() })
    result.current.mutate({ clientId: 'client-101', currentCapacity: 100, proposedCapacity: 150, windowMinutes: 10 })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const sim = result.current.data!
    expect(sim.simulatedRejectRatio).toBeLessThanOrEqual(sim.currentRejectRatio)
    expect(sim.rejectReductionPct).toBeGreaterThanOrEqual(0)
  })
})
