import { useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { RotateCcw } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatMoneda, cn } from '../../lib/utils'
import { btnOutlineUI } from '../../lib/ui'

export interface VentaDetalleRow {
  detalleId: number
  fecha: string
  producto: string
  cantidad: number
  precioVenta: string
  subtotal: string
  paciente: string | null
  cobroEstado: string
  controlaStock: boolean
  devueltoAt: string | null
}

export function DevolverItemModal({
  venta,
  onClose,
}: {
  venta: VentaDetalleRow
  onClose: () => void
}) {
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/cobros/detalle/${venta.detalleId}/devolver`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas-detalle'] })
      qc.invalidateQueries({ queryKey: ['productos'] })
      qc.invalidateQueries({ queryKey: ['deudores'] })
      qc.invalidateQueries({ queryKey: ['caja'] })
      onClose()
    },
  })

  // Escape-to-close — no cierra si la mutación está en curso.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !mutation.isPending) onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [mutation.isPending, onClose])

  const subtotal = Number(venta.subtotal)

  return (
    // Chrome idéntico a ProductoModal: bg-slate-950/55 + backdrop-blur-sm + modal-fade
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm modal-fade p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="devolver-title"
      aria-describedby="devolver-efectos"
    >
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-md">
        <div className="p-6 space-y-4">
          {/* Encabezado */}
          <div className="flex items-center gap-3">
            <span
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400"
              aria-hidden="true"
            >
              <RotateCcw className="h-5 w-5" />
            </span>
            <h2
              id="devolver-title"
              className="text-lg font-semibold text-foreground"
            >
              Deshacer venta
            </h2>
          </div>

          {/* Resumen de la venta */}
          <p className="text-sm text-muted-foreground">
            Vas a deshacer la venta de{' '}
            <span className="font-medium text-foreground">
              <span className="tabular-nums">{venta.cantidad}</span>× {venta.producto}
            </span>{' '}
            (
            <span className="font-medium text-foreground tabular-nums">
              {formatMoneda(subtotal)}
            </span>
            ). Esto:
          </p>

          {/* Efectos de la acción */}
          <ul
            id="devolver-efectos"
            className="space-y-2 text-sm text-foreground"
          >
            {venta.controlaStock && (
              <li className="flex items-start gap-2">
                <RotateCcw
                  className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span>
                  Devuelve{' '}
                  <span className="font-medium tabular-nums">{venta.cantidad}</span>{' '}
                  {venta.cantidad === 1 ? 'unidad' : 'unidades'} al stock.
                </span>
              </li>
            )}
            <li className="flex items-start gap-2">
              <RotateCcw
                className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span>
                Revierte{' '}
                <span className="font-medium tabular-nums">{formatMoneda(subtotal)}</span>{' '}
                de la venta (baja la deuda y/o reembolsa lo ya pagado en la misma
                forma cobrada).
              </span>
            </li>
          </ul>

          {/* Error del backend */}
          {mutation.isError && (
            <p role="alert" className="text-sm text-destructive">
              {(
                mutation.error as {
                  response?: { data?: { message?: string } }
                }
              )?.response?.data?.message ??
                'No se pudo deshacer la venta. Revisá que la caja esté abierta e intentá de nuevo.'}
            </p>
          )}

          {/* Acciones */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              // autoFocus en Cancelar: acción segura por defecto en modales destructivos.
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              onClick={onClose}
              disabled={mutation.isPending}
              className={btnOutlineUI}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className={cn(
                'inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-lg text-sm font-semibold cursor-pointer',
                'bg-amber-600 text-white hover:bg-amber-700',
                'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-amber-500/60 focus-visible:ring-offset-2',
                'disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-150',
              )}
            >
              {mutation.isPending ? 'Deshaciendo...' : 'Deshacer venta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
