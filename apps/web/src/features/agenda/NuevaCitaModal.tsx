import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Search, AlertCircle, AlertTriangle, MessageCircle, CalendarPlus, Copy, Check } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn, abrirWhatsApp, publicBaseUrl } from '../../lib/utils'
import { inputUI, textareaUI, btnPrimaryUI, btnOutlineUI, errorUI } from '../../lib/ui'
import type { Paciente, Doctor, Servicio } from '@pos/types'
import { ModalHeader } from '../../components/shared/ModalHeader'

interface Props {
  fechaInicial: Date
  // Prefill al crear desde un slot vacio de la grilla
  doctorIdInicial?: number
  horaInicial?: string
  // Prefill al agendar un control desde la ficha del paciente (E2-M4)
  pacienteInicial?: Pick<Paciente, 'id' | 'nombre' | 'apellido'>
  onClose: () => void
}

type PacienteBusqueda = Pick<Paciente, 'id' | 'nombre' | 'apellido'> & {
  requierePrepago?: boolean
  deudaTotal?: number
  telefono?: string | null
  pais?: string
}

export function NuevaCitaModal({ fechaInicial, doctorIdInicial, horaInicial, pacienteInicial, onClose }: Props) {
  const qc = useQueryClient()
  const [pacienteQuery, setPacienteQuery] = useState(
    pacienteInicial ? `${pacienteInicial.nombre} ${pacienteInicial.apellido}` : '',
  )
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<PacienteBusqueda | null>(pacienteInicial ?? null)
  const [showPacienteList, setShowPacienteList] = useState(false)
  const [doctorId, setDoctorId] = useState(doctorIdInicial ? String(doctorIdInicial) : '')
  const [servicioId, setServicioId] = useState('')
  const [fecha, setFecha] = useState(format(fechaInicial, 'yyyy-MM-dd'))
  const [hora, setHora] = useState(horaInicial ?? '09:00')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState('')
  const searchRef = useRef<HTMLDivElement>(null)

  const { data: pacientesResultado = [] } = useQuery<PacienteBusqueda[]>({
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

  // Para el link de reserva precargado (solo si el portal esta activo)
  const { data: consultorio } = useQuery<{ slug: string | null; portalActivo: boolean }>({
    queryKey: ['consultorio'],
    queryFn: () => api.get('/consultorio').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })

  // Token opaco del paciente: el link lleva ?p=<token> en vez de sus datos
  // (el backend lo crea si no existe; pedirlo aca deja el click sincrono)
  const { data: tokenPortal } = useQuery<{ token: string }>({
    queryKey: ['portal-token', pacienteSeleccionado?.id],
    queryFn: () => api.get(`/pacientes/${pacienteSeleccionado!.id}/portal-token`).then((r) => r.data),
    enabled: !!pacienteSeleccionado && !!consultorio?.slug && consultorio.portalActivo,
    staleTime: 5 * 60 * 1000,
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

  function seleccionarPaciente(p: PacienteBusqueda) {
    setPacienteSeleccionado(p)
    setPacienteQuery(`${p.nombre} ${p.apellido}`)
    setShowPacienteList(false)
  }

  // Link de reserva del portal: alternativa a crear la cita. Lo unico obligatorio
  // es el portal activo; doctor, servicio y paciente son OPCIONALES, asi se puede
  // enviar a alguien que aun NO es paciente. Si hay paciente, el link va precargado
  // con su token opaco (sus datos personales NO viajan en la URL).
  const portalListo = !!(consultorio?.slug && consultorio.portalActivo)
  const [copiadoLink, setCopiadoLink] = useState(false)

  function buildLinkReserva() {
    const query = new URLSearchParams()
    if (doctorId) query.set('doctor', doctorId)
    if (servicioId) query.set('servicio', servicioId)
    if (pacienteSeleccionado && tokenPortal?.token) query.set('p', tokenPortal.token)
    const qs = query.toString()
    return `${publicBaseUrl()}/reservar/${consultorio!.slug}${qs ? `?${qs}` : ''}`
  }

  function enviarLinkReserva() {
    if (!portalListo) return
    const servicio = servicios.find((s) => String(s.id) === servicioId)?.nombre
    const doctor = doctores.find((d) => String(d.id) === doctorId)?.nombre
    const saludo = pacienteSeleccionado ? `Hola ${pacienteSeleccionado.nombre}! ` : '¡Hola! '
    const queCita = servicio ? `tu cita de ${servicio}` : 'tu cita'
    const msg = `${saludo}Reservá ${queCita}${doctor ? ` con ${doctor}` : ''} en el horario que mejor te quede: ${buildLinkReserva()}`
    // Sin telefono (futuro paciente), WhatsApp abre el selector de contacto
    abrirWhatsApp(pacienteSeleccionado?.telefono ?? '', msg, pacienteSeleccionado?.pais)
    onClose()
  }

  async function copiarLink() {
    if (!portalListo) return
    try {
      await navigator.clipboard.writeText(buildLinkReserva())
      setCopiadoLink(true)
      setTimeout(() => setCopiadoLink(false), 2000)
    } catch {
      setError('No se pudo copiar el link')
    }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm modal-fade p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-md">
        <ModalHeader icon={CalendarPlus} title="Nueva cita" onClose={onClose} />

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
                    {p.nombre} {p.apellido}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* E3 item 11: alerta de prepago — informa, no bloquea */}
          {pacienteSeleccionado?.requierePrepago && (
            <p
              role="alert"
              className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              Este paciente requiere prepago por inasistencias previas. Se recomienda cobrar antes de confirmar.
            </p>
          )}

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

          {/* Link de reserva del portal: alternativa a crear la cita. Siempre
              visible con el portal activo; sirve aunque no haya nada elegido
              (futuro paciente). Si hay paciente, va precargado. */}
          {portalListo && (
            <div>
              <div className="flex gap-2">
                <button type="button" onClick={enviarLinkReserva} className={cn(btnOutlineUI, 'flex-1')}>
                  <MessageCircle className="h-4 w-4 text-accent" aria-hidden="true" />
                  Enviar link de reserva por WhatsApp
                </button>
                <button
                  type="button"
                  onClick={copiarLink}
                  aria-label="Copiar link de reserva"
                  className={cn(btnOutlineUI, 'px-3 shrink-0')}
                >
                  {copiadoLink ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" aria-hidden="true" />
                      Copiar
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                {pacienteSeleccionado
                  ? 'El paciente recibe el link con sus datos precargados y elige fecha y hora en el portal.'
                  : 'Para alguien que aún no es paciente: se abre WhatsApp para elegir el contacto (o copiá el link). La persona elige fecha y hora y carga sus datos en el portal.'}
              </p>
            </div>
          )}

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
