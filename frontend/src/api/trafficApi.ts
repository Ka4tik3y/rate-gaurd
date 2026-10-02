import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { config, RANGE_SECONDS, type TimeRange } from '@/config'
import { http } from '@/lib/http'
import { mockApi } from '@/mocks/api'
import { qk } from './queryKeys'
import type { Anomaly, TrafficSeries } from '@/types'

export interface TrafficTally {
  allowed: number
  limited: number
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
