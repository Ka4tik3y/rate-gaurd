import { useQuery } from '@tanstack/react-query'
import { config } from '@/config'
import { http } from '@/lib/http'
import { mockApi } from '@/mocks/api'
import { qk } from './queryKeys'
import type { AuditEvent } from '@/types'

export interface AuditQuery {
  type?: string
  clientId?: string
  search?: string
}

// Real: GET /admin/audit/all (global) or /admin/audit/{clientId}
export async function listAudit(opts: AuditQuery): Promise<AuditEvent[]> {
  if (config.useMocks) return mockApi.listAudit(opts)
  const q = new URLSearchParams(
    Object.entries(opts).filter(([, v]) => v).map(([k, v]) => [k, String(v)]),
  )
  return http<AuditEvent[]>(config.apiBaseUrl, `/api/admin/audit?${q.toString()}`)
}

export function useAudit(opts: AuditQuery) {
  return useQuery({ queryKey: qk.audit(opts), queryFn: () => listAudit(opts), refetchInterval: config.pollIntervalMs })
}
