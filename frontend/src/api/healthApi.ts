import { useQuery } from '@tanstack/react-query'
import { config } from '@/config'
import { http } from '@/lib/http'
import { mockApi } from '@/mocks/api'
import { qk } from './queryKeys'
import type { SystemHealth } from '@/types'

// Real: composed from GET /actuator/health (gateway) + GET {agent}/health
export async function getHealth(): Promise<SystemHealth> {
  if (config.useMocks) return mockApi.getHealth()
  return http<SystemHealth>(config.apiBaseUrl, '/api/admin/health')
}

export function useHealth() {
  return useQuery({ queryKey: qk.health, queryFn: getHealth, refetchInterval: config.pollIntervalMs })
}
