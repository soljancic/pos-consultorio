import type { CSSProperties } from 'react'
import { AlertTriangle, CheckCircle2, X, type LucideIcon } from 'lucide-react'
import { useToastStore, DURACION_MS, type ToastTipo } from '../../stores/toast.store'
import { cn } from '../../lib/utils'

// Toast RELLENO: toda la caja del color del tipo, para que resalte. Formato de
// la foto: icono + titulo en negrita + mensaje, X a la derecha, barra de
// progreso abajo. Texto de alto contraste (oscuro sobre ambar; blanco sobre
// rojo/verde). La barra usa bg-black/20 = version mas oscura del fondo.
const ESTILO: Record<ToastTipo, { icon: LucideIcon; titulo: string; box: string; closeHover: string }> = {
  error: {
    icon: AlertTriangle,
    titulo: 'Atención',
    box: 'bg-destructive text-white',
    closeHover: 'hover:bg-white/15',
  },
  warning: {
    icon: AlertTriangle,
    titulo: 'Atención',
    box: 'bg-amber-500 text-amber-950',
    closeHover: 'hover:bg-amber-950/10',
  },
  success: {
    icon: CheckCircle2,
    titulo: 'Listo',
    box: 'bg-emerald-600 text-white',
    closeHover: 'hover:bg-white/15',
  },
}

// La duracion del auto-cierre llega a la barra de progreso por custom prop, asi
// CSS y el setTimeout del store comparten DURACION_MS.
const barStyle = { '--toast-dur': `${DURACION_MS}ms` } as CSSProperties

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
      className="pointer-events-none fixed top-4 left-1/2 z-60 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 flex-col items-center gap-2"
    >
      {toasts.map((t) => {
        const { icon: Icon, titulo, box, closeHover } = ESTILO[t.tipo]
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
                  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-current',
                  closeHover,
                )}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {/* Barra de progreso (4px) del auto-cierre: 100% -> 0% en DURACION_MS,
               version mas oscura del fondo, recortada a las esquinas redondeadas. */}
            <div
              aria-hidden="true"
              style={barStyle}
              className="toast-progress-bar absolute bottom-0 left-0 h-[4px] w-full origin-left bg-black/30"
            />
          </div>
        )
      })}
    </div>
  )
}
