import { useQuery } from '@tanstack/react-query'
import { config } from '@/config'
import { http } from '@/lib/http'
import { mockApi } from '@/mocks/api'
import { qk } from './queryKeys'
import type { EvaluationResult } from '@/types'

// Real: GET /api/admin/evaluation/results (produced by the evaluation harness)
export async function listEvaluations(): Promise<EvaluationResult[]> {
  if (config.useMocks) return mockApi.listEvaluations()
  return http<EvaluationResult[]>(config.apiBaseUrl, '/api/admin/evaluation/results')
}

export function useEvaluations() {
  return useQuery({ queryKey: qk.evaluations, queryFn: listEvaluations })
}
