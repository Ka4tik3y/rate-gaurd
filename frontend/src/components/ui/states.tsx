import type { ReactNode } from 'react'
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

export function LoadingState({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-10 text-sm text-muted', className)} role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-surface-3', className)} aria-hidden />
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center" role="alert">
      <AlertTriangle className="h-6 w-6 text-danger" aria-hidden />
      <div className="text-sm text-fg">Something went wrong</div>
      <div className="max-w-md text-xs text-muted">{message}</div>
      {onRetry && (
        <button className="btn-ghost text-xs" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}

export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <div className="text-faint">{icon ?? <Inbox className="h-6 w-6" aria-hidden />}</div>
      <div className="text-sm text-fg">{title}</div>
      {hint && <div className="max-w-md text-xs text-muted">{hint}</div>}
    </div>
  )
}

/** Wraps a TanStack Query result with consistent loading/error/empty handling. */
export function QueryBoundary<T>({
  query,
  children,
  isEmpty,
  emptyTitle = 'Nothing here yet',
  loading,
}: {
  query: { isLoading: boolean; isError: boolean; error: unknown; data: T | undefined; refetch: () => void }
  children: (data: T) => ReactNode
  isEmpty?: (data: T) => boolean
  emptyTitle?: string
  loading?: ReactNode
}) {
  if (query.isLoading) return <>{loading ?? <LoadingState />}</>
  if (query.isError) return <ErrorState message={(query.error as Error)?.message ?? 'Request failed'} onRetry={query.refetch} />
  if (query.data === undefined) return <EmptyState title={emptyTitle} />
  if (isEmpty && isEmpty(query.data)) return <EmptyState title={emptyTitle} />
  return <>{children(query.data)}</>
}
