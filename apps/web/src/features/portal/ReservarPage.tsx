import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Stethoscope, CalendarCheck, AlertCircle, CheckCircle2 } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatDia, cn } from '../../lib/utils'
import { inputUI, btnPrimaryUI, cardUI, errorUI } from '../../lib/ui'
import { PAIS_DEFAULT, PAISES } from '../../lib/paises'
import { SelectorPais } from '../../components/shared/SelectorPais'

// Portal publico de reservas (E2.5b): pagina SIN auth ni AppShell, mobile-first.
// Todo se deriva del slug en el backend; aca solo se eligen opciones visibles.

type Info = {
  consultorio: { nombre: string; logoUrl: string | null }
  doctores: Array<{ id: number; nombre: string; especialidad: string | null; colorAgenda: string; servicioIds: number[] }>
  servicios: Array<{ id: number; nombre: string; duracionMin: number }>
}

export function ReservarPage() {
  const { slug } = useParams<{ slug: string }>()
  // El link puede venir precargado: ?doctor= ?servicio= y/o los datos del
  // paciente (?nombre= ?apellido= ?telefono= ?pais= ?email=). Asi la
  // secretaria manda un link donde el cliente solo elige fecha y hora.
  const [params] = useSearchParams()
  const doctorFijo = params.get('doctor')
  const paisParam = params.get('pais')

  const [servicioId, setServicioId] = useState(params.get('servicio') ?? '')
  const [doctorId, setDoctorId] = useState(doctorFijo ?? '')
  const [fecha, setFecha] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [hora, setHora] = useState('')
  const [nombre, setNombre] = useState(params.get('nombre') ?? '')
  const [apellido, setApellido] = useState(params.get('apellido') ?? '')
  const [telefono, setTelefono] = useState(params.get('telefono') ?? '')
  const [pais, setPais] = useState(
    paisParam && PAISES.some((p) => p.codigo === paisParam) ? paisParam : PAIS_DEFAULT,
  )
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [error, setError] = useState('')
  const [confirmacion, setConfirmacion] = useState<any | null>(null)

  const { data: info, isLoading, isError } = useQuery<Info>({
    queryKey: ['portal', slug],
    queryFn: () => api.get(`/public/${slug}`).then((r) => r.data),
    retry: 1,
  })

  const puedeBuscarSlots = !!(servicioId && doctorId && fecha)
  const { data: slotsData, isFetching: cargandoSlots } = useQuery<{ slots: string[]; modo: string }>({
    queryKey: ['portal-slots', slug, doctorId, servicioId, fecha],
    queryFn: () =>
      api
        .get(`/public/${slug}/slots?doctorId=${doctorId}&servicioId=${servicioId}&fecha=${fecha}`)
        .then((r) => r.data),
    enabled: puedeBuscarSlots,
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
        // el backend rechaza el string vacio (@IsEmail)
        email: email || undefined,
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
            Este portal de reservas no está disponible. Verificá el enlace con el consultorio.
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

  return (
    <div className="min-h-dvh bg-background">
      <header className="bg-primary text-primary-foreground px-6 py-5">
        <div className="max-w-lg mx-auto flex items-center gap-2.5">
          <span className="bg-white/15 rounded-lg p-2">
            <Stethoscope className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-semibold leading-tight">{info.consultorio.nombre}</h1>
            <p className="text-xs text-cyan-50/90">Reservá tu cita en línea</p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 sm:p-6">
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
              El consultorio te contactará para confirmar la cita.
            </p>
          </div>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); setError(''); reservar.mutate() }}
            className={cn(cardUI, 'p-5 sm:p-6 space-y-4')}
          >
            <div>
              <label htmlFor="res-servicio" className="block text-sm font-medium text-foreground mb-1.5">Servicio *</label>
              <select id="res-servicio" required value={servicioId}
                onChange={(e) => {
                  setServicioId(e.target.value)
                  setHora('')
                  // El doctor elegido podria no atender el nuevo servicio
                  if (!doctorFijo) setDoctorId('')
                }} className={inputUI}>
                <option value="">Elegí el servicio...</option>
                {info.servicios.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre} ({s.duracionMin} min)</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="res-doctor" className="block text-sm font-medium text-foreground mb-1.5">Profesional *</label>
              <select id="res-doctor" required value={doctorId} disabled={!!doctorFijo}
                onChange={(e) => { setDoctorId(e.target.value); setHora('') }} className={inputUI}>
                <option value="">Elegí el profesional...</option>
                {doctores.map((d) => (
                  <option key={d.id} value={d.id}>{d.nombre}{d.especialidad ? ` — ${d.especialidad}` : ''}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="res-fecha" className="block text-sm font-medium text-foreground mb-1.5">Fecha *</label>
              <input id="res-fecha" type="date" required value={fecha}
                min={format(new Date(), 'yyyy-MM-dd')}
                onChange={(e) => { setFecha(e.target.value); setHora('') }} className={inputUI} />
            </div>

            {puedeBuscarSlots && (
              <div>
                <span className="block text-sm font-medium text-foreground mb-1.5">Horarios disponibles *</span>
                {cargandoSlots ? (
                  <p className="text-sm text-muted-foreground py-2">Buscando horarios...</p>
                ) : !slotsData?.slots?.length ? (
                  <p className="text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2.5">
                    No hay horarios libres ese día. Probá con otra fecha.
                  </p>
                ) : (
                  <div className="grid grid-cols-4 gap-2" role="group" aria-label="Horarios disponibles">
                    {slotsData.slots.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setHora(s)}
                        aria-pressed={hora === s}
                        className={cn(
                          'h-10 rounded-md text-sm font-medium tabular-nums border cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60',
                          hora === s
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-card text-foreground border-input hover:border-primary/60',
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {hora && (
              <div className="space-y-4 border-t pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="res-nombre" className="block text-sm font-medium text-foreground mb-1.5">Nombre *</label>
                    <input id="res-nombre" required value={nombre} autoComplete="given-name"
                      onChange={(e) => setNombre(e.target.value)} className={inputUI} />
                  </div>
                  <div>
                    <label htmlFor="res-apellido" className="block text-sm font-medium text-foreground mb-1.5">Apellido *</label>
                    <input id="res-apellido" required value={apellido} autoComplete="family-name"
                      onChange={(e) => setApellido(e.target.value)} className={inputUI} />
                  </div>
                </div>
                <div>
                  <label htmlFor="res-telefono" className="block text-sm font-medium text-foreground mb-1.5">Teléfono (WhatsApp) *</label>
                  <div className="flex gap-2">
                    <SelectorPais value={pais} onChange={setPais} />
                    <input id="res-telefono" type="tel" required value={telefono} autoComplete="tel"
                      placeholder="71234567" onChange={(e) => setTelefono(e.target.value)} className={inputUI} />
                  </div>
                </div>
                <div>
                  <label htmlFor="res-email" className="block text-sm font-medium text-foreground mb-1.5">
                    Email <span className="text-muted-foreground/70 font-normal">(opcional)</span>
                  </label>
                  <input id="res-email" type="email" value={email} autoComplete="email"
                    onChange={(e) => setEmail(e.target.value)} className={inputUI} />
                </div>
              </div>
            )}

            {error && (
              <p role="alert" className={errorUI}>
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!hora || reservar.isPending}
              className={cn(btnPrimaryUI, 'w-full h-11')}
            >
              <CalendarCheck className="h-4 w-4" aria-hidden="true" />
              {reservar.isPending ? 'Reservando...' : hora ? `Reservar ${formatDia(fecha, 'dd/MM')} a las ${hora}` : 'Elegí un horario'}
            </button>
          </form>
        )}
      </main>
    </div>
  )
}
