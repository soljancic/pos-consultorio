import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { AlertCircle, CalendarClock, Calendar, Clock, UserRound, Stethoscope } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatHora, cn } from '../../lib/utils'
import { btnPrimaryUI, btnOutlineUI, errorUI } from '../../lib/ui'
import { ModalHeader } from '../../components/shared/ModalHeader'
import { FloatingInput } from '../../components/shared/FloatingInput'
import { FloatingSelect } from '../../components/shared/FloatingSelect'
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm modal-fade p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-md">
        <ModalHeader
          icon={CalendarClock}
          title="Reprogramar cita"
          subtitle={<>{cita.paciente?.nombre} {cita.paciente?.apellido} &bull; hoy {formatHora(cita.fechaHora)}</>}
          onClose={onClose}
        />

        <form onSubmit={handleSubmit} className="p-6 sm:p-7 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <FloatingInput
              id="reprog-fecha"
              label="Nueva fecha"
              type="date"
              Icon={Calendar}
              alwaysFloat
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              required
            />
            <FloatingInput
              id="reprog-hora"
              label="Nueva hora"
              type="time"
              Icon={Clock}
              alwaysFloat
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              required
            />
          </div>

          <FloatingSelect
            id="reprog-doctor"
            label="Doctor"
            Icon={UserRound}
            value={doctorId}
            onChange={(e) => setDoctorId(e.target.value)}
            required
          >
            {doctores.map((d) => (
              <option key={d.id} value={d.id}>{d.nombre}</option>
            ))}
          </FloatingSelect>

          <FloatingSelect
            id="reprog-servicio"
            label="Servicio"
            Icon={Stethoscope}
            value={servicioId}
            onChange={(e) => setServicioId(e.target.value)}
            required
            hint={
              String(cita.servicioId) !== servicioId
                ? 'Al cambiar el servicio, el cobro se recalcula al precio del nuevo servicio.'
                : undefined
            }
          >
            {servicios.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre} ({s.duracionMin}min)</option>
            ))}
          </FloatingSelect>

          <p className="text-xs text-muted-foreground">
            La cita vuelve a estado Pendiente: confirmar de nuevo con el paciente.
          </p>

          {error && (
            <p role="alert" className={errorUI}>
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
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
