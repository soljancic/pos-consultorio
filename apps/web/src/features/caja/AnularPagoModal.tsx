import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, AlertCircle, Undo2 } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatMoneda, cn } from '../../lib/utils'
import { inputUI, btnOutlineUI, btnIconUI, errorUI } from '../../lib/ui'

export interface PagoAnulable {
  id: number
  monto: number
  formaPago: string
  descripcion?: string // ej: "Perez, Ana - Consulta"
}

interface Props {
  pago: PagoAnulable
  onClose: () => void
}

// Anula un pago con asiento de reversa (E2-M1): el original queda auditado y
// se crea un pago espejo negativo que descuenta de la caja de HOY.
export function AnularPagoModal({ pago, onClose }: Props) {
  const qc = useQueryClient()
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')

  const anular = useMutation({
    mutationFn: () =>
      api.post(`/cobros/pagos/${pago.id}/anular`, { motivo: motivo || undefined }),
    onSuccess: (res) => {
      for (const key of [
        'citas', 'deudores', 'deudores-resumen', 'caja-hoy', 'caja-historial',
        'pacientes', 'paciente', 'cobro-cita',
      ]) {
        qc.invalidateQueries({ queryKey: [key] })
      }
      if (res.data?.advertencia) window.alert(res.data.advertencia)
      onClose()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al anular el pago')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-xl border shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <span className="bg-destructive/10 text-destructive rounded-md p-1.5">
              <Undo2 className="h-4 w-4" aria-hidden="true" />
            </span>
            Anular pago
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
          <p className="text-sm text-foreground">
            Se anula el pago de{' '}
            <span className="font-semibold tabular-nums">{formatMoneda(pago.monto)}</span> (
            {pago.formaPago}){pago.descripcion ? ` de ${pago.descripcion}` : ''}. El pago
            original no se borra: se registra una reversa negativa que descuenta de la caja
            de hoy y la deuda del paciente se restaura.
          </p>

          <div>
            <label htmlFor="anular-motivo" className="block text-sm font-medium text-foreground mb-1.5">
              Motivo <span className="text-muted-foreground/70 font-normal">(opcional)</span>
            </label>
            <input
              id="anular-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: se cargo el monto equivocado"
              className={inputUI}
            />
          </div>

          {error && (
            <p role="alert" className={errorUI}>
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className={cn(btnOutlineUI, 'flex-1')}>
              Volver
            </button>
            <button
              type="button"
              onClick={() => { setError(''); anular.mutate() }}
              disabled={anular.isPending}
              className="inline-flex items-center justify-center flex-1 h-10 px-4 bg-destructive text-destructive-foreground rounded-md text-sm font-semibold cursor-pointer hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-150"
            >
              {anular.isPending ? 'Anulando...' : 'Anular pago'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
