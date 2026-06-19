import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Search, AlertCircle, AlertTriangle, MessageCircle, CalendarPlus, Copy, Check, UserPlus, UserRound, Stethoscope, Calendar, Clock, FileText, Mail, ShieldCheck } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn, abrirWhatsApp, publicBaseUrl, formatMoneda } from '../../lib/utils'
import { btnPrimaryUI, btnOutlineUI, errorUI } from '../../lib/ui'
import type { Paciente, Doctor, Servicio } from '@pos/types'
import { ModalHeader } from '../../components/shared/ModalHeader'
import { FloatingInput } from '../../components/shared/FloatingInput'
import { FloatingSelect } from '../../components/shared/FloatingSelect'
import { FloatingTextarea } from '../../components/shared/FloatingTextarea'
import { PacienteModal } from '../pacientes/PacienteModal'
import { useAuthStore } from '../../stores/auth.store'

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
  email?: string | null
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
  const [modalNuevoPaciente, setModalNuevoPaciente] = useState(false)

  // Seguro / cobertura
  const trabajaConAseguradoras = useAuthStore((s) => s.user?.trabajaConAseguradoras)
  const [usarSeguro, setUsarSeguro] = useState(false)
  const [codigoSeguro, setCodigoSeguro] = useState('')
  const [enviarConfirmacion, setEnviarConfirmacion] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  // El usuario tocó el check: dejamos de re-sugerir segun la fecha/hora
  const tocoConfirmacion = useRef(false)

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

  // Detalle de seguro del paciente seleccionado (fetch puntual; la búsqueda devuelve campos limitados)
  const { data: pacienteSeguro } = useQuery<{
    tieneSeguro: boolean
    codigoSeguro: string | null
    aseguradora: { id: number; nombre: string } | null
    categoriaSeguro: { id: number; nombre: string; aseguradoraId: number } | null
  }>({
    queryKey: ['paciente-seguro', pacienteSeleccionado?.id],
    queryFn: () => api.get(`/pacientes/${pacienteSeleccionado!.id}`).then((r) => r.data),
    enabled: !!pacienteSeleccionado && !!trabajaConAseguradoras,
    staleTime: 2 * 60 * 1000,
  })

  // Preview de tarifa: rows { servicioId, montoPaciente, montoAseguradora }
  const categoriaSeguroId = pacienteSeguro?.categoriaSeguro?.id
  const { data: tarifasPreview = [] } = useQuery<
    { servicioId: number; montoPaciente: string; montoAseguradora: string }[]
  >({
    queryKey: ['tarifa-preview', categoriaSeguroId, servicioId],
    queryFn: () =>
      api
        .get(`/tarifas-cobertura?categoriaSeguroId=${categoriaSeguroId}`)
        .then((r) => r.data),
    enabled: usarSeguro && !!categoriaSeguroId && !!servicioId,
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

  // Sugerencia del check "Enviar correo de confirmación": citas a futuro
  // (más de 1 hora) por defecto SÍ; para "ahorita" o menos de 1 hora (walk-in)
  // por defecto NO. Se respeta apenas el usuario lo toca.
  useEffect(() => {
    if (tocoConfirmacion.current) return
    const cuando = new Date(`${fecha}T${hora}:00`).getTime()
    const aFuturo = !Number.isNaN(cuando) && cuando - Date.now() > 60 * 60 * 1000
    setEnviarConfirmacion(aFuturo)
  }, [fecha, hora])

  // Cuando cambia el paciente y llega el detalle de seguro: activar toggle y prellenar código
  useEffect(() => {
    if (!trabajaConAseguradoras) return
    if (pacienteSeguro?.tieneSeguro) {
      setUsarSeguro(true)
      setCodigoSeguro(pacienteSeguro.codigoSeguro ?? '')
    } else {
      setUsarSeguro(false)
      setCodigoSeguro('')
    }
  }, [pacienteSeguro, trabajaConAseguradoras])

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
    const msg = `${saludo}Podés reservar ${queCita}${doctor ? ` con ${doctor}` : ''} en el horario que te resulte más conveniente desde el siguiente enlace: ${buildLinkReserva()}`
    // Sin telefono (futuro paciente), WhatsApp abre el selector de contacto
    abrirWhatsApp(pacienteSeleccionado?.telefono ?? '', msg, pacienteSeleccionado?.pais)
    onClose()
  }

  async function copiarLink() {
    if (!portalListo) return
    try {
      await navigator.clipboard.writeText(buildLinkReserva())
      setCopiadoLink(true)
      // mostrar "Copiado" un instante y cerrar el modal
      setTimeout(onClose, 1000)
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

    const mostrarCobertura = trabajaConAseguradoras && pacienteSeguro?.tieneSeguro
    crearCita.mutate({
      pacienteId: pacienteSeleccionado.id,
      doctorId: Number(doctorId),
      servicioId: Number(servicioId),
      // El navegador opera en el timezone del consultorio: new Date interpreta
      // hora local y toISOString la convierte al instante UTC correcto.
      fechaHora: new Date(`${fecha}T${hora}:00`).toISOString(),
      notasSecretaria: notas || undefined,
      // Solo tiene sentido si el paciente tiene email cargado
      enviarConfirmacion: !!pacienteSeleccionado.email && enviarConfirmacion,
      // Cobertura: solo se envía cuando el bloque está visible
      usaSeguro: mostrarCobertura ? usarSeguro : false,
      codigoSeguro: mostrarCobertura && usarSeguro && codigoSeguro ? codigoSeguro : undefined,
    })
  }

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm modal-fade p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-md">
        <ModalHeader icon={CalendarPlus} title="Nueva cita" onClose={onClose} />

        <form onSubmit={handleSubmit} className="p-6 sm:p-7 space-y-5">
          {/* Paciente: buscador con autocompletado y floating label.
              Usa el patron peer-* de Tailwind (label flota por CSS, sin estado). */}
          <div ref={searchRef}>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 z-10 text-muted-foreground/45 peer-focus:text-primary transition-colors duration-150"
                  aria-hidden="true"
                />
                <input
                  id="cita-paciente"
                  value={pacienteQuery}
                  onChange={(e) => {
                    setPacienteQuery(e.target.value)
                    setPacienteSeleccionado(null)
                    setShowPacienteList(true)
                  }}
                  onFocus={() => setShowPacienteList(true)}
                  placeholder=" "
                  className="peer w-full h-14 rounded-xl border border-input bg-card pl-10 pr-4 text-base sm:text-sm text-foreground hover:border-muted-foreground/35 focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15 transition-colors duration-150"
                  required
                />
                <label
                  htmlFor="cita-paciente"
                  className="pointer-events-none select-none absolute -translate-y-1/2 bg-card px-1 transition-all duration-150
                    top-0 left-3 text-xs font-semibold text-muted-foreground/75
                    peer-placeholder-shown:top-1/2 peer-placeholder-shown:left-10 peer-placeholder-shown:text-sm peer-placeholder-shown:font-normal peer-placeholder-shown:text-muted-foreground/50
                    peer-focus:top-0 peer-focus:left-3 peer-focus:text-xs peer-focus:font-semibold peer-focus:text-primary"
                >
                  Paciente
                </label>
                {showPacienteList && pacientesResultado.length > 0 && (
                  <div className="absolute z-20 top-full w-full mt-1.5 bg-card border rounded-xl shadow-lg max-h-48 overflow-auto">
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
              {/* Alta rapida de un paciente sin salir del modal: al guardar queda
                  seleccionado en la cita (no navega a su ficha). */}
              <button
                type="button"
                onClick={() => setModalNuevoPaciente(true)}
                aria-label="Nuevo paciente"
                title="Nuevo paciente"
                className="inline-flex items-center justify-center h-14 w-14 shrink-0 rounded-xl border bg-card text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150"
              >
                <UserPlus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
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
          <FloatingSelect
            label="Doctor"
            Icon={UserRound}
            value={doctorId}
            onChange={(e) => setDoctorId(e.target.value)}
            required
          >
            <option value="">Seleccionar doctor...</option>
            {doctores.map((d) => (
              <option key={d.id} value={d.id}>{d.nombre}{d.especialidad ? ` - ${d.especialidad}` : ''}</option>
            ))}
          </FloatingSelect>

          {/* Servicio */}
          <FloatingSelect
            label="Servicio"
            Icon={Stethoscope}
            value={servicioId}
            onChange={(e) => setServicioId(e.target.value)}
            required
          >
            <option value="">Seleccionar servicio...</option>
            {servicios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre} ({s.duracionMin}min)
              </option>
            ))}
          </FloatingSelect>

          {/* Bloque Cobertura: solo si el consultorio trabaja con aseguradoras y el paciente tiene seguro */}
          {trabajaConAseguradoras && pacienteSeguro?.tieneSeguro && (() => {
            const tarifaFila = tarifasPreview.find((r) => r.servicioId === Number(servicioId))
            return (
              <div className="space-y-3">
                {/* Toggle "Usar seguro" */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={usarSeguro}
                  onClick={() => setUsarSeguro((v) => !v)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60',
                    usarSeguro ? 'border-input bg-card hover:bg-muted/40' : 'border-input bg-muted/40 hover:bg-muted/60',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <ShieldCheck
                        className={cn('h-4 w-4 shrink-0', usarSeguro ? 'text-primary' : 'text-muted-foreground/50')}
                        aria-hidden="true"
                      />
                      Usar seguro
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {usarSeguro
                        ? 'La cita se facturará con cobertura de la aseguradora.'
                        : 'La cita se atenderá como particular.'}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200',
                      usarSeguro ? 'bg-primary' : 'bg-muted-foreground/30',
                    )}
                  >
                    <span
                      className={cn(
                        'inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200',
                        usarSeguro ? 'translate-x-[22px]' : 'translate-x-0.5',
                      )}
                    />
                  </span>
                </button>

                {/* Detalles de la cobertura cuando el toggle está ON */}
                {usarSeguro && (
                  <div className="rounded-lg border border-input bg-muted/20 px-4 py-3 space-y-3">
                    {/* Aseguradora y categoría (read-only) */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="block text-xs text-muted-foreground mb-0.5">Aseguradora</span>
                        <span className="font-medium text-foreground">{pacienteSeguro.aseguradora?.nombre ?? '—'}</span>
                      </div>
                      <div>
                        <span className="block text-xs text-muted-foreground mb-0.5">Categoría</span>
                        <span className="font-medium text-foreground">{pacienteSeguro.categoriaSeguro?.nombre ?? '—'}</span>
                      </div>
                    </div>

                    {/* Código de asegurado (editable) */}
                    <FloatingInput
                      label="Código de asegurado"
                      value={codigoSeguro}
                      onChange={(e) => setCodigoSeguro(e.target.value)}
                    />

                    {/* Preview de montos */}
                    {servicioId && (
                      tarifaFila ? (
                        <div className="grid grid-cols-2 gap-3 pt-1">
                          <div className="rounded-md bg-card border border-input px-3 py-2 text-center">
                            <span className="block text-xs text-muted-foreground mb-0.5">Paga el paciente</span>
                            <span className="text-base font-semibold tabular-nums text-foreground">
                              {formatMoneda(Number(tarifaFila.montoPaciente))}
                            </span>
                          </div>
                          <div className="rounded-md bg-card border border-input px-3 py-2 text-center">
                            <span className="block text-xs text-muted-foreground mb-0.5">Cubre la aseguradora</span>
                            <span className="text-base font-semibold tabular-nums text-primary">
                              {formatMoneda(Number(tarifaFila.montoAseguradora))}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          Sin tarifa para este servicio: se atenderá como particular.
                        </p>
                      )
                    )}
                  </div>
                )}
              </div>
            )
          })()}

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
          <div className="grid grid-cols-2 gap-4">
            <FloatingInput
              label="Fecha"
              type="date"
              Icon={Calendar}
              alwaysFloat
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              required
            />
            <FloatingInput
              label="Hora"
              type="time"
              Icon={Clock}
              alwaysFloat
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              required
            />
          </div>

          {/* Notas */}
          <FloatingTextarea
            label="Notas (opcional)"
            Icon={FileText}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
          />

          {/* Enviar correo de confirmación: solo si el paciente tiene email.
              Marcado por defecto para citas a futuro; desmarcado para walk-ins. */}
          {pacienteSeleccionado?.email ? (
            <label className="flex items-start gap-3 rounded-xl border border-input bg-card px-4 py-3 cursor-pointer hover:border-muted-foreground/30 transition-colors duration-150">
              <input
                type="checkbox"
                checked={enviarConfirmacion}
                onChange={(e) => {
                  tocoConfirmacion.current = true
                  setEnviarConfirmacion(e.target.checked)
                }}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45 rounded"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Mail className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                  Enviar correo de confirmación
                </span>
                <span className="block text-xs text-muted-foreground mt-0.5 truncate">
                  A {pacienteSeleccionado.email}
                </span>
              </span>
            </label>
          ) : pacienteSeleccionado && 'email' in pacienteSeleccionado ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
              Agregá un email al paciente para enviarle la confirmación.
            </p>
          ) : null}

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
            <button type="submit" disabled={crearCita.isPending} className={cn(btnPrimaryUI, 'flex-1')}>
              {crearCita.isPending ? 'Guardando...' : 'Crear cita'}
            </button>
          </div>
        </form>
      </div>
    </div>
    {modalNuevoPaciente && (
      <PacienteModal
        onClose={() => setModalNuevoPaciente(false)}
        onCreated={(p) => seleccionarPaciente(p)}
      />
    )}
    </>
  )
}
