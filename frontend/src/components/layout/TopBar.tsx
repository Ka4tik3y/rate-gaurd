import { Link, useLocation } from 'react-router-dom'
import { Bell, Menu } from 'lucide-react'
import { useHealth } from '@/api/healthApi'
import { useAnomalies } from '@/api/trafficApi'
import { HealthIndicator } from '@/components/ui/HealthIndicator'
import { NAV } from './nav'

function titleFor(pathname: string): string {
  for (const group of NAV) {
    for (const item of group.items) {
      if (pathname === item.to || pathname.startsWith(item.to + '/')) return item.label
    }
  }
  if (pathname.startsWith('/clients/')) return 'Client Detail'
  if (pathname.startsWith('/investigations/')) return 'Investigation'
  return 'SentinelFlow'
}

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const { pathname } = useLocation()
  const health = useHealth()
  const anomalies = useAnomalies()
  const overall = health.data?.overall ?? 'HEALTHY'
  const label =
    overall === 'HEALTHY' ? 'All Systems Operational' : overall === 'DEGRADED' ? 'Degraded (core healthy)' : 'Outage'
  const count = anomalies.data?.length ?? 0

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-bg px-4">
      <div className="flex items-center gap-3">
        <button className="text-muted hover:text-fg lg:hidden" onClick={onMenu} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
          <span className="text-faint">SentinelFlow</span>
          <span className="text-faint">/</span>
          <span className="font-medium text-fg">{titleFor(pathname)}</span>
        </nav>
      </div>

      <div className="flex items-center gap-4">
        <span className="hidden items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1 text-2xs font-medium text-muted sm:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-info" /> Production
        </span>
        <HealthIndicator state={overall} label={label} className="hidden md:inline-flex" />
        <Link to="/investigations" className="relative text-muted hover:text-fg" aria-label={`${count} active anomalies`}>
          <Bell className="h-5 w-5" />
          {count > 0 && (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-ink px-1 font-mono text-[10px] font-medium text-surface">
              {count}
            </span>
          )}
        </Link>
      </div>
    </header>
  )
}
