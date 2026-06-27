import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, UserX } from 'lucide-react'
import { EstadoCita, type Cita } from '@pos/types'
import { api } from '../../lib/api-client'
import { formatFecha, formatHora, formatMoneda, cn } from '../../lib/utils'
import { btnOutlineUI, btnDestructiveUI } from '../../lib/ui'
import { toast } from '../../stores/toast.store'
import { ModalHeader } from '../../components/shared/ModalHeader'
import { FloatingInput } from '../../components/shared/FloatingInput'

type Modo = 'cancelar' | 'no-asistió'

interface Props {
  cita: Cita
  modo?: Modo
  onClose: () => void
}

const TEXTOS: Record<Modo, {
  titulo: string
  verbo: string
  boton: string
  botonCargando: string
  placeholderMotivo: string
}> = {
  'cancelar': {
    titulo: 'Cancelar cita',
    verbo: 'Se cancela',
    boton: 'Cancelar cita',
    botonCargando: 'Cancelando...',
    placeholderMotivo: 'Ej: el paciente aviso que no puede venir',
  },
  'no-asistió': {
    titulo: 'Marcar No asistió',
    verbo: 'Se marca como No asistió',
    boton: 'Marcar No asistió',
    botonCargando: 'Guardando...',
    placeholderMotivo: 'Ej: no vino ni aviso',
  },
}

// Cancelar / No asistió con confirmacion + motivo opcional. El backend anula
// el cobro (sin pagos) o responde 409 si la cita ya tiene pagos registrados.
export function CancelarCitaModal({ cita, modo = 'cancelar', onClose }: Props) {
  const qc = useQueryClient()
  const [motivo, setMotivo] = useState('')
  const t = TEXTOS[modo]
  const Icono = modo === 'cancelar' ? AlertTriangle : UserX

  const pagado = cita.cobro ? Number(cita.cobro.total) - Number(cita.cobro.saldoPendiente) : 0
  const tienePrepago = modo === 'cancelar' && pagado > 0

  const cancelar = useMutation({
    mutationFn: async (devolver: boolean) => {
      if (modo === 'cancelar' && devolver && pagado > 0) {
        await api.post(`/cobros/cita/${cita.id}/devolver`, { motivo: motivo || undefined })
      }
      return api.put(`/citas/${cita.id}/estado`, {
        estado: modo === 'cancelar' ? EstadoCita.CANCELADA : EstadoCita.NO_ASISTIO,
        motivo: motivo || undefined,
      })
    },
    onSuccess: () => {
      for (const key of ['citas', 'deudores', 'deudores-resumen', 'pacientes', 'paciente', 'cobro-cita', 'caja-hoy']) {
        qc.invalidateQueries({ queryKey: [key] })
      }
      onClose()
    },
    onError: (err: any) => {
      toast.fromError(err, 'Error al guardar')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-xs modal-fade p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-md">
        <ModalHeader icon={Icono} title={t.titulo} tone="destructive" onClose={onClose} />

        <div className="p-6 sm:p-7 space-y-5">
          <p className="text-sm text-foreground">
            {t.verbo} la cita de{' '}
            <span className="font-semibold">
              {cita.paciente?.nombre} {cita.paciente?.apellido}
            </span>{' '}
            del {formatFecha(cita.fechaHora)} a las {formatHora(cita.fechaHora)}. El cobro
            asociado queda anulado. Se puede reabrir despues como Pendiente.
          </p>

          <FloatingInput
            id="cancelar-motivo"
            label="Motivo (opcional)"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            hint={t.placeholderMotivo}
          />

          {tienePrepago && (
            <div className="rounded-lg border border-amber-300/60 bg-amber-500/10 p-3 text-sm text-foreground">
              Esta cita tiene <span className="font-semibold tabular-nums">{formatMoneda(pagado)}</span> prepagados.
              ¿Devolver al paciente o mantener el pago?
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className={cn(btnOutlineUI, 'flex-1')}>
              Volver
            </button>
            {tienePrepago ? (
              <>
                <button type="button" onClick={() => cancelar.mutate(false)}
                  disabled={cancelar.isPending} className={cn(btnOutlineUI, 'flex-1')}>
                  {cancelar.isPending ? 'Procesando...' : 'Mantener'}
                </button>
                <button type="button" onClick={() => cancelar.mutate(true)}
                  disabled={cancelar.isPending} className={cn(btnDestructiveUI, 'flex-1')}>
                  {cancelar.isPending ? 'Procesando...' : 'Devolver y cancelar'}
                </button>
              </>
            ) : (
              <button type="button" onClick={() => cancelar.mutate(false)}
                disabled={cancelar.isPending} className={cn(btnDestructiveUI, 'flex-1')}>
                {cancelar.isPending ? t.botonCargando : t.boton}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
