import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { X, AlertCircle } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatHora, cn } from '../../lib/utils'
import { inputUI, btnPrimaryUI, btnOutlineUI, btnIconUI, errorUI } from '../../lib/ui'
import type { Cita, Doctor, Servicio } from '@pos/types'

interface Props {
  cita: Cita
  onClose: () => void
}

// Reprogramar = editar fecha/hora/doctor en el lugar (PUT /citas/:id).
// La cita vuelve a PENDIENTE: hay que re-confirmar con el paciente.
export function ReprogramarCitaModal({ cita, onClose }: Props) {
  const qc = useQueryClient()
  const fechaActual = new Date(cita.fechaHora)
  const [fecha, setFecha] = useState(format(fechaActual, 'yyyy-MM-dd'))
  const [hora, setHora] = useState(format(fechaActual, 'HH:mm'))
  const [doctorId, setDoctorId] = useState(String(cita.doctorId))
  const [servicioId, setServicioId] = useState(String(cita.servicioId))
  const [error, setError] = useState('')

  const { data: doctores = [] } = useQuery<Doctor[]>({
    queryKey: ['doctores'],
    queryFn: () => api.get('/doctores').then((r) => r.data),
  })

  const { data: servicios = [] } = useQuery<Servicio[]>({
    queryKey: ['servicios'],
    queryFn: () => api.get('/servicios').then((r) => r.data),
  })

  const reprogramar = useMutation({
    mutationFn: () =>
      api.put(`/citas/${cita.id}`, {
        fechaHora: new Date(`${fecha}T${hora}:00`).toISOString(),
        doctorId: Number(doctorId),
        servicioId: Number(servicioId),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['citas'] })
      onClose()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al reprogramar')
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    reprogramar.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-xl border shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Reprogramar cita</h2>
            <p className="text-sm text-muted-foreground">
              {cita.paciente?.apellido}, {cita.paciente?.nombre} &bull; hoy{' '}
              {formatHora(cita.fechaHora)}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className={cn(btnIconUI, 'text-muted-foreground hover:bg-muted hover:text-foreground')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="reprog-fecha" className="block text-sm font-medium text-foreground mb-1.5">
                Nueva fecha
              </label>
              <input
                id="reprog-fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className={inputUI}
                required
              />
            </div>
            <div>
              <label htmlFor="reprog-hora" className="block text-sm font-medium text-foreground mb-1.5">
                Nueva hora
              </label>
              <input
                id="reprog-hora"
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className={inputUI}
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="reprog-doctor" className="block text-sm font-medium text-foreground mb-1.5">
              Doctor
            </label>
            <select
              id="reprog-doctor"
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              className={inputUI}
              required
            >
              {doctores.map((d) => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="reprog-servicio" className="block text-sm font-medium text-foreground mb-1.5">
              Servicio
            </label>
            <select
              id="reprog-servicio"
              value={servicioId}
              onChange={(e) => setServicioId(e.target.value)}
              className={inputUI}
              required
            >
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre} ({s.duracionMin}min)</option>
              ))}
            </select>
            {String(cita.servicioId) !== servicioId && (
              <p className="text-xs text-muted-foreground mt-1.5">
                Al cambiar el servicio, el cobro se recalcula al precio del nuevo servicio.
              </p>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            La cita vuelve a estado Pendiente: confirmar de nuevo con el paciente.
          </p>

          {error && (
            <p role="alert" className={errorUI}>
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className={cn(btnOutlineUI, 'flex-1')}>
              Cancelar
            </button>
            <button type="submit" disabled={reprogramar.isPending} className={cn(btnPrimaryUI, 'flex-1')}>
              {reprogramar.isPending ? 'Guardando...' : 'Reprogramar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
