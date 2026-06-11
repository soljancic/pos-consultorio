import { AlertTriangle, X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { btnOutlineUI, btnIconUI } from '../../lib/ui'

interface Props {
  titulo: string
  mensaje: string
  confirmLabel?: string
  pendiente?: boolean
  onConfirm: () => void
  onClose: () => void
}

// Confirmacion del design system: reemplaza a window.confirm (prohibido en
// CLAUDE.md Don'ts). Para confirmaciones con motivo usar el patron
// CancelarCitaModal.
export function ConfirmarModal({ titulo, mensaje, confirmLabel = 'Confirmar', pendiente, onConfirm, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-xl border shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <span className="bg-destructive/10 text-destructive rounded-md p-1.5">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            </span>
            {titulo}
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className={cn(btnIconUI, 'text-muted-foreground hover:bg-muted hover:text-foreground')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-foreground">{mensaje}</p>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className={cn(btnOutlineUI, 'flex-1')}>
              Volver
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pendiente}
              className="inline-flex items-center justify-center flex-1 h-10 px-4 bg-destructive text-destructive-foreground rounded-md text-sm font-semibold cursor-pointer hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-150"
            >
              {pendiente ? 'Procesando...' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
