import { X, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { btnIconUI } from '../../lib/ui'

// Header compartido de los modales (pulido UI 2026-06-13): chip de icono con
// color de marca + barra con tinte suave + titulo/subtitulo + boton cerrar.
// Da identidad y "un poco de color" parejo a todas las pantallas modales.

interface Props {
  icon: LucideIcon
  title: string
  subtitle?: ReactNode
  onClose?: () => void
  // "destructive" para acciones de riesgo (anular, cancelar): tinte rojo
  tone?: 'primary' | 'destructive'
}

export function ModalHeader({ icon: Icon, title, subtitle, onClose, tone = 'primary' }: Props) {
  const danger = tone === 'destructive'
  return (
    <div
      className={cn(
        // sticky + opaco (via/to card) para los modales con scroll; tinte de color
        // en la esquina via el gradiente y el chip de icono
        'sticky top-0 z-10 flex items-start gap-3 px-5 py-4 border-b rounded-t-2xl bg-gradient-to-br via-card to-card',
        danger ? 'from-destructive/[0.12]' : 'from-primary/[0.12]',
      )}
    >
      <span
        className={cn(
          'grid h-9 w-9 place-items-center rounded-lg shrink-0 ring-1',
          danger
            ? 'bg-destructive/10 text-destructive ring-destructive/20'
            : 'bg-primary/10 text-primary ring-primary/20',
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold text-foreground leading-tight">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground truncate">{subtitle}</p>}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className={cn(btnIconUI, 'shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground')}
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
