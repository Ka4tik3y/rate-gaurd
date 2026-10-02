import { useQuery } from '@tanstack/react-query'
import { config } from '@/config'
import { http } from '@/lib/http'
import { mockApi } from '@/mocks/api'
import { qk } from './queryKeys'
import type { Client, ClientDetail, Paginated } from '@/types'

export interface ClientQuery {
  search?: string
  risk?: string
  status?: string
  page?: number
  pageSize?: number
  sort?: keyof Client
  dir?: 'asc' | 'desc'
}

// Real endpoint: GET /api/admin/clients?search=&risk=&status=&page=&pageSize=
export async function listClients(opts: ClientQuery): Promise<Paginated<Client>> {
  if (config.useMocks) return mockApi.listClients(opts)
  const q = new URLSearchParams(
    Object.entries(opts).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]),
  )
  return http<Paginated<Client>>(config.apiBaseUrl, `/api/admin/clients?${q.toString()}`)
}

// Real: composed from GET /admin/rate-limits/{id}, /admin/metrics/{id}, /admin/audit/{id}
export async function getClient(id: string): Promise<ClientDetail> {
  if (config.useMocks) return mockApi.getClient(id)
  return http<ClientDetail>(config.apiBaseUrl, `/api/admin/clients/${encodeURIComponent(id)}`)
}

export function useClients(opts: ClientQuery) {
  return useQuery({
    queryKey: qk.clients(opts),
    queryFn: () => listClients(opts),
    refetchInterval: config.pollIntervalMs,
  })
}

export function useClient(id: string) {
  return useQuery({ queryKey: qk.client(id), queryFn: () => getClient(id), enabled: !!id })
}
