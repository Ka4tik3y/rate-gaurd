import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from './render'
import App from '@/App'
import PolicyGate from '@/pages/PolicyGate'
import Simulation from '@/pages/Simulation'
import Agent from '@/pages/Agent'

describe('routing', () => {
  it('renders the Overview page at /dashboard with sidebar nav', async () => {
    renderWithProviders(<App />, { route: '/dashboard' })
    // KPI label unique to the overview page (awaits the lazy page + mock query)
    expect(await screen.findByText('Total Requests')).toBeInTheDocument()
    // sidebar nav items
    expect(screen.getByText('Investigations')).toBeInTheDocument()
    expect(screen.getByText('Autonomous API Protection')).toBeInTheDocument()
  })

  it('shows a 404 for an unknown route', async () => {
    renderWithProviders(<App />, { route: '/does-not-exist' })
    expect(await screen.findByText('404')).toBeInTheDocument()
  })
})

describe('PolicyGate', () => {
  it('renders guardrails and recent decisions', async () => {
    renderWithProviders(<PolicyGate />)
    expect(await screen.findByText('±50%')).toBeInTheDocument()
    expect(await screen.findByText(/Maximum block duration exceeded/i)).toBeInTheDocument()
  })
})

describe('Simulation (dry run)', () => {
  it('shows the dry-run indicator and produces a result', async () => {
    renderWithProviders(<Simulation />)
    expect(screen.getByText(/Dry run — no production changes/i)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Run simulation'))
    expect(await screen.findByText('429 reduction')).toBeInTheDocument()
  })
})

describe('Agent kill switch', () => {
  it('asks for confirmation before disabling autonomous actions', async () => {
    renderWithProviders(<Agent />)
    const disableBtn = await screen.findByText('Disable autonomous actions')
    fireEvent.click(disableBtn)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Disable autonomous actions?')).toBeInTheDocument()
  })
})
