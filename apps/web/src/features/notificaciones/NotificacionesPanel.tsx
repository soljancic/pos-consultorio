import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { X, CheckCheck, BellOff } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn, formatFecha, formatHora } from '../../lib/utils'
import { EmptyState } from '../../components/shared/EmptyState'
import { ErrorState } from '../../components/shared/ErrorState'
import { CardListSkeleton } from '../../components/shared/Skeleton'
import { TIPO_META, type Notificacion } from './types'

export function NotificacionesPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  // Cerrar con Escape (mismo gesto que el resto de overlays de la app)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const { data: items = [], isLoading, isError, refetch } = useQuery<Notificacion[]>({
    queryKey: ['notificaciones', 'lista'],
    queryFn: () => api.get('/notificaciones').then((r) => r.data),
  })

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['notificaciones'] })
  }

  const marcarLeida = useMutation({
    mutationFn: (id: number) => api.patch(`/notificaciones/${id}/leida`),
    onSuccess: invalidar,
  })
  const marcarTodas = useMutation({
    mutationFn: () => api.patch('/notificaciones/leidas'),
    onSuccess: invalidar,
  })

  function abrir(n: Notificacion) {
    if (!n.leida) marcarLeida.mutate(n.id)
    if (n.citaId && n.citaFecha) {
      navigate(`/agenda?fecha=${n.citaFecha}&citaId=${n.citaId}`)
    }
    onClose()
  }

  const hayNoLeidas = items.some((n) => !n.leida)

  return (
    <>
      {/* Backdrop: en movil oscurece; en desktop solo captura el click-afuera */}
      <div
        className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:bg-transparent lg:backdrop-blur-none"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-label="Notificaciones"
        className={cn(
          'fixed z-50 flex flex-col bg-card text-foreground shadow-xl modal-fade',
          // Movil: bottom sheet
          'inset-x-0 bottom-0 max-h-[80vh] rounded-t-2xl',
          // Desktop: dropdown anclado arriba-derecha bajo la campana
          'lg:inset-x-auto lg:bottom-auto lg:top-16 lg:right-4 lg:w-96 lg:max-h-[70vh] lg:rounded-xl lg:border',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-sm font-semibold">Notificaciones</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => marcarTodas.mutate()}
              disabled={!hayNoLeidas || marcarTodas.isPending}
              className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-md text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 transition-colors duration-150"
            >
              <CheckCheck className="h-4 w-4" aria-hidden="true" />
              Marcar todas
            </button>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="inline-flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:bg-muted cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 transition-colors duration-150"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-3"><CardListSkeleton /></div>
          ) : isError ? (
            <div className="p-6"><ErrorState onRetry={() => refetch()} /></div>
          ) : items.length === 0 ? (
            <div className="p-8"><EmptyState icon={BellOff} title="Sin notificaciones" description="Cuando haya novedades de citas, aparecerán acá." /></div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => {
                const meta = TIPO_META[n.tipo]
                const Icon = meta.icon
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => abrir(n)}
                      className={cn(
                        'w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset transition-colors duration-150',
                        !n.leida && 'bg-primary/[0.04]',
                      )}
                    >
                      <span className={cn('shrink-0 rounded-lg p-2', meta.clase)}>
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2">
                          <span className={cn('text-sm truncate', n.leida ? 'font-medium' : 'font-semibold')}>
                            {n.titulo}
                          </span>
                          {!n.leida && (
                            <span className="shrink-0 h-2 w-2 rounded-full bg-primary" aria-label="No leída" />
                          )}
                        </span>
                        <span className="block text-sm text-muted-foreground truncate">{n.mensaje}</span>
                        <span className="block text-xs text-muted-foreground/70 tabular-nums mt-0.5">
                          {formatFecha(n.createdAt)} · {formatHora(n.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}
