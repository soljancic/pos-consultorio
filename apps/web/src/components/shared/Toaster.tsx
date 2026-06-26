import { AlertCircle, AlertTriangle, CheckCircle2, X, type LucideIcon } from 'lucide-react'
import { useToastStore, type ToastTipo } from '../../stores/toast.store'
import { cn } from '../../lib/utils'

const ESTILO: Record<ToastTipo, { icon: LucideIcon; clase: string }> = {
  error: {
    icon: AlertCircle,
    clase: 'border-destructive/30 bg-destructive/10 text-destructive',
  },
  warning: {
    icon: AlertTriangle,
    clase: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  success: {
    icon: CheckCircle2,
    clase: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
}

// Stack de toasts top-center. Montado una sola vez en main.tsx. El contenedor no
// captura clicks (pointer-events-none); cada toast si (pointer-events-auto).
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  // Region viva ESTABLE (siempre montada) con aria-live polite: asi los lectores
  // de pantalla (incluido iOS VoiceOver, que necesita la region preexistente)
  // anuncian cada toast al insertarse. Un solo mecanismo de anuncio (la region),
  // sin role por toast, para no duplicar el anuncio en NVDA/JAWS.
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed top-4 left-1/2 z-[60] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 flex-col items-center gap-2"
    >
      {toasts.map((t) => {
        const { icon: Icon, clase } = ESTILO[t.tipo]
        return (
          <div
            key={t.id}
            className={cn(
              'modal-fade modal-pop pointer-events-auto flex w-full items-start gap-2.5 rounded-lg border px-3.5 py-3 shadow-lg backdrop-blur-sm',
              clase,
            )}
          >
            <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p className="flex-1 text-sm font-medium leading-snug text-foreground select-text">{t.mensaje}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Cerrar aviso"
              className="-m-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 cursor-pointer transition-colors duration-150"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
