import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { config, RANGE_SECONDS, type TimeRange } from '@/config'
import { http } from '@/lib/http'
import { mockApi } from '@/mocks/api'
import { qk } from './queryKeys'
import type { Anomaly, TrafficSeries } from '@/types'

export interface BlockStatus {
  clientBlocked: boolean
  blockRemainingSeconds: number
}

export interface TrafficTally extends BlockStatus {
  allowed: number
  limited: number
  blocked: number
  errors: number
  other: number
  total: number
}

// Live action: send a burst of traffic through the gateway as one client.
export async function generateTraffic(input: {
  clientId: string
  count: number
  concurrency?: number
}): Promise<TrafficTally> {
  if (config.useMocks) return mockApi.sendTraffic(input)
  return http<TrafficTally>(config.apiBaseUrl, '/api/admin/traffic/generate', { method: 'POST', body: input })
}

export function useGenerateTraffic() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: generateTraffic,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.clients({}) })
      qc.invalidateQueries({ queryKey: qk.kpis })
    },
  })
}

// Whether a client is under a temporary block (agent or admin) and how long is left.
export async function getBlockStatus(clientId: string): Promise<BlockStatus> {
  if (config.useMocks) return mockApi.blockStatus(clientId)
  return http<BlockStatus>(config.apiBaseUrl, `/api/admin/clients/${encodeURIComponent(clientId)}/block`)
}

export async function unblockClient(clientId: string): Promise<BlockStatus> {
  if (config.useMocks) return mockApi.unblock(clientId)
  return http<BlockStatus>(config.apiBaseUrl, `/api/admin/clients/${encodeURIComponent(clientId)}/unblock`, {
    method: 'POST',
  })
}

export function useUnblockClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: unblockClient,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.clients({}) })
    },
  })
}

// Real endpoint: GET /api/admin/traffic?rangeSeconds=...
export async function getTraffic(range: TimeRange): Promise<TrafficSeries> {
  const seconds = RANGE_SECONDS[range]
  if (config.useMocks) return mockApi.getTraffic(seconds)
  return http<TrafficSeries>(config.apiBaseUrl, `/api/admin/traffic?rangeSeconds=${seconds}`)
}

export async function getAnomalies(): Promise<Anomaly[]> {
  if (config.useMocks) return mockApi.getAnomalies()
  return http<Anomaly[]>(config.apiBaseUrl, '/api/admin/anomalies')
}

export function useTraffic(range: TimeRange) {
  return useQuery({
    queryKey: qk.traffic(range),
    queryFn: () => getTraffic(range),
    refetchInterval: config.pollIntervalMs,
  })
}

export function useAnomalies() {
  return useQuery({ queryKey: qk.anomalies, queryFn: getAnomalies, refetchInterval: config.pollIntervalMs })
}
