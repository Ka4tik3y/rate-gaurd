import {
  Activity,
  BarChart3,
  Bot,
  ClipboardList,
  FlaskConical,
  Gauge,
  HeartPulse,
  LayoutDashboard,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  TerminalSquare,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}
export interface NavGroup {
  title?: string
  items: NavItem[]
}

export const NAV: NavGroup[] = [
  {
    items: [
      { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
      { to: '/test', label: 'Test Console', icon: TerminalSquare },
      { to: '/traffic', label: 'Traffic', icon: BarChart3 },
      { to: '/clients', label: 'Clients', icon: Users },
      { to: '/policies', label: 'Policies', icon: Gauge },
    ],
  },
  {
    title: 'AI Operations',
    items: [
      { to: '/agent', label: 'Agent', icon: Bot },
      { to: '/investigations', label: 'Investigations', icon: Search },
      { to: '/policy-gate', label: 'Policy Gate', icon: ShieldCheck },
      { to: '/simulation', label: 'Simulation', icon: FlaskConical },
      { to: '/audit', label: 'Audit Log', icon: ScrollText },
    ],
  },
  {
    title: 'Evaluation',
    items: [{ to: '/evaluation', label: 'Experiments', icon: ClipboardList }],
  },
  {
    title: 'System',
    items: [
      { to: '/health', label: 'Health', icon: HeartPulse },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

export const ACTIVITY_ICON = Activity
