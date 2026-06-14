import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, AlertTriangle, UserX } from 'lucide-react'
import { EstadoCita, type Cita } from '@pos/types'
import { api } from '../../lib/api-client'
import { formatFecha, formatHora, cn } from '../../lib/utils'
import { inputUI, btnOutlineUI, errorUI } from '../../lib/ui'
import { ModalHeader } from '../../components/shared/ModalHeader'

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
  const [error, setError] = useState('')
  const t = TEXTOS[modo]
  const Icono = modo === 'cancelar' ? AlertTriangle : UserX

  const cancelar = useMutation({
    mutationFn: () =>
      api.put(`/citas/${cita.id}/estado`, {
        estado: modo === 'cancelar' ? EstadoCita.CANCELADA : EstadoCita.NO_ASISTIO,
        motivo: motivo || undefined,
      }),
    onSuccess: () => {
      for (const key of ['citas', 'deudores', 'deudores-resumen', 'pacientes', 'paciente', 'cobro-cita']) {
        qc.invalidateQueries({ queryKey: [key] })
      }
      onClose()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al guardar')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm modal-fade p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-md">
        <ModalHeader icon={Icono} title={t.titulo} tone="destructive" onClose={onClose} />

        <div className="p-6 space-y-4">
          <p className="text-sm text-foreground">
            {t.verbo} la cita de{' '}
            <span className="font-semibold">
              {cita.paciente?.nombre} {cita.paciente?.apellido}
            </span>{' '}
            del {formatFecha(cita.fechaHora)} a las {formatHora(cita.fechaHora)}. El cobro
            asociado queda anulado. Se puede reabrir despues como Pendiente.
          </p>

          <div>
            <label htmlFor="cancelar-motivo" className="block text-sm font-medium text-foreground mb-1.5">
              Motivo <span className="text-muted-foreground/70 font-normal">(opcional)</span>
            </label>
            <input
              id="cancelar-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={t.placeholderMotivo}
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
              onClick={() => { setError(''); cancelar.mutate() }}
              disabled={cancelar.isPending}
              className="inline-flex items-center justify-center flex-1 h-10 px-4 bg-destructive text-destructive-foreground rounded-md text-sm font-semibold cursor-pointer hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-150"
            >
              {cancelar.isPending ? t.botonCargando : t.boton}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
