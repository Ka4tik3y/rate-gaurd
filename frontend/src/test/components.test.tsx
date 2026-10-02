import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState, ErrorState, LoadingState, QueryBoundary } from '@/components/ui/states'
import { InvestigationTimeline } from '@/components/domain/InvestigationTimeline'
import type { InvestigationStep } from '@/types'

describe('StatusBadge', () => {
  it('renders the value with spaces instead of underscores', () => {
    render(<StatusBadge value="PENDING_APPROVAL" />)
    expect(screen.getByText('PENDING APPROVAL')).toBeInTheDocument()
  })
})

describe('state components', () => {
  it('shows loading, error and empty states', () => {
    const { rerender } = render(<LoadingState label="Loading data" />)
    expect(screen.getByText('Loading data')).toBeInTheDocument()
    rerender(<ErrorState message="boom" />)
    expect(screen.getByText('boom')).toBeInTheDocument()
    rerender(<EmptyState title="Nothing" />)
    expect(screen.getByText('Nothing')).toBeInTheDocument()
  })

  it('QueryBoundary renders loading, error then data', () => {
    const base = { isLoading: true, isError: false, error: null, data: undefined, refetch: () => {} }
    const { rerender } = render(<QueryBoundary query={base}>{(d: string) => <div>{d}</div>}</QueryBoundary>)
    expect(screen.getByRole('status')).toBeInTheDocument()
    rerender(
      <QueryBoundary query={{ ...base, isLoading: false, isError: true, error: new Error('nope') }}>
        {(d: string) => <div>{d}</div>}
      </QueryBoundary>,
    )
    expect(screen.getByText('nope')).toBeInTheDocument()
    rerender(
      <QueryBoundary query={{ ...base, isLoading: false, data: 'hello' }}>{(d: string) => <div>{d}</div>}</QueryBoundary>,
    )
    expect(screen.getByText('hello')).toBeInTheDocument()
  })
})

describe('ConfirmDialog (kill switch confirmation)', () => {
  it('fires confirm and cancel and hides when closed', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const { rerender } = render(
      <ConfirmDialog open title="Disable autonomous actions?" description="desc" onConfirm={onConfirm} onCancel={onCancel} />,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Confirm'))
    expect(onConfirm).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalledOnce()
    rerender(<ConfirmDialog open={false} title="x" description="y" onConfirm={onConfirm} onCancel={onCancel} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('InvestigationTimeline', () => {
  it('renders each step label', () => {
    const steps: InvestigationStep[] = [
      { key: 'detect', label: 'Anomaly detected', status: 'done', summary: 'spike' },
      { key: 'gate', label: 'Policy Gate', status: 'active' },
      { key: 'final', label: 'Action retained', status: 'pending' },
    ]
    render(<InvestigationTimeline steps={steps} />)
    expect(screen.getByText('Anomaly detected')).toBeInTheDocument()
    expect(screen.getByText('Policy Gate')).toBeInTheDocument()
    expect(screen.getByText('Action retained')).toBeInTheDocument()
  })
})
