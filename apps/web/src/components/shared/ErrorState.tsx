import { AlertTriangle, RefreshCw } from 'lucide-react'
import { cn } from '../../lib/utils'
import { btnOutlineUI } from '../../lib/ui'

// Estado de error compartido: una peticion caida no debe verse igual que una
// lista vacia. Tono destructivo + boton de reintento. Espejo de EmptyState.

interface Props {
  title?: string
  description?: string
  onRetry?: () => void
  className?: string
}

export function ErrorState({
  title = 'No se pudieron cargar los datos',
  description = 'Revisá la conexión e intentá de nuevo.',
  onRetry,
  className,
}: Props) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center text-center py-12 px-4', className)}
      role="alert"
    >
      <span className="grid h-12 w-12 place-items-center rounded-full bg-destructive/10 text-destructive mb-3">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-xs">{description}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={cn(btnOutlineUI, 'mt-4')}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Reintentar
        </button>
      )}
    </div>
  )
}
