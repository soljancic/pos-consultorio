import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, AlertCircle, AlertTriangle } from 'lucide-react'
import { EstadoCita, type Cita } from '@pos/types'
import { api } from '../../lib/api-client'
import { formatFecha, formatHora, cn } from '../../lib/utils'
import { inputUI, btnOutlineUI, btnIconUI, errorUI } from '../../lib/ui'

interface Props {
  cita: Cita
  onClose: () => void
}

// Cancelar con confirmacion + motivo opcional. El backend anula el cobro
// (sin pagos) o responde 409 si la cita ya tiene pagos registrados.
export function CancelarCitaModal({ cita, onClose }: Props) {
  const qc = useQueryClient()
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')

  const cancelar = useMutation({
    mutationFn: () =>
      api.put(`/citas/${cita.id}/estado`, {
        estado: EstadoCita.CANCELADA,
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
      setError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al cancelar')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-xl border shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <span className="bg-destructive/10 text-destructive rounded-md p-1.5">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            </span>
            Cancelar cita
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
            Se cancela la cita de{' '}
            <span className="font-semibold">
              {cita.paciente?.apellido}, {cita.paciente?.nombre}
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
              placeholder="Ej: el paciente aviso que no puede venir"
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
              {cancelar.isPending ? 'Cancelando...' : 'Cancelar cita'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
