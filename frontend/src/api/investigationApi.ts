import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { config } from '@/config'
import { http } from '@/lib/http'
import { mockApi } from '@/mocks/api'
import { qk } from './queryKeys'
import type { Investigation } from '@/types'

export interface InvestigateInput {
  clientId: string
  metric: string
  severity: string
  window: string
  currentValue?: number
  baseline?: number
  deviation?: number
  reason?: string
}

// Live action: hand the agent an anomaly to investigate; returns the full investigation.
export async function investigate(input: InvestigateInput): Promise<Investigation> {
  if (config.useMocks) return mockApi.investigate(input)
  return http<Investigation>(config.apiBaseUrl, '/api/admin/agent/investigate', { method: 'POST', body: input })
}

export function useInvestigate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: investigate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.investigations })
      qc.invalidateQueries({ queryKey: qk.agentStatus })
      qc.invalidateQueries({ queryKey: qk.anomalies })
    },
  })
}

// Real: GET /api/admin/investigations
export async function listInvestigations(): Promise<Investigation[]> {
  if (config.useMocks) return mockApi.listInvestigations()
  return http<Investigation[]>(config.apiBaseUrl, '/api/admin/investigations')
}

export async function getInvestigation(id: string): Promise<Investigation> {
  if (config.useMocks) return mockApi.getInvestigation(id)
  return http<Investigation>(config.apiBaseUrl, `/api/admin/investigations/${encodeURIComponent(id)}`)
}

export function useInvestigations() {
  return useQuery({
    queryKey: qk.investigations,
    queryFn: listInvestigations,
    refetchInterval: config.pollIntervalMs,
  })
}

export function useInvestigation(id: string) {
  return useQuery({
    queryKey: qk.investigation(id),
    queryFn: () => getInvestigation(id),
    enabled: !!id,
    refetchInterval: config.pollIntervalMs,
  })
}
