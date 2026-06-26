import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, addDays, addMonths, startOfWeek, startOfMonth, endOfMonth, endOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, ChevronDown, Plus, List, Columns3, CalendarRange, CalendarDays, ArrowUpDown, Check, Eye, EyeOff, ShoppingCart } from 'lucide-react'
import { api } from '../../lib/api-client'
import { useAuthStore } from '../../stores/auth.store'
import { cn } from '../../lib/utils'
import { inputUI, btnPrimaryUI, btnOutlineUI, btnIconUI } from '../../lib/ui'
import { toast } from '../../stores/toast.store'
import { CitaCard } from './CitaCard'
import { CobroModal } from './CobroModal'
import { NuevaCitaModal } from './NuevaCitaModal'
import { VentaDirectaModal } from '../inventario/VentaDirectaModal'
import { ReprogramarCitaModal } from './ReprogramarCitaModal'
import { EditarCitaModal } from './EditarCitaModal'
import { CancelarCitaModal } from './CancelarCitaModal'
import { AtencionModal } from './AtencionModal'
import { AgendaDiaGrid } from './AgendaDiaGrid'
import { AgendaSemanaGrid } from './AgendaSemanaGrid'
import { AgendaMesGrid } from './AgendaMesGrid'
import { CitaDetalleModal } from './CitaDetalleModal'
import { EmptyState } from '../../components/shared/EmptyState'
import { ErrorState } from '../../components/shared/ErrorState'
import { Skeleton, CardListSkeleton } from '../../components/shared/Skeleton'
import { CampanaHeader } from '../notificaciones/CampanaHeader'
import type { Cita, Doctor } from '@pos/types'
import { EstadoCita } from '@pos/types'

type Vista = 'lista' | 'dia' | 'semana' | 'mes'
const VISTA_KEY = 'pos-agenda-vista'

const VISTAS: Array<{ id: Vista; label: string; icon: typeof List }> = [
  { id: 'lista', label: 'Lista', icon: List },
  { id: 'dia', label: 'Día', icon: Columns3 },
  { id: 'semana', label: 'Semana', icon: CalendarRange },
  { id: 'mes', label: 'Mes', icon: CalendarDays },
]

// Orden de la vista Lista. "Hora" mantiene la tarjeta en su lugar al cambiar de
// estado (no salta); "Estado" agrupa por etapa (solicitadas/activas arriba).
type Orden = 'estado' | 'hora'
const ORDEN_KEY = 'pos-agenda-orden'
const ORDENES: Array<{ id: Orden; label: string }> = [
  { id: 'estado', label: 'Estado' },
  { id: 'hora', label: 'Hora' },
]

// Filtro "ojo" de la vista Lista. Estados que ya cerraron el ciclo de la cita:
// no requieren ninguna accion en la agenda, asi que se ocultan al desmarcar.
const MOSTRAR_TODAS_KEY = 'pos-agenda-mostrar-todas'
const ESTADOS_TERMINADOS: EstadoCita[] = [
  EstadoCita.COBRADO,
  EstadoCita.CON_DEUDA,
  EstadoCita.CANCELADA,
  EstadoCita.NO_ASISTIO,
  EstadoCita.REPROGRAMADA,
]

