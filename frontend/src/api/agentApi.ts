import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { config } from '@/config'
import { http } from '@/lib/http'
import { mockApi } from '@/mocks/api'
import { qk } from './queryKeys'
import type { AgentEvent, AgentStatus, PendingApproval, PolicyDecision, PolicyGateConfig } from '@/types'

// Real: GET /admin/agent/status
export async function getAgentStatus(): Promise<AgentStatus> {
  if (config.useMocks) return mockApi.getAgentStatus()
  return http<AgentStatus>(config.apiBaseUrl, '/admin/agent/status')
}

export async function getAgentEvents(): Promise<AgentEvent[]> {
  if (config.useMocks) return mockApi.getAgentEvents()
  return http<AgentEvent[]>(config.apiBaseUrl, '/api/admin/agent/events')
}

// Real: POST /admin/agent/kill-switch { enabled }
export async function setKillSwitch(enabled: boolean) {
  if (config.useMocks) return mockApi.setKillSwitch(enabled)
  return http<{ killSwitchEnabled: boolean }>(config.apiBaseUrl, '/admin/agent/kill-switch', {
    method: 'POST',
    body: { enabled },
  })
}

// Demo-only toggle to show the "agent offline, limiter healthy" architectural property.
export async function setAgentOffline(offline: boolean) {
  if (config.useMocks) return mockApi.setAgentOffline(offline)
  return http<{ agentOffline: boolean }>(config.apiBaseUrl, '/api/admin/agent/offline', {
    method: 'POST',
    body: { offline },
  })
}

export async function getGateConfig(): Promise<PolicyGateConfig> {
  if (config.useMocks) return mockApi.getGateConfig()
  return http<PolicyGateConfig>(config.apiBaseUrl, '/api/admin/policy-gate/config')
}

export async function getPolicyDecisions(): Promise<PolicyDecision[]> {
  if (config.useMocks) return mockApi.getPolicyDecisions()
  return http<PolicyDecision[]>(config.apiBaseUrl, '/api/admin/policy-gate/decisions')
}

export async function getPending(): Promise<PendingApproval[]> {
  if (config.useMocks) return mockApi.getPending()
  return http<PendingApproval[]>(config.apiBaseUrl, '/admin/agent/pending')
}

// Real: POST /admin/agent/pending/{id}/approve | /reject
export async function resolvePending(actionId: string, decision: 'approve' | 'reject') {
  if (config.useMocks) return mockApi.resolvePending(actionId, decision)
  return http<{ decision: string }>(config.apiBaseUrl, `/admin/agent/pending/${actionId}/${decision}`, {
    method: 'POST',
  })
}

export function useAgentStatus() {
  return useQuery({ queryKey: qk.agentStatus, queryFn: getAgentStatus, refetchInterval: config.pollIntervalMs })
}
export function useAgentEvents() {
  return useQuery({ queryKey: qk.agentEvents, queryFn: getAgentEvents, refetchInterval: config.pollIntervalMs })
}
export function useGateConfig() {
  return useQuery({ queryKey: qk.gateConfig, queryFn: getGateConfig })
}
export function usePolicyDecisions() {
  return useQuery({ queryKey: qk.gateDecisions, queryFn: getPolicyDecisions, refetchInterval: config.pollIntervalMs })
}
export function usePending() {
  return useQuery({ queryKey: qk.pending, queryFn: getPending, refetchInterval: config.pollIntervalMs })
}

export function useKillSwitch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) => setKillSwitch(enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.agentStatus })
      qc.invalidateQueries({ queryKey: qk.gateConfig })
      qc.invalidateQueries({ queryKey: qk.health })
    },
  })
}

export function useAgentOffline() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (offline: boolean) => setAgentOffline(offline),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.agentStatus })
      qc.invalidateQueries({ queryKey: qk.health })
    },
  })
}

export function useResolvePending() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ actionId, decision }: { actionId: string; decision: 'approve' | 'reject' }) =>
      resolvePending(actionId, decision),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.pending })
      qc.invalidateQueries({ queryKey: qk.agentStatus })
    },
  })
}
