import { useQuery } from '@tanstack/react-query'
import { config } from '@/config'
import { http } from '@/lib/http'
import { mockApi } from '@/mocks/api'
import { qk } from './queryKeys'
import type { PolicySummary } from '@/types'

// Real endpoint: GET /api/admin/policies
export async function listPolicies(): Promise<PolicySummary[]> {
  if (config.useMocks) return mockApi.listPolicies()
  return http<PolicySummary[]>(config.apiBaseUrl, '/api/admin/policies')
}

export function usePolicies() {
  return useQuery({ queryKey: qk.policies, queryFn: listPolicies })
}
