// Centralised runtime configuration, read from Vite env (see .env.example).

function bool(v: string | undefined, dflt: boolean): boolean {
  if (v === undefined) return dflt
  return v === 'true' || v === '1'
}

export const config = {
  // When true, the API layer serves data from src/mocks instead of calling the backend.
  useMocks: bool(import.meta.env.VITE_USE_MOCKS as string | undefined, true),
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080',
  agentApiUrl: (import.meta.env.VITE_AGENT_API_URL as string | undefined) ?? 'http://localhost:8000',
  pollIntervalMs: Number(import.meta.env.VITE_POLL_INTERVAL_MS ?? 5000),
} as const

export type TimeRange = '5m' | '15m' | '1h' | '6h' | '24h'
export const TIME_RANGES: TimeRange[] = ['5m', '15m', '1h', '6h', '24h']

export const RANGE_SECONDS: Record<TimeRange, number> = {
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '6h': 21600,
  '24h': 86400,
}
