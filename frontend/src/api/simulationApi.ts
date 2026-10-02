import { useMutation } from '@tanstack/react-query'
import { config } from '@/config'
import { http } from '@/lib/http'
import { mockApi } from '@/mocks/api'
import type { SimulationResult } from '@/types'

export interface SimulationInput {
  clientId: string
  currentCapacity: number
  proposedCapacity: number
  windowMinutes: number
}

// Real: POST /admin/rate-limits/{clientId}/simulate (read-only dry run)
export async function runSimulation(input: SimulationInput): Promise<SimulationResult> {
  if (config.useMocks) return mockApi.runSimulation(input)
  return http<SimulationResult>(
    config.apiBaseUrl,
    `/admin/rate-limits/${encodeURIComponent(input.clientId)}/simulate`,
    { method: 'POST', body: input },
  )
}

export function useRunSimulation() {
  return useMutation({ mutationFn: runSimulation })
}
