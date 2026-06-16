import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn } from '../../lib/utils'
import { NotificacionesPanel } from './NotificacionesPanel'
import { reproducirBip } from './sonido'

// variant 'fab'    -> boton flotante abajo-derecha (celular).
// variant 'button' -> boton en linea (barra superior en pc / topbar en tablet);
//                     el color/tamano se ajusta por className segun el contexto.
export function NotificacionesBell({
  variant = 'button',
  className,
}: {
  variant?: 'fab' | 'button'
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)

  const { data } = useQuery<{ count: number }>({
    queryKey: ['notificaciones', 'count'],
    queryFn: () => api.get('/notificaciones/no-leidas/count').then((r) => r.data),
    refetchInterval: 30 * 1000,
    staleTime: 15 * 1000,
  })
  const count = data?.count ?? 0

  // Bip solo cuando el contador SUBE (no en la primera carga ni al bajar)
  const countPrevio = useRef<number | null>(null)
  useEffect(() => {
    if (countPrevio.current !== null && count > countPrevio.current) {
      reproducirBip()
    }
    countPrevio.current = count
  }, [count])

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label={count > 0 ? `Notificaciones (${count} sin leer)` : 'Notificaciones'}
        className={cn(
          'relative inline-flex items-center justify-center cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          variant === 'fab' &&
            'fixed z-30 bottom-5 right-5 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90',
          className,
        )}
      >
        <Bell className={cn(variant === 'fab' ? 'h-6 w-6' : 'h-5 w-5')} aria-hidden="true" />
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
