import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn } from '../../lib/utils'
import { NotificacionesPanel } from './NotificacionesPanel'

export function NotificacionesBell() {
  const [abierto, setAbierto] = useState(false)

  const { data } = useQuery<{ count: number }>({
    queryKey: ['notificaciones', 'count'],
    queryFn: () => api.get('/notificaciones/no-leidas/count').then((r) => r.data),
    refetchInterval: 30 * 1000,
    staleTime: 15 * 1000,
  })
  const count = data?.count ?? 0

  return (
    <>
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-label={count > 0 ? `Notificaciones (${count} sin leer)` : 'Notificaciones'}
        className={cn(
          'fixed z-30 inline-flex items-center justify-center cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          // Movil: FAB abajo-derecha
          'bottom-5 right-5 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90',
          // Desktop: campana chica arriba-derecha sobre card
          'lg:bottom-auto lg:right-4 lg:top-3 lg:h-11 lg:w-11 lg:rounded-lg lg:bg-card lg:text-foreground lg:border lg:shadow-sm lg:hover:bg-muted',
        )}
      >
        <Bell className="h-6 w-6 lg:h-5 lg:w-5" aria-hidden="true" />
        {count > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-xs font-bold leading-5 text-center tabular-nums ring-2 ring-card"
            aria-hidden="true"
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {abierto && <NotificacionesPanel onClose={() => setAbierto(false)} />}
    </>
  )
}
