import { useQuery } from '@tanstack/react-query'
import { config } from '@/config'
import { http } from '@/lib/http'
import { mockApi } from '@/mocks/api'
import { qk } from './queryKeys'
import type { EndpointRow, Kpis } from '@/types'

// Real endpoints (see docs/api-contract.md): GET /api/admin/overview/kpis, /endpoints
export async function getKpis(): Promise<Kpis> {
  if (config.useMocks) return mockApi.getKpis()
  return http<Kpis>(config.apiBaseUrl, '/api/admin/overview/kpis')
}

export async function getTopEndpoints(): Promise<EndpointRow[]> {
  if (config.useMocks) return mockApi.getTopEndpoints()
  return http<EndpointRow[]>(config.apiBaseUrl, '/api/admin/overview/endpoints')
}

export function useKpis() {
  return useQuery({ queryKey: qk.kpis, queryFn: getKpis, refetchInterval: config.pollIntervalMs })
}

export function useTopEndpoints() {
  return useQuery({ queryKey: qk.endpoints, queryFn: getTopEndpoints, refetchInterval: config.pollIntervalMs })
}
