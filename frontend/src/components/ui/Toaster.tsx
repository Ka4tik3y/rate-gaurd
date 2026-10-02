import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { CheckCircle2, Info, XCircle, X } from 'lucide-react'
import { cn } from '@/lib/cn'

type ToastKind = 'success' | 'error' | 'info'
interface Toast {
  id: number
  kind: ToastKind
  message: string
}

interface ToastCtx {
  toast: (message: string, kind?: ToastKind) => void
}

const Ctx = createContext<ToastCtx | null>(null)

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast must be used within ToasterProvider')
  return ctx
}

const ICON = { success: CheckCircle2, error: XCircle, info: Info }
const TONE = { success: 'text-ok', error: 'text-danger', info: 'text-info' }

export function ToasterProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const toast = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      const id = Date.now() + Math.random()
      setToasts((t) => [...t, { id, kind, message }])
      setTimeout(() => remove(id), 4000)
    },
    [remove],
  )

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICON[t.kind]
          return (
            <div key={t.id} className="flex animate-fade-in items-start gap-2 card px-3.5 py-2.5 shadow-lg" role="status">
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', TONE[t.kind])} aria-hidden />
              <span className="text-sm text-fg">{t.message}</span>
              <button className="ml-2 text-muted hover:text-fg" onClick={() => remove(t.id)} aria-label="Dismiss">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </Ctx.Provider>
  )
}
