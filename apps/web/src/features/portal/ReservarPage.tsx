import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { format, startOfWeek, endOfWeek, endOfMonth, eachDayOfInterval, isSameMonth, isToday, addMonths } from 'date-fns'
import { Stethoscope, CalendarCheck, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, ArrowRight, UserRound, User, Mail, FileText } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatDia, cn } from '../../lib/utils'
import { btnPrimaryUI, cardUI, errorUI } from '../../lib/ui'
import { PAIS_DEFAULT, PAISES } from '../../lib/paises'
import { SelectorPais } from '../../components/shared/SelectorPais'
import { FloatingInput } from '../../components/shared/FloatingInput'
import { FloatingSelect } from '../../components/shared/FloatingSelect'
import { FloatingTextarea } from '../../components/shared/FloatingTextarea'

// Portal publico de reservas (E2.5b): pagina SIN auth ni AppShell, mobile-first.
// Todo se deriva del slug en el backend; aca solo se eligen opciones visibles.

type Info = {
  consultorio: { nombre: string; logoUrl: string | null }
  doctores: Array<{ id: number; nombre: string; especialidad: string | null; colorAgenda: string; servicioIds: number[] }>
  servicios: Array<{ id: number; nombre: string; duracionMin: number }>
}

export function ReservarPage() {
  const { slug } = useParams<{ slug: string }>()
  // El link puede venir precargado: ?doctor= ?servicio= y/o ?p=<token opaco
  // del paciente>. Los datos personales NUNCA viajan en la URL: con ?p= el
  // portal se los pide al backend y el cliente solo elige fecha y hora.
  const [params] = useSearchParams()
  const doctorFijo = params.get('doctor')
  const tokenPaciente = params.get('p')

  const [servicioId, setServicioId] = useState(params.get('servicio') ?? '')
  const [doctorId, setDoctorId] = useState(doctorFijo ?? '')
  const [mesCal, setMesCal] = useState(format(new Date(), 'yyyy-MM'))
  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [telefono, setTelefono] = useState('')
  const [pais, setPais] = useState(PAIS_DEFAULT)
  const [email, setEmail] = useState('')
  const [notas, setNotas] = useState('')
  const [actualizarDatos, setActualizarDatos] = useState(true)
  const [error, setError] = useState('')
  const [confirmacion, setConfirmacion] = useState<any | null>(null)
  // Al revelar el formulario, bajamos el scroll para que se vea la sgte parte
  const datosRef = useRef<HTMLDivElement>(null)

  const { data: info, isLoading, isError } = useQuery<Info>({
    queryKey: ['portal', slug],
    queryFn: () => api.get(`/public/${slug}`).then((r) => r.data),
    retry: 1,
  })

  // Datos del paciente del link precargado (token opaco, no enumerable)
  const { data: prefill } = useQuery<{
    nombre: string; apellido: string; telefono: string | null; pais: string; email: string | null
  }>({
    queryKey: ['portal-prefill', slug, tokenPaciente],
    queryFn: () => api.get(`/public/${slug}/prefill/${tokenPaciente}`).then((r) => r.data),
    enabled: !!tokenPaciente,
    retry: false,
  })

  // El formulario aparece recien al tocar "Siguiente": llevamos el foco/scroll ahi
  useEffect(() => {
    if (mostrarForm) datosRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [mostrarForm])

  useEffect(() => {
    if (!prefill) return
    setNombre(prefill.nombre)
    setApellido(prefill.apellido)
    setTelefono(prefill.telefono ?? '')
    if (PAISES.some((p) => p.codigo === prefill.pais)) setPais(prefill.pais)
    setEmail(prefill.email ?? '')
  }, [prefill])

  // El cliente toco algo de lo precargado: recien ahi se ofrece el check
  // "Actualizar mis datos" (sin cambios no hay nada que sincronizar)
  const datosModificados = !!prefill && (
    nombre !== prefill.nombre ||
    apellido !== prefill.apellido ||
    telefono !== (prefill.telefono ?? '') ||
    email !== (prefill.email ?? '') ||
    (PAISES.some((p) => p.codigo === prefill.pais) && pais !== prefill.pais)
  )

  // Calendario Calendly: dias del mes con al menos un horario libre. Se refresca
  // solo cada 60s (y al volver al foco) para reflejar reservas de otros: isLoading
  // (no isFetching) evita que el poll de fondo parpadee la UI.
  const puedeVerCalendario = !!(servicioId && doctorId)
  const { data: diasData, isLoading: cargandoDias } = useQuery<{ dias: string[] }>({
    queryKey: ['portal-dias', slug, doctorId, servicioId, mesCal],
    queryFn: () =>
      api
        .get(`/public/${slug}/dias?doctorId=${doctorId}&servicioId=${servicioId}&mes=${mesCal}`)
        .then((r) => r.data),
    enabled: puedeVerCalendario,
    refetchInterval: 60_000,
  })
  const diasSet = new Set(diasData?.dias ?? [])

  const puedeBuscarSlots = !!(servicioId && doctorId && fecha)
  const { data: slotsData, isLoading: cargandoSlots } = useQuery<{ slots: string[]; modo: string }>({
    queryKey: ['portal-slots', slug, doctorId, servicioId, fecha],
    queryFn: () =>
      api
        .get(`/public/${slug}/slots?doctorId=${doctorId}&servicioId=${servicioId}&fecha=${fecha}`)
        .then((r) => r.data),
    enabled: puedeBuscarSlots,
    refetchInterval: 60_000,
  })

  const reservar = useMutation({
    mutationFn: () =>
      api.post(`/public/${slug}/reservas`, {
        doctorId: Number(doctorId),
        servicioId: Number(servicioId),
        fecha,
        hora,
        nombre,
        apellido,
        telefono,
        pais,
        email,
        notas: notas || undefined,
        // con token la reserva se asocia al paciente exacto del link
        token: tokenPaciente || undefined,
        // el kardex solo se toca si el cliente cambio algo y marco el check
        actualizarDatos: tokenPaciente ? datosModificados && actualizarDatos : undefined,
      }),
    onSuccess: (res) => setConfirmacion(res.data),
    onError: (err: any) => {
      const msg = err.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'No se pudo reservar, intente de nuevo')
      setHora('')
    },
  })

  if (isLoading) {
    return <div className="min-h-dvh flex items-center justify-center bg-background text-muted-foreground">Cargando...</div>
  }
  if (isError || !info) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background p-6">
        <div className={cn(cardUI, 'p-8 text-center max-w-sm')}>
          <p className="text-sm text-muted-foreground">
            Este portal de reservas no está disponible. Verifique el enlace con el consultorio.
          </p>
        </div>
      </div>
    )
  }

  // Calendario f2: con servicio elegido, solo profesionales que lo atienden
  // (lista vacia = atiende todos)
  const doctores = (doctorFijo
    ? info.doctores.filter((d) => String(d.id) === doctorFijo)
    : info.doctores
  ).filter(
    (d) => !servicioId || d.servicioIds.length === 0 || d.servicioIds.includes(Number(servicioId)),
  )

  // Grilla del mini calendario (lunes primero), mes controlado por mesCal
  const primeroMes = new Date(Number(mesCal.slice(0, 4)), Number(mesCal.slice(5, 7)) - 1, 1)
  const diasGrilla = eachDayOfInterval({
    start: startOfWeek(primeroMes, { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(primeroMes), { weekStartsOn: 1 }),
  })
  const prevDeshabilitado = mesCal <= format(new Date(), 'yyyy-MM')
  const irMes = (delta: number) => setMesCal(format(addMonths(primeroMes, delta), 'yyyy-MM'))

  return (
    <div className="min-h-dvh bg-background">
      <header className="bg-primary text-primary-foreground px-6 py-5">
        <div className="max-w-2xl mx-auto flex items-center gap-2.5">
          <span className="bg-white/15 rounded-lg p-2">
            <Stethoscope className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-semibold leading-tight">{info.consultorio.nombre}</h1>
            <p className="text-xs text-cyan-50/90">Reserve su cita en línea</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 sm:p-6">
        {confirmacion ? (
          <div className={cn(cardUI, 'p-6 space-y-4 text-center')}>
            <CheckCircle2 className="h-12 w-12 text-accent mx-auto" aria-hidden="true" />
            <h2 className="text-xl font-bold text-foreground">¡Reserva enviada!</h2>
            <p className="text-sm text-foreground">
              {formatDia(confirmacion.fecha, "EEEE d 'de' MMMM")} a las{' '}
              <span className="font-semibold tabular-nums">{confirmacion.hora}</span>
              <br />
              {confirmacion.servicio} con {confirmacion.doctor}
            </p>
            <p className="text-xs text-muted-foreground">
              El consultorio lo contactará por email para confirmar la cita.
            </p>
          </div>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); setError(''); reservar.mutate() }}
            className={cn(cardUI, 'p-5 sm:p-6 space-y-4')}
          >
            <FloatingSelect
              id="res-servicio"
              label="Servicio"
              Icon={Stethoscope}
              required
              value={servicioId}
              onChange={(e) => {
                setServicioId(e.target.value)
                setFecha(''); setHora(''); setMostrarForm(false)
                setMesCal(format(new Date(), 'yyyy-MM'))
                // El doctor elegido podria no atender el nuevo servicio
                if (!doctorFijo) setDoctorId('')
              }}
            >
              <option value="">Seleccione el servicio...</option>
              {info.servicios.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre} ({s.duracionMin} min)</option>
              ))}
            </FloatingSelect>

            <FloatingSelect
              id="res-doctor"
              label="Profesional"
              Icon={UserRound}
              required
              value={doctorId}
              disabled={!!doctorFijo}
              onChange={(e) => {
                setDoctorId(e.target.value)
                setFecha(''); setHora(''); setMostrarForm(false)
                setMesCal(format(new Date(), 'yyyy-MM'))
              }}
            >
              <option value="">Seleccione el profesional...</option>
              {doctores.map((d) => (
                <option key={d.id} value={d.id}>{d.nombre}{d.especialidad ? ` — ${d.especialidad}` : ''}</option>
              ))}
            </FloatingSelect>

            {puedeVerCalendario && (
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 border-t pt-4">
                {/* Mini calendario mensual estilo Calendly: solo dias con disponibilidad */}
                <div className="sm:w-[300px] sm:shrink-0">
                  <span className="block text-sm font-medium text-foreground mb-2">Elija el día</span>
                  <div className="rounded-lg border border-input bg-card p-3">
                    <div className="flex items-center justify-between mb-2">
                      <button
                        type="button"
                        onClick={() => irMes(-1)}
                        disabled={prevDeshabilitado}
                        aria-label="Mes anterior"
                        className="h-8 w-8 flex items-center justify-center rounded-md text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <span className="text-sm font-semibold text-foreground capitalize">
                        {formatDia(`${mesCal}-01`, 'MMMM yyyy')}
                      </span>
                      <button
                        type="button"
                        onClick={() => irMes(1)}
                        aria-label="Mes siguiente"
                        className="h-8 w-8 flex items-center justify-center rounded-md text-foreground hover:bg-muted cursor-pointer transition-colors"
                      >
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="grid grid-cols-7 gap-0.5 mb-1">
                      {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
                        <span key={d} className="text-[11px] text-center text-muted-foreground font-medium py-1">{d}</span>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-0.5">
                      {diasGrilla.map((d) => {
                        const ds = format(d, 'yyyy-MM-dd')
                        if (!isSameMonth(d, primeroMes)) return <span key={ds} aria-hidden="true" />
                        const disponible = diasSet.has(ds)
                        const seleccionado = ds === fecha
                        return (
                          <button
                            key={ds}
                            type="button"
                            disabled={!disponible}
                            onClick={() => { setFecha(ds); setHora(''); setMostrarForm(false) }}
                            aria-pressed={seleccionado}
                            aria-label={formatDia(ds, "EEEE d 'de' MMMM")}
                            className={cn(
                              'aspect-square w-full flex items-center justify-center rounded-full text-sm tabular-nums transition-colors duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60',
                              seleccionado
                                ? 'bg-primary text-primary-foreground font-semibold'
                                : disponible
                                ? 'bg-primary/10 text-primary font-medium hover:bg-primary/20 cursor-pointer'
                                : 'text-muted-foreground/40 cursor-not-allowed',
                              isToday(d) && !seleccionado && 'ring-1 ring-inset ring-primary/40',
                            )}
                          >
                            {d.getDate()}
                          </button>
                        )
                      })}
                    </div>
                    {cargandoDias && <p className="text-[11px] text-muted-foreground mt-2">Cargando disponibilidad...</p>}
                  </div>
                </div>

                {/* Horarios del dia elegido: grilla de columnas dinamicas (auto-fill,
                    1-N segun el ancho); "Siguiente" revela el formulario y baja el scroll */}
                <div className="sm:flex-1 min-w-0">
                  <span className="block text-sm font-medium text-foreground mb-2">
                    {fecha ? 'Horarios disponibles' : 'Horarios'}
                  </span>
                  {!fecha ? (
                    <p className="text-sm text-muted-foreground bg-muted/40 rounded-md px-3 py-2.5">
                      Elija un día con disponibilidad para ver los horarios.
                    </p>
                  ) : cargandoSlots ? (
                    <p className="text-sm text-muted-foreground py-2">Buscando horarios...</p>
                  ) : !slotsData?.slots?.length ? (
                    <p className="text-sm text-muted-foreground bg-muted/40 rounded-md px-3 py-2.5">
                      No hay horarios libres ese día. Pruebe con otra fecha.
                    </p>
                  ) : (
                    <>
                      <div
                        className="grid gap-2"
                        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(4.25rem, 1fr))' }}
                        role="group"
                        aria-label="Horarios disponibles"
                      >
                        {slotsData.slots.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setHora(s)}
                            aria-pressed={s === hora}
                            className={cn(
                              'h-10 rounded-md text-sm font-medium tabular-nums border cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60',
                              s === hora
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-card text-foreground border-input hover:border-primary/60',
                            )}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                      {hora && !mostrarForm && (
                        <button
                          type="button"
                          onClick={() => setMostrarForm(true)}
                          className={cn(btnPrimaryUI, 'w-full h-11 mt-3')}
                        >
                          Siguiente
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {mostrarForm && hora && (
              <div ref={datosRef} className="space-y-4 border-t pt-4 scroll-mt-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {prefill ? 'Confirme sus datos' : 'Complete sus datos'}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {prefill
                      ? 'Vienen precargados desde el consultorio. Revíselos y corrija lo que haga falta.'
                      : 'Los necesitamos para confirmar la reserva y poder contactarlo.'}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FloatingInput
                    id="res-nombre"
                    label="Nombre"
                    Icon={User}
                    required
                    value={nombre}
                    autoComplete="given-name"
                    onChange={(e) => setNombre(e.target.value)}
                  />
                  <FloatingInput
                    id="res-apellido"
                    label="Apellido"
                    Icon={User}
                    required
                    value={apellido}
                    autoComplete="family-name"
                    onChange={(e) => setApellido(e.target.value)}
                  />
                </div>
                {/* Telefono: selector de pais + input unidos como control segmentado */}
                <div className="flex items-stretch">
                  <SelectorPais
                    value={pais}
                    onChange={setPais}
                    buttonClassName="h-14 rounded-l-xl rounded-r-none border-r-0"
                  />
                  <div className="relative flex-1">
                    <FloatingInput
                      id="res-telefono"
                      label="Teléfono (WhatsApp)"
                      type="tel"
                      required
                      value={telefono}
                      autoComplete="tel"
                      onChange={(e) => setTelefono(e.target.value)}
                      className="rounded-l-none"
                    />
                  </div>
                </div>
                <FloatingInput
                  id="res-email"
                  label="Email"
                  Icon={Mail}
                  type="email"
                  required
                  value={email}
                  autoComplete="email"
                  onChange={(e) => setEmail(e.target.value)}
                />
                <FloatingTextarea
                  id="res-notas"
                  label="Notas (opcional)"
                  Icon={FileText}
                  rows={2}
                  maxLength={300}
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                />

                {tokenPaciente && datosModificados && (
                  <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={actualizarDatos}
                      onChange={(e) => setActualizarDatos(e.target.checked)}
                      className="rounded"
                    />
                    Actualizar mis datos en el sistema
                  </label>
                )}
              </div>
            )}

            {error && (
              <p role="alert" className={errorUI}>
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}

            {mostrarForm && hora && (
              <button
                type="submit"
                disabled={reservar.isPending}
                className={cn(btnPrimaryUI, 'w-full h-11')}
              >
                <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                {reservar.isPending ? 'Reservando...' : `Reservar ${formatDia(fecha, 'dd/MM')} a las ${hora}`}
              </button>
            )}
          </form>
        )}
      </main>
    </div>
  )
}