// "Celular solamente": < sm (640px). En celular la agenda se reduce a Lista
// (las grillas dia/semana/mes son para pantallas anchas) y el header se condensa.
function useEsCelular() {
  const [esCelular, setEsCelular] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const onChange = (e: MediaQueryListEvent) => setEsCelular(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return esCelular
}

export function AgendaPage() {
  const user = useAuthStore((s) => s.user)
  const vendeProductos = useAuthStore((s) => s.user?.vendeProductos) ?? false
  const [fecha, setFecha] = useState(new Date())
  const [vista, setVista] = useState<Vista>(
    () => (localStorage.getItem(VISTA_KEY) as Vista) || 'lista',
  )
  const [orden, setOrden] = useState<Orden>(
    () => (localStorage.getItem(ORDEN_KEY) as Orden) || 'estado',
  )
  // Marcado (default) = todas; desmarcado = solo lo en curso / que requiere atencion.
  const [mostrarTodas, setMostrarTodas] = useState(
    () => localStorage.getItem(MOSTRAR_TODAS_KEY) !== 'false',
  )
  const [doctorId, setDoctorId] = useState('')
  const [citaSeleccionada, setCitaSeleccionada] = useState<Cita | null>(null)
  const [citaDetalle, setCitaDetalle] = useState<Cita | null>(null)
  const [modalCobro, setModalCobro] = useState(false)
  const [modalNuevaCita, setModalNuevaCita] = useState(false)
  const [modalVentaDirecta, setModalVentaDirecta] = useState(false)
  const [modalAtencion, setModalAtencion] = useState(false)
  const [citaReprogramar, setCitaReprogramar] = useState<Cita | null>(null)
  const [citaEditar, setCitaEditar] = useState<Cita | null>(null)
  const [citaCancelar, setCitaCancelar] = useState<Cita | null>(null)
  const [citaNoAsistio, setCitaNoAsistio] = useState<Cita | null>(null)
  const [slotPrefill, setSlotPrefill] = useState<{ doctorId: number; hora: string } | null>(null)
  const queryClient = useQueryClient()

  // Deep-link del centro de notificaciones: /agenda?fecha=YYYY-MM-DD&citaId=N.
  // Posiciona el dia y, cuando llegan las citas, abre el detalle de esa cita.
  const [searchParams, setSearchParams] = useSearchParams()
  const citaIdObjetivo = useRef<number | null>(null)

  useEffect(() => {
    const f = searchParams.get('fecha')
    const cid = searchParams.get('citaId')
    // Sin params no hay nada que hacer (cubre el re-run tras limpiarlos).
    if (!f && !cid) return
    if (f) setFecha(new Date(`${f}T00:00:00`))
    if (cid) citaIdObjetivo.current = Number(cid)
    setSearchParams({}, { replace: true })
    // Reacciona a cada cambio de la URL: si YA estabas en /agenda y tocas otra
    // notificacion, el deep-link igual se procesa (antes solo corria al montar,
    // por eso "a veces" no abria la cita).
  }, [searchParams, setSearchParams])

  // En celular se quita solo la vista Mes del toggle (el calendario completo no
  // entra bien en pantalla chica); el resto de las vistas siguen disponibles.
  const esCelular = useEsCelular()

  // Menu de vista en celular: un solo boton (Lista/Dia/Semana) en vez del toggle
  // de varias opciones. Mismo patron que los otros dropdowns del header.
  const [vistaMenuAbierto, setVistaMenuAbierto] = useState(false)
  const vistaMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!vistaMenuAbierto) return
    function handleClick(e: MouseEvent) {
      if (vistaMenuRef.current && !vistaMenuRef.current.contains(e.target as Node)) {
        setVistaMenuAbierto(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setVistaMenuAbierto(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [vistaMenuAbierto])

  // Dropdown de orden en celular: menu estilizado (mismo patron que el menu de
  // acciones de CitaCard), mas prolijo que el <select> nativo.
  const [ordenMenuAbierto, setOrdenMenuAbierto] = useState(false)
  const ordenMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ordenMenuAbierto) return
    function handleClick(e: MouseEvent) {
      if (ordenMenuRef.current && !ordenMenuRef.current.contains(e.target as Node)) {
        setOrdenMenuAbierto(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOrdenMenuAbierto(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [ordenMenuAbierto])

  const fechaStr = format(fecha, 'yyyy-MM-dd')
  const inicioSemana = startOfWeek(fecha, { weekStartsOn: 1 })
  const finSemana = addDays(inicioSemana, 6)

  function cambiarVista(v: Vista) {
    setVista(v)
    localStorage.setItem(VISTA_KEY, v)
  }

  function cambiarOrden(o: Orden) {
    setOrden(o)
    localStorage.setItem(ORDEN_KEY, o)
  }

  function cambiarMostrarTodas(v: boolean) {
    setMostrarTodas(v)
    localStorage.setItem(MOSTRAR_TODAS_KEY, String(v))
  }

  const { data: doctores = [] } = useQuery<Doctor[]>({
    queryKey: ['doctores'],
    queryFn: () => api.get('/doctores').then((r) => r.data),
  })

  // Rol DOCTOR: ve solo su agenda (guard de UX; el backend filtra por consultorio)
  const doctorPropio = user?.rol === 'DOCTOR'
    ? doctores.find((d) => d.usuarioId === user.id)
    : undefined

  useEffect(() => {
    if (doctorPropio) setDoctorId(String(doctorPropio.id))
  }, [doctorPropio?.id])

  // Día (lista y grilla diaria). refetchInterval 30s = la agenda se entera sola
  // del cambio de estado que hizo otro usuario (doctor) sin recargar la pagina:
  // React actualiza solo la cita que cambio (key=cita.id), no parpadea porque la
  // carga se mide con isLoading (1ra vez), no con el refetch de fondo. Igual que caja.
  const { data: citas = [], isLoading, isError, refetch } = useQuery<Cita[]>({
    queryKey: ['citas', fechaStr, doctorId],
    queryFn: () =>
      api
        .get(`/citas?fecha=${fechaStr}${doctorId ? `&doctorId=${doctorId}` : ''}`)
        .then((r) => r.data),
    enabled: vista === 'lista' || vista === 'dia',
    refetchInterval: 30_000,
  })

  // Semana (rango)
  const inicioSemanaStr = format(inicioSemana, 'yyyy-MM-dd')
  const { data: citasSemana = [], isLoading: cargandoSemana, isError: errorSemana, refetch: refetchSemana } = useQuery<Cita[]>({
    queryKey: ['citas', 'semana', inicioSemanaStr, doctorId],
    queryFn: () =>
      api
        .get(
          `/citas?fecha=${inicioSemanaStr}&hasta=${format(finSemana, 'yyyy-MM-dd')}${doctorId ? `&doctorId=${doctorId}` : ''}`,
        )
        .then((r) => r.data),
    enabled: vista === 'semana',
    refetchInterval: 30_000,
  })

  // Mes (rango de la grilla visible: lunes de la 1ra semana al domingo de la ultima)
  const mesStr = format(fecha, 'yyyy-MM')
  const inicioGrillaMes = startOfWeek(startOfMonth(fecha), { weekStartsOn: 1 })
  const finGrillaMes = endOfWeek(endOfMonth(fecha), { weekStartsOn: 1 })
  const { data: citasMes = [], isLoading: cargandoMes, isError: errorMes, refetch: refetchMes } = useQuery<Cita[]>({
    queryKey: ['citas', 'mes', mesStr, doctorId],
    queryFn: () =>
      api
        .get(
          `/citas?fecha=${format(inicioGrillaMes, 'yyyy-MM-dd')}&hasta=${format(finGrillaMes, 'yyyy-MM-dd')}${doctorId ? `&doctorId=${doctorId}` : ''}`,
        )
        .then((r) => r.data),
    enabled: vista === 'mes',
    refetchInterval: 30_000,
  })

  // Cuando el deep-link fijo un citaId objetivo y llegaron las citas, abrir el
  // detalle de esa cita y limpiar el objetivo. Busca en la vista activa (dia,
  // semana o mes): setFecha ya posiciono el dia en la fecha de la cita, asi que
  // el rango cargado de la vista actual la contiene aunque sea de otro dia.
  useEffect(() => {
    if (citaIdObjetivo.current == null) return
    const id = citaIdObjetivo.current
    const obj =
      citas.find((c) => c.id === id) ??
      citasSemana.find((c) => c.id === id) ??
      citasMes.find((c) => c.id === id)
    if (obj) {
      setCitaDetalle(obj)
      citaIdObjetivo.current = null
    }
  }, [citas, citasSemana, citasMes])

  const cambiarEstado = useMutation({
    mutationFn: ({ citaId, estado }: { citaId: number; estado: EstadoCita }) =>
      api.put(`/citas/${citaId}/estado`, { estado }),
    onSuccess: () => {
      // ATENDIDA genera deuda: refrescar tambien deudores, ficha y caja
      for (const key of ['citas', 'deudores', 'deudores-resumen', 'pacientes', 'paciente', 'caja-hoy']) {
        queryClient.invalidateQueries({ queryKey: [key] })
      }
    },
    // Un cambio de estado caido (p.ej. sin conexion en la PWA) no puede pasar
    // en silencio: ATENDIDA genera deuda y el usuario debe saber si fallo.
    onError: (err: any) => {
      toast.fromError(err, 'No se pudo actualizar la cita. Revisá la conexión y reintentá.')
    },
  })

  function navegar(direccion: number) {
    if (vista === 'mes') {
      setFecha(addMonths(fecha, direccion))
      return
    }
    const dias = vista === 'semana' ? 7 * direccion : direccion
    const d = new Date(fecha)
    d.setDate(d.getDate() + dias)
    setFecha(d)
  }

  function abrirCobro(cita: Cita) {
    setCitaSeleccionada(cita)
    setModalCobro(true)
  }

  function abrirAtencion(cita: Cita) {
    setCitaSeleccionada(cita)
    setModalAtencion(true)
  }

  const estadosOrden: EstadoCita[] = [
    // Las solicitudes del portal van primero: requieren revision
    EstadoCita.SOLICITADA,
    EstadoCita.LLEGO,
    EstadoCita.EN_ATENCION,
    EstadoCita.CONFIRMADA,
    EstadoCita.PENDIENTE,
    EstadoCita.CON_DEUDA,
    EstadoCita.ATENDIDA,
    EstadoCita.COBRADO,
    EstadoCita.CANCELADA,
    EstadoCita.NO_ASISTIO,
  ]

  const citasOrdenadas = [...citas].sort((a, b) => {
    // "Hora": la tarjeta no se mueve al cambiar de estado (solo cambia el color),
    // asi el usuario no pierde de vista la cita que estaba por cobrar/atender
    if (orden === 'hora') {
      return new Date(a.fechaHora).getTime() - new Date(b.fechaHora).getTime()
    }
    const ai = estadosOrden.indexOf(a.estado)
    const bi = estadosOrden.indexOf(b.estado)
    if (ai !== bi) return ai - bi
    return new Date(a.fechaHora).getTime() - new Date(b.fechaHora).getTime()
  })

  // Vista Lista: con el "ojo" desmarcado se ocultan las citas ya cerradas.
  const citasVisiblesLista = mostrarTodas
    ? citasOrdenadas
    : citasOrdenadas.filter((c) => !ESTADOS_TERMINADOS.includes(c.estado))

  const doctoresVisibles = doctorId
    ? doctores.filter((d) => d.id === Number(doctorId))
    : doctores

  const tituloFecha =
    vista === 'mes'
      ? format(fecha, 'MMMM yyyy', { locale: es })
      : vista === 'semana'
      ? `${format(inicioSemana, 'd MMM', { locale: es })} – ${format(finSemana, 'd MMM', { locale: es })}`
      : format(fecha, "EEEE d 'de' MMMM", { locale: es })

  const vistaActualDef = VISTAS.find((v) => v.id === vista) ?? VISTAS[0]
  const VistaActualIcon = vistaActualDef.icon

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b bg-card">
        <div className="flex items-center gap-3">
          <button onClick={() => navegar(-1)} aria-label="Anterior" className={cn(btnIconUI, 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          {/* Ancho fijo + texto centrado: el titulo cambia de largo (dia/semana/mes)
              y movia el chevron "Siguiente"; reservar el espacio lo deja quieto
              para poder navegar click-click-click sin perder el boton. */}
          <div className="w-40 sm:w-64 text-center">
            <h2 title={tituloFecha} className="text-lg font-semibold text-foreground capitalize truncate">{tituloFecha}</h2>
            {(vista === 'lista' || vista === 'dia') && (
              <p className="text-xs text-muted-foreground tabular-nums">{citas.length} {citas.length === 1 ? 'cita' : 'citas'}</p>
            )}
          </div>
          <button onClick={() => navegar(1)} aria-label="Siguiente" className={cn(btnIconUI, 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            onClick={() => setFecha(new Date())}
            className="ml-2 text-xs font-medium text-primary hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 rounded px-1 py-1 transition-colors duration-150"
          >
            Hoy
          </button>
        </div>

        <div className="flex flex-nowrap items-center gap-2">
          {/* Vista: en celular un solo dropdown (Lista/Dia/Semana); en sm+ el
              toggle segmentado con las 4 vistas (incluye Mes). */}
          {esCelular ? (
            <div ref={vistaMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setVistaMenuAbierto((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={vistaMenuAbierto}
                aria-label={`Vista: ${vistaActualDef.label}`}
                title={`Vista: ${vistaActualDef.label}`}
                className="inline-flex items-center gap-1 h-10 px-2.5 shrink-0 rounded-md border bg-card text-foreground cursor-pointer hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150"
              >
                <VistaActualIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </button>
              {vistaMenuAbierto && (
                <div
                  role="menu"
                  className="absolute left-0 top-full mt-1 z-20 w-40 bg-card border rounded-md shadow-lg py-1"
                >
                  {VISTAS.filter((v) => v.id !== 'mes').map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      role="menuitemradio"
                      aria-checked={vista === id}
                      onClick={() => { cambiarVista(id); setVistaMenuAbierto(false) }}
                      className="flex items-center justify-between w-full px-3 py-2 text-sm text-left text-foreground cursor-pointer hover:bg-muted/60 focus-visible:outline-none focus-visible:bg-muted/60 transition-colors duration-150"
                    >
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        {label}
                      </span>
                      {vista === id && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex rounded-md border overflow-hidden">
              {VISTAS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => cambiarVista(id)}
                  title={label}
                  aria-pressed={vista === id}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 text-sm font-medium cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                    vista === id
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
          )}

          {user?.rol !== 'DOCTOR' && (
            <select
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              aria-label="Filtrar por doctor"
              className={cn(inputUI, 'w-auto max-w-[180px]')}
            >
              <option value="">Todos</option>
              {doctores.map((d) => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </select>
          )}
          {/* Orden de la lista en celular: dropdown estilizado en el header (en sm+
              vive como toggle arriba de la lista). Solo aplica a la vista Lista. */}
          {vista === 'lista' && (
            <div ref={ordenMenuRef} className="relative sm:hidden">
              {/* Solo el icono para ahorrar espacio; el aria-label y el titulo dan
                  el contexto, y el menu muestra cual orden esta activo. */}
              <button
                type="button"
                onClick={() => setOrdenMenuAbierto((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={ordenMenuAbierto}
                aria-label="Ordenar por"
                title="Ordenar por"
                className="inline-flex items-center justify-center h-10 w-10 rounded-md border bg-card text-muted-foreground cursor-pointer hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150"
              >
                <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
              </button>
              {ordenMenuAbierto && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-1 z-20 w-40 bg-card border rounded-md shadow-lg py-1"
                >
                  {ORDENES.map(({ id, label }) => (
                    <button
                      key={id}
                      role="menuitemradio"
                      aria-checked={orden === id}
                      onClick={() => { cambiarOrden(id); setOrdenMenuAbierto(false) }}
                      className="flex items-center justify-between w-full px-3 py-2 text-sm text-left text-foreground cursor-pointer hover:bg-muted/60 focus-visible:outline-none focus-visible:bg-muted/60 transition-colors duration-150"
                    >
                      {label}
                      {orden === id && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* Filtro "ojo": marcado = todas las citas; desmarcado = solo lo en curso
              o que requiere atencion (oculta cobrado, con deuda, cancelado, etc).
              Cuando filtra, el boton se resalta para que el filtro activo se note. */}
          {vista === 'lista' && (
            <button
              type="button"
              onClick={() => cambiarMostrarTodas(!mostrarTodas)}
              aria-pressed={mostrarTodas}
              aria-label={mostrarTodas ? 'Mostrando todas las citas' : 'Mostrando solo las citas en curso'}
              title={mostrarTodas ? 'Mostrando todas — tocá para ver solo lo pendiente' : 'Solo lo pendiente — tocá para ver todas'}
              className={cn(
                'inline-flex items-center justify-center h-10 w-10 rounded-md border cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150',
                mostrarTodas
                  ? 'bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                  : 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/15',
              )}
            >
              {mostrarTodas
                ? <Eye className="h-4 w-4" aria-hidden="true" />
                : <EyeOff className="h-4 w-4" aria-hidden="true" />}
            </button>
          )}
          {/* Venta directa: cobro de mostrador sin cita. Solo si el consultorio
              vende productos. Accion secundaria al lado de "Nueva cita"; en
              celular solo el icono, en sm+ con texto. */}
          {vendeProductos && (
            <button
              onClick={() => setModalVentaDirecta(true)}
              className={btnOutlineUI}
              aria-label="Venta directa"
            >
              <ShoppingCart className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Venta directa</span>
            </button>
          )}
          {/* En celular solo el "+" (icono); en sm+ el texto completo. El
              aria-label mantiene el boton accesible cuando se ve solo el icono. */}
          <button
            onClick={() => setModalNuevaCita(true)}
            className={btnPrimaryUI}
            aria-label="Nueva cita"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Nueva cita</span>
          </button>
          <CampanaHeader />
        </div>
      </div>

      {/* Contenido segun vista */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {vista === 'lista' &&
          (isLoading ? (
            <div className="max-w-3xl mx-auto"><CardListSkeleton count={5} /></div>
          ) : isError ? (
            <ErrorState description="No se pudo cargar la agenda." onRetry={() => refetch()} />
          ) : citasVisiblesLista.length === 0 ? (
            citasOrdenadas.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="No hay citas para este día"
                description="Cuando agendes una cita va a aparecer acá. Usá “Nueva cita” para empezar."
              />
            ) : (
              <EmptyState
                icon={Check}
                title="Nada pendiente por ahora"
                description="Las citas ya cerradas (cobradas, con deuda, canceladas) están ocultas. Tocá el ojo para verlas."
              />
            )
          ) : (
            <div className="max-w-3xl mx-auto">
              {/* Orden de la lista: "Hora" evita que la tarjeta salte al cambiar de estado */}
              {/* En celular el orden esta en el header (al lado de "+"); aca solo en sm+ */}
              <div className="hidden sm:flex items-center justify-end gap-2 mb-3">
                <span className="text-xs text-muted-foreground">Ordenar por</span>
                <div className="flex rounded-md border overflow-hidden">
                  {ORDENES.map(({ id, label }) => (
                    <button
                      key={id}
                      onClick={() => cambiarOrden(id)}
                      aria-pressed={orden === id}
                      className={cn(
                        'px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                        orden === id
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                {citasVisiblesLista.map((cita) => (
                  <CitaCard
                    key={cita.id}
                    cita={cita}
                    onCambiarEstado={(estado) =>
                      cambiarEstado.mutate({ citaId: cita.id, estado })
                    }
                    onCobrar={() => abrirCobro(cita)}
                    onAtencion={() => abrirAtencion(cita)}
                    onReprogramar={() => setCitaReprogramar(cita)}
                    onEditar={() => setCitaEditar(cita)}
                    onCancelar={() => setCitaCancelar(cita)}
                    onNoAsistio={() => setCitaNoAsistio(cita)}
                  />
                ))}
              </div>
            </div>
          ))}

        {vista === 'dia' &&
          (isLoading ? (
            <Skeleton className="h-[480px] w-full rounded-xl" />
          ) : isError ? (
            <ErrorState description="No se pudo cargar la agenda." onRetry={() => refetch()} />
          ) : (
            <AgendaDiaGrid
              citas={citas}
              doctores={doctoresVisibles}
              onCitaClick={setCitaDetalle}
              onSlotClick={(docId, hora) => {
                setSlotPrefill({ doctorId: docId, hora })
                setModalNuevaCita(true)
              }}
            />
          ))}

        {vista === 'semana' &&
          (cargandoSemana ? (
            <Skeleton className="h-[480px] w-full rounded-xl" />
          ) : errorSemana ? (
            <ErrorState description="No se pudo cargar la semana." onRetry={() => refetchSemana()} />
          ) : (
            <AgendaSemanaGrid
              inicioSemana={inicioSemana}
              citas={citasSemana}
              onCitaClick={setCitaDetalle}
              onDiaClick={(dia) => {
                setFecha(dia)
                cambiarVista('dia')
              }}
            />
          ))}

        {vista === 'mes' &&
          (cargandoMes ? (
            <Skeleton className="h-[480px] w-full rounded-xl" />
          ) : errorMes ? (
            <ErrorState description="No se pudo cargar el mes." onRetry={() => refetchMes()} />
          ) : (
            <AgendaMesGrid
              mes={fecha}
              citas={citasMes}
              onCitaClick={setCitaDetalle}
              onDiaClick={(dia) => {
                setFecha(dia)
                cambiarVista('dia')
              }}
            />
          ))}
      </div>

      {/* Detalle de cita (desde las grillas) */}
      {citaDetalle && (
        <CitaDetalleModal
          cita={citaDetalle}
          onCambiarEstado={(estado) => {
            cambiarEstado.mutate({ citaId: citaDetalle.id, estado })
            setCitaDetalle(null)
          }}
          onCobrar={() => {
            setCitaDetalle(null)
            abrirCobro(citaDetalle)
          }}
          onAtencion={() => {
            setCitaDetalle(null)
            abrirAtencion(citaDetalle)
          }}
          onReprogramar={() => {
            setCitaDetalle(null)
            setCitaReprogramar(citaDetalle)
          }}
          onEditar={() => {
            setCitaDetalle(null)
            setCitaEditar(citaDetalle)
          }}
          onCancelar={() => {
            setCitaDetalle(null)
            setCitaCancelar(citaDetalle)
          }}
          onNoAsistio={() => {
            setCitaDetalle(null)
            setCitaNoAsistio(citaDetalle)
          }}
          onClose={() => setCitaDetalle(null)}
        />
      )}

      {/* Modal reprogramar */}
      {citaReprogramar && (
        <ReprogramarCitaModal
          cita={citaReprogramar}
          onClose={() => setCitaReprogramar(null)}
        />
      )}

      {/* Modal editar cita */}
      {citaEditar && (
        <EditarCitaModal
          cita={citaEditar}
          onClose={() => setCitaEditar(null)}
        />
      )}

      {/* Modal cancelar */}
      {citaCancelar && (
        <CancelarCitaModal
          cita={citaCancelar}
          onClose={() => setCitaCancelar(null)}
        />
      )}

      {/* Modal no asistió */}
      {citaNoAsistio && (
        <CancelarCitaModal
          cita={citaNoAsistio}
          modo="no-asistió"
          onClose={() => setCitaNoAsistio(null)}
        />
      )}

      {/* Modal nueva cita */}
      {modalNuevaCita && (
        <NuevaCitaModal
          fechaInicial={fecha}
          doctorIdInicial={slotPrefill?.doctorId}
          horaInicial={slotPrefill?.hora}
          onClose={() => {
            setModalNuevaCita(false)
            setSlotPrefill(null)
            queryClient.invalidateQueries({ queryKey: ['citas'] })
          }}
        />
      )}

      {/* Modal venta directa (mostrador, sin cita). El modal invalida finanzas
          y stock por su cuenta; aca solo se desmonta al cerrar. */}
      {modalVentaDirecta && (
        <VentaDirectaModal onClose={() => setModalVentaDirecta(false)} />
      )}

      {/* Modal cobro */}
      {modalCobro && citaSeleccionada && (
        <CobroModal
          cita={citaSeleccionada}
          onClose={() => {
            setModalCobro(false)
            setCitaSeleccionada(null)
            queryClient.invalidateQueries({ queryKey: ['citas'] })
          }}
        />
      )}

      {/* Modal atencion */}
      {modalAtencion && citaSeleccionada && (
        <AtencionModal
          cita={citaSeleccionada}
          onClose={() => {
            setModalAtencion(false)
            setCitaSeleccionada(null)
            queryClient.invalidateQueries({ queryKey: ['citas'] })
          }}
        />
      )}
    </div>
  )
}
