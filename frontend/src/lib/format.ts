// Formatting helpers for compact, readable operational displays.

export function compactNumber(n: number): string {
  if (!isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(/\.00$/, '') + 'M'
  if (abs >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(Math.round(n))
}

export function pct(ratio: number, digits = 1): string {
  if (!isFinite(ratio)) return '—'
  return (ratio * 100).toFixed(digits) + '%'
}

export function signedPct(ratio: number, digits = 1): string {
  const s = (ratio * 100).toFixed(digits)
  return (ratio >= 0 ? '+' : '') + s + '%'
}

export function ms(n: number): string {
  return Math.round(n) + 'ms'
}

export function timeAgo(epochMs: number): string {
  const diff = Date.now() - epochMs
  const s = Math.round(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export function clockTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function dateTime(epochMs: number): string {
  return new Date(epochMs).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
