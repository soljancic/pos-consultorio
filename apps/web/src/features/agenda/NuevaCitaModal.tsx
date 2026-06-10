import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { X, Search } from 'lucide-react'
import { api } from '../../lib/api-client'
import type { Paciente, Doctor, Servicio } from '@pos/types'

interface Props {
  fechaInicial: Date
  // Prefill al crear desde un slot vacio de la grilla
  doctorIdInicial?: string
  horaInicial?: string
  onClose: () => void
}

export function NuevaCitaModal({ fechaInicial, doctorIdInicial, horaInicial, onClose }: Props) {
  const qc = useQueryClient()
  const [pacienteQuery, setPacienteQuery] = useState('')
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<Pick<Paciente, 'id' | 'nombre' | 'apellido'> | null>(null)
  const [showPacienteList, setShowPacienteList] = useState(false)
  const [doctorId, setDoctorId] = useState(doctorIdInicial ?? '')
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
      doctorId,
      servicioId,
      // El navegador opera en el timezone del consultorio: new Date interpreta
      // hora local y toISOString la convierte al instante UTC correcto.
      fechaHora: new Date(`${fecha}T${hora}:00`).toISOString(),
      notasSecretaria: notas || undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-foreground">Nueva cita</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Paciente */}
          <div ref={searchRef} className="relative">
            <label className="block text-sm font-medium text-foreground mb-1">Paciente</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
              <input
                value={pacienteQuery}
                onChange={(e) => {
                  setPacienteQuery(e.target.value)
                  setPacienteSeleccionado(null)
                  setShowPacienteList(true)
                }}
                onFocus={() => setShowPacienteList(true)}
                placeholder="Buscar paciente..."
                className="w-full pl-9 pr-4 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
                    className="w-full text-left px-4 py-2 text-sm hover:bg-primary/10"
                  >
                    {p.apellido}, {p.nombre}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Doctor */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Doctor</label>
            <select
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
            <label className="block text-sm font-medium text-foreground mb-1">Servicio</label>
            <select
              value={servicioId}
              onChange={(e) => setServicioId(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
              <label className="block text-sm font-medium text-foreground mb-1">Fecha</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Hora</label>
              <input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                required
              />
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Notas <span className="text-muted-foreground/70 font-normal">(opcional)</span>
            </label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              placeholder="Observaciones para la cita..."
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border rounded-md text-sm text-foreground hover:bg-muted/60"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={crearCita.isPending}
              className="flex-1 px-4 py-2 bg-primary text-white rounded-md text-sm hover:bg-primary/90 disabled:opacity-60"
            >
              {crearCita.isPending ? 'Guardando...' : 'Crear cita'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
