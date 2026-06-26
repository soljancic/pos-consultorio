import { AlertCircle, AlertTriangle, CheckCircle2, X, type LucideIcon } from 'lucide-react'
import { useToastStore, DURACION_MS, type ToastTipo } from '../../stores/toast.store'
import { cn } from '../../lib/utils'

// Toast RELLENO: toda la caja del color del tipo, para que resalte. Formato de
// la foto: icono + titulo en negrita + mensaje, X a la derecha, barra de
// progreso abajo. Texto de alto contraste (oscuro sobre ambar; blanco sobre
// rojo/verde).
const ESTILO: Record<ToastTipo, { icon: LucideIcon; titulo: string; box: string; bar: string; closeHover: string }> = {
  error: {
    icon: AlertCircle,
    titulo: 'Error',
    box: 'bg-destructive text-white',
    bar: 'bg-white/70',
    closeHover: 'hover:bg-white/15',
  },
  warning: {
    icon: AlertTriangle,
    titulo: 'Atención',
    box: 'bg-amber-500 text-amber-950',
    bar: 'bg-amber-950/40',
    closeHover: 'hover:bg-amber-950/10',
  },
  success: {
    icon: CheckCircle2,
    titulo: 'Listo',
    box: 'bg-emerald-600 text-white',
    bar: 'bg-white/70',
    closeHover: 'hover:bg-white/15',
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
        const { icon: Icon, titulo, box, bar, closeHover } = ESTILO[t.tipo]
        return (
          <div
            key={t.id}
            className={cn(
              // Caja rellena de color; overflow-hidden recorta la barra a las esquinas.
              'modal-fade modal-pop pointer-events-auto relative w-full overflow-hidden rounded-lg px-3.5 py-3 shadow-lg',
              box,
            )}
          >
            <div className="flex items-start gap-2.5">
              <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <p className="flex-1 text-sm leading-snug select-text">
                <span className="font-bold">¡{titulo}!</span> {t.mensaje}
              </p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Cerrar aviso"
                className={cn(
                  '-m-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md cursor-pointer transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current',
                  closeHover,
                )}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {/* Barra de progreso del auto-cierre: se vacia en DURACION_MS. */}
            <div
              aria-hidden="true"
              className={cn('absolute bottom-0 left-0 h-1 w-full origin-left', bar)}
              style={{ animation: `toast-progress ${DURACION_MS}ms linear forwards` }}
            />
          </div>
        )
      })}
    </div>
  )
}
