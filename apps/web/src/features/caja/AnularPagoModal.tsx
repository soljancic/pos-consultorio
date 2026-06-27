import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Undo2 } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatMoneda, cn } from '../../lib/utils'
import { btnOutlineUI, btnPrimaryUI, btnDestructiveUI } from '../../lib/ui'
import { toast } from '../../stores/toast.store'
import { ModalHeader } from '../../components/shared/ModalHeader'
import { FloatingInput } from '../../components/shared/FloatingInput'

export interface PagoAnulable {
  id: number
  monto: number
  cuenta: string // forma de pago / cuenta (ej: "Efectivo")
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
  const [advertencia, setAdvertencia] = useState('')

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
      // Con advertencia el modal queda abierto mostrandola (cero alert nativos)
      if (res.data?.advertencia) setAdvertencia(res.data.advertencia)
      else onClose()
    },
    onError: (err: any) => {
      toast.fromError(err, 'Error al anular el pago')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-xs modal-fade p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-md">
        <ModalHeader icon={Undo2} title="Anular pago" tone="destructive" onClose={onClose} />

        {advertencia ? (
          <div className="p-6 sm:p-7 space-y-5">
            <p className="flex items-start gap-2 text-sm font-medium text-amber-700 dark:text-amber-400 bg-amber-500/15 rounded-md px-3 py-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              Pago anulado. {advertencia}
            </p>
            <button onClick={onClose} className={cn(btnPrimaryUI, 'w-full')}>
              Entendido
            </button>
          </div>
        ) : (
        <div className="p-6 sm:p-7 space-y-5">
          <p className="text-sm text-foreground">
            Se anula el pago de{' '}
            <span className="font-semibold tabular-nums">{formatMoneda(pago.monto)}</span> (
            {pago.cuenta}){pago.descripcion ? ` de ${pago.descripcion}` : ''}. El pago
            original no se borra: se registra una reversa negativa que descuenta de la caja
            de hoy y la deuda del paciente se restaura.
          </p>

          <FloatingInput
            id="anular-motivo"
            label="Motivo (opcional)"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            hint="Ej: se cargó el monto equivocado"
          />

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className={cn(btnOutlineUI, 'flex-1')}>
              Volver
            </button>
            <button
              type="button"
              onClick={() => anular.mutate()}
              disabled={anular.isPending}
              className={cn(btnDestructiveUI, 'flex-1')}
            >
              {anular.isPending ? 'Anulando...' : 'Anular pago'}
            </button>
          </div>
        </div>
        )}
      </div>
    </div>
  )
}
