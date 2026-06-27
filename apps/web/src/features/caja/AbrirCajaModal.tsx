import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Unlock } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn, simboloMoneda } from '../../lib/utils'
import { btnPrimaryUI, btnOutlineUI } from '../../lib/ui'
import { ModalHeader } from '../../components/shared/ModalHeader'
import { FloatingInput } from '../../components/shared/FloatingInput'
import { FloatingTextarea } from '../../components/shared/FloatingTextarea'
import { toast } from '../../stores/toast.store'

interface Props {
  onClose: () => void
}

// Apertura del turno (E2-M9): la jornada arranca declarando la caja chica.
// Sin caja abierta no se puede cobrar ni registrar gastos.
export function AbrirCajaModal({ onClose }: Props) {
  const qc = useQueryClient()
  const [monto, setMonto] = useState('')
  const [notas, setNotas] = useState('')

  const abrir = useMutation({
    mutationFn: () =>
      api.post('/caja/abrir', {
        montoInicial: parseFloat(monto),
        notasApertura: notas || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja-hoy'] })
      qc.invalidateQueries({ queryKey: ['caja-historial'] })
      qc.invalidateQueries({ queryKey: ['caja-estado'] }) // chip global del shell
      onClose()
    },
    onError: (err: any) => {
      toast.fromError(err, 'Error al abrir la caja')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-xs modal-fade p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-md">
        <ModalHeader icon={Unlock} title="Abrir caja" onClose={onClose} />

        <form
          onSubmit={(e) => { e.preventDefault(); abrir.mutate() }}
          className="p-6 sm:p-7 space-y-5"
        >
          <p className="text-sm text-muted-foreground">
            Declara con cuanto efectivo arranca la jornada (caja chica). El arqueo del cierre
            lo contempla: inicial + cobros en efectivo − gastos en efectivo.
          </p>

          <FloatingInput
            id="abrir-monto"
            label="Monto inicial"
            type="number"
            inputMode="decimal"
            leftSlot={
              <span className="text-sm font-semibold text-primary/70 leading-none">
                {simboloMoneda()}
              </span>
            }
            min={0}
            step="0.01"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            className="tabular-nums"
            autoFocus
            required
          />

          <FloatingTextarea
            id="abrir-notas"
            label="Notas (opcional)"
            rows={2}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className={cn(btnOutlineUI, 'flex-1')}>
              Volver
            </button>
            <button type="submit" disabled={abrir.isPending || monto === ''} className={cn(btnPrimaryUI, 'flex-1')}>
              {abrir.isPending ? 'Abriendo...' : 'Abrir caja'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
