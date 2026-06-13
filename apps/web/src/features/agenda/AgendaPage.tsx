import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, addDays, addMonths, startOfWeek, startOfMonth, endOfMonth, endOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, List, Columns3, CalendarRange, CalendarDays } from 'lucide-react'
import { api } from '../../lib/api-client'
import { useAuthStore } from '../../stores/auth.store'
import { cn } from '../../lib/utils'
import { inputUI, btnPrimaryUI, btnIconUI } from '../../lib/ui'
import { CitaCard } from './CitaCard'
import { CobroModal } from './CobroModal'
import { NuevaCitaModal } from './NuevaCitaModal'
import { ReprogramarCitaModal } from './ReprogramarCitaModal'
import { CancelarCitaModal } from './CancelarCitaModal'
import { AtencionModal } from './AtencionModal'
import { AgendaDiaGrid } from './AgendaDiaGrid'
import { AgendaSemanaGrid } from './AgendaSemanaGrid'
import { AgendaMesGrid } from './AgendaMesGrid'
import { CitaDetalleModal } from './CitaDetalleModal'
import { EmptyState } from '../../components/shared/EmptyState'
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

export function AgendaPage() {
  const user = useAuthStore((s) => s.user)
  const [fecha, setFecha] = useState(new Date())
  const [vista, setVista] = useState<Vista>(
    () => (localStorage.getItem(VISTA_KEY) as Vista) || 'lista',
  )
  const [orden, setOrden] = useState<Orden>(
    () => (localStorage.getItem(ORDEN_KEY) as Orden) || 'estado',
  )
  const [doctorId, setDoctorId] = useState('')
  const [citaSeleccionada, setCitaSeleccionada] = useState<Cita | null>(null)
  const [citaDetalle, setCitaDetalle] = useState<Cita | null>(null)
  const [modalCobro, setModalCobro] = useState(false)
  const [modalNuevaCita, setModalNuevaCita] = useState(false)
  const [modalAtencion, setModalAtencion] = useState(false)
  const [citaReprogramar, setCitaReprogramar] = useState<Cita | null>(null)
  const [citaCancelar, setCitaCancelar] = useState<Cita | null>(null)
  const [citaNoAsistio, setCitaNoAsistio] = useState<Cita | null>(null)
  const [slotPrefill, setSlotPrefill] = useState<{ doctorId: number; hora: string } | null>(null)
  const queryClient = useQueryClient()

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
  const { data: citas = [], isLoading } = useQuery<Cita[]>({
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
  const { data: citasSemana = [], isLoading: cargandoSemana } = useQuery<Cita[]>({
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
  const { data: citasMes = [], isLoading: cargandoMes } = useQuery<Cita[]>({
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

  const cambiarEstado = useMutation({
    mutationFn: ({ citaId, estado }: { citaId: number; estado: EstadoCita }) =>
      api.put(`/citas/${citaId}/estado`, { estado }),
    onSuccess: () => {
      // ATENDIDA genera deuda: refrescar tambien deudores, ficha y caja
      for (const key of ['citas', 'deudores', 'deudores-resumen', 'pacientes', 'paciente', 'caja-hoy']) {
        queryClient.invalidateQueries({ queryKey: [key] })
      }
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

  const doctoresVisibles = doctorId
    ? doctores.filter((d) => d.id === Number(doctorId))
    : doctores

  const tituloFecha =
    vista === 'mes'
      ? format(fecha, 'MMMM yyyy', { locale: es })
      : vista === 'semana'
      ? `${format(inicioSemana, 'd MMM', { locale: es })} – ${format(finSemana, 'd MMM', { locale: es })}`
      : format(fecha, "EEEE d 'de' MMMM", { locale: es })

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b bg-card">
        <div className="flex items-center gap-3">
          <button onClick={() => navegar(-1)} aria-label="Anterior" className={cn(btnIconUI, 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-foreground capitalize">{tituloFecha}</h2>
            {(vista === 'lista' || vista === 'dia') && (
              <p className="text-xs text-muted-foreground">{citas.length} citas</p>
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

        <div className="flex flex-wrap items-center gap-2">
          {/* Toggle de vista */}
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

          {user?.rol !== 'DOCTOR' && (
            <select
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              aria-label="Filtrar por doctor"
              className={cn(inputUI, 'w-auto max-w-[180px]')}
            >
              <option value="">Todos los doctores</option>
              {doctores.map((d) => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </select>
          )}
          <button onClick={() => setModalNuevaCita(true)} className={btnPrimaryUI}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nueva cita
          </button>
        </div>
      </div>

      {/* Contenido segun vista */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {vista === 'lista' &&
          (isLoading ? (
            <div className="text-center text-muted-foreground py-12">Cargando agenda...</div>
          ) : citasOrdenadas.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No hay citas para este día"
              description="Cuando agendes una cita va a aparecer acá. Usá “Nueva cita” para empezar."
            />
          ) : (
            <div className="max-w-3xl mx-auto">
              {/* Orden de la lista: "Hora" evita que la tarjeta salte al cambiar de estado */}
              <div className="flex items-center justify-end gap-2 mb-3">
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
                {citasOrdenadas.map((cita) => (
                  <CitaCard
                    key={cita.id}
                    cita={cita}
                    onCambiarEstado={(estado) =>
                      cambiarEstado.mutate({ citaId: cita.id, estado })
                    }
                    onCobrar={() => abrirCobro(cita)}
                    onAtencion={() => abrirAtencion(cita)}
                    onReprogramar={() => setCitaReprogramar(cita)}
                    onCancelar={() => setCitaCancelar(cita)}
                    onNoAsistio={() => setCitaNoAsistio(cita)}
                  />
                ))}
              </div>
            </div>
          ))}

        {vista === 'dia' &&
          (isLoading ? (
            <div className="text-center text-muted-foreground py-12">Cargando agenda...</div>
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
            <div className="text-center text-muted-foreground py-12">Cargando semana...</div>
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
            <div className="text-center text-muted-foreground py-12">Cargando mes...</div>
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
