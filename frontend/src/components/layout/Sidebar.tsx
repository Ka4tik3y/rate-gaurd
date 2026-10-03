import { NavLink } from 'react-router-dom'
import { ShieldCheck, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { NAV } from './nav'

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      {/* mobile backdrop */}
      {open && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={cn(
          'fixed z-40 flex h-full w-60 flex-col border-r border-border bg-surface transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center justify-between gap-2 border-b border-border px-4">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-ink text-surface">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-fg">SentinelFlow</div>
              <div className="text-2xs text-faint">Autonomous API Protection</div>
            </div>
          </div>
          <button className="text-muted hover:text-fg lg:hidden" onClick={onClose} aria-label="Close menu">
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV.map((group, gi) => (
            <div key={gi} className="mb-5">
              {group.title && (
                <div className="mb-1.5 px-2 text-2xs font-semibold uppercase tracking-wider text-faint">
                  {group.title}
                </div>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={onClose}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                          isActive
                            ? 'bg-surface-3 font-medium text-fg'
                            : 'text-muted hover:bg-surface-2 hover:text-fg',
                        )
                      }
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-border px-4 py-3 text-2xs text-faint">
          v1.0 · demo build
        </div>
      </aside>
    </>
  )
}
