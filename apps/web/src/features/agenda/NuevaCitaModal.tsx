import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { X, Search, AlertCircle } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn } from '../../lib/utils'
import { inputUI, textareaUI, btnPrimaryUI, btnOutlineUI, btnIconUI, errorUI } from '../../lib/ui'
import type { Paciente, Doctor, Servicio } from '@pos/types'

interface Props {
  fechaInicial: Date
  // Prefill al crear desde un slot vacio de la grilla
  doctorIdInicial?: number
  horaInicial?: string
  // Prefill al agendar un control desde la ficha del paciente (E2-M4)
  pacienteInicial?: Pick<Paciente, 'id' | 'nombre' | 'apellido'>
  onClose: () => void
}

export function NuevaCitaModal({ fechaInicial, doctorIdInicial, horaInicial, pacienteInicial, onClose }: Props) {
  const qc = useQueryClient()
  const [pacienteQuery, setPacienteQuery] = useState(
    pacienteInicial ? `${pacienteInicial.apellido}, ${pacienteInicial.nombre}` : '',
  )
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<Pick<Paciente, 'id' | 'nombre' | 'apellido'> | null>(pacienteInicial ?? null)
  const [showPacienteList, setShowPacienteList] = useState(false)
  const [doctorId, setDoctorId] = useState(doctorIdInicial ? String(doctorIdInicial) : '')
  const [servicioId, setServicioId] = useState('')
  const [fecha, setFecha] = useState(format(fechaInicial, 'yyyy-MM-dd'))
  const [hora, setHora] = useState(horaInicial ?? '09:00')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState('')
  const searchRef = useRef<HTMLDivElement>(null)

  const { data: pacientesResultado = [] } = useQuery<Pick<Paciente, 'id' | 'nombre' | 'apellido'>[]>({
    queryKey: ['pacientes-search', pacienteQuery],
    queryFn: () =>
      api.get(`/pacientes${pacienteQuery ? `?search=${pacienteQuery}` : ''}`).then((r) => r.data),
    enabled: pacienteQuery.length >= 2 || showPacienteList,
  })

  const { data: doctores = [] } = useQuery<Doctor[]>({
    queryKey: ['doctores'],
    queryFn: () => api.get('/doctores').then((r) => r.data),
  })

  const { data: servicios = [] } = useQuery<Servicio[]>({
    queryKey: ['servicios'],
    queryFn: () => api.get('/servicios').then((r) => r.data),
  })

  const crearCita = useMutation({
    mutationFn: (data: object) => api.post('/citas', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['citas'] })
      onClose()
    },
    onError: (err: any) => {
      setError(err.response?.data?.message || 'Error al crear la cita')
    },
  })

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowPacienteList(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function seleccionarPaciente(p: Pick<Paciente, 'id' | 'nombre' | 'apellido'>) {
    setPacienteSeleccionado(p)
    setPacienteQuery(`${p.apellido}, ${p.nombre}`)
    setShowPacienteList(false)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!pacienteSeleccionado) return setError('Seleccione un paciente')
    if (!doctorId) return setError('Seleccione un doctor')
    if (!servicioId) return setError('Seleccione un servicio')

    crearCita.mutate({
      pacienteId: pacienteSeleccionado.id,
      doctorId: Number(doctorId),
      servicioId: Number(servicioId),
      // El navegador opera en el timezone del consultorio: new Date interpreta
      // hora local y toISOString la convierte al instante UTC correcto.
      fechaHora: new Date(`${fecha}T${hora}:00`).toISOString(),
      notasSecretaria: notas || undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-xl border shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-foreground">Nueva cita</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className={cn(btnIconUI, 'text-muted-foreground hover:bg-muted hover:text-foreground')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Paciente */}
          <div ref={searchRef} className="relative">
            <label className="block text-sm font-medium text-foreground mb-1.5">Paciente</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" aria-hidden="true" />
              <input
                value={pacienteQuery}
                onChange={(e) => {
                  setPacienteQuery(e.target.value)
                  setPacienteSeleccionado(null)
                  setShowPacienteList(true)
                }}
                onFocus={() => setShowPacienteList(true)}
                placeholder="Buscar paciente..."
                className={cn(inputUI, 'pl-9')}
                required
              />
            </div>
            {showPacienteList && pacientesResultado.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-card border rounded-md shadow-lg max-h-48 overflow-auto">
                {pacientesResultado.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => seleccionarPaciente(p)}
                    className="w-full text-left px-4 py-2.5 text-sm cursor-pointer hover:bg-primary/10 focus-visible:outline-none focus-visible:bg-primary/10 transition-colors duration-150"
                  >
                    {p.apellido}, {p.nombre}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Doctor */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Doctor</label>
            <select
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              className={inputUI}
              required
            >
              <option value="">Seleccionar doctor...</option>
              {doctores.map((d) => (
                <option key={d.id} value={d.id}>{d.nombre}{d.especialidad ? ` - ${d.especialidad}` : ''}</option>
              ))}
            </select>
          </div>

          {/* Servicio */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Servicio</label>
            <select
              value={servicioId}
              onChange={(e) => setServicioId(e.target.value)}
              className={inputUI}
              required
            >
              <option value="">Seleccionar servicio...</option>
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre} ({s.duracionMin}min)
                </option>
              ))}
            </select>
          </div>

          {/* Fecha y hora */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Fecha</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className={inputUI}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Hora</label>
              <input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className={inputUI}
                required
              />
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Notas <span className="text-muted-foreground/70 font-normal">(opcional)</span>
            </label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              placeholder="Observaciones para la cita..."
              className={textareaUI}
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
              Cancelar
            </button>
            <button type="submit" disabled={crearCita.isPending} className={cn(btnPrimaryUI, 'flex-1')}>
              {crearCita.isPending ? 'Guardando...' : 'Crear cita'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
