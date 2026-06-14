import { cn } from '../../lib/utils'
import { cardUI } from '../../lib/ui'

// Placeholders de carga compartidos. Un esqueleto comunica "cargando" mejor que
// un "Cargando..." suelto y reserva el espacio (evita salto de layout / CLS).
// Respeta prefers-reduced-motion: sin pulso si el usuario lo pidió.

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse motion-reduce:animate-none rounded bg-muted', className)} aria-hidden="true" />
}

// Esqueleto de tabla dentro de una card (mismo contenedor que las listas reales).
export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className={cn(cardUI, 'overflow-hidden')} role="status" aria-label="Cargando">
      <div className="flex gap-4 border-b bg-muted/50 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-4 px-4 py-3.5">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// Esqueleto de lista de tarjetas (Mensajes, lista de Agenda).
export function CardListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Cargando">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={cn(cardUI, 'flex items-center gap-3 p-4')}>
          <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}
