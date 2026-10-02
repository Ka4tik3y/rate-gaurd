import type { ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  sortable?: boolean
  align?: 'left' | 'right'
  className?: string
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  sort,
  onSort,
  empty,
}: {
  columns: Column<T>[]
  rows: T[]
  getRowKey: (row: T) => string
  onRowClick?: (row: T) => void
  sort?: { key: string; dir: 'asc' | 'desc' }
  onSort?: (key: string) => void
  empty?: ReactNode
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={cn('th', c.align === 'right' && 'text-right')}>
                {c.sortable && onSort ? (
                  <button
                    className="inline-flex items-center gap-1 hover:text-fg"
                    onClick={() => onSort(c.key)}
                    aria-label={`Sort by ${c.header}`}
                  >
                    {c.header}
                    {sort?.key === c.key &&
                      (sort.dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                  </button>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td className="td text-center text-sm text-muted" colSpan={columns.length}>
                {empty ?? 'No rows'}
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr
              key={getRowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(onRowClick && 'cursor-pointer hover:bg-surface-2')}
              {...(onRowClick
                ? {
                    tabIndex: 0,
                    role: 'button',
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter') onRowClick(row)
                    },
                  }
                : {})}
            >
              {columns.map((c) => (
                <td key={c.key} className={cn('td', c.align === 'right' && 'text-right', c.className)}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
