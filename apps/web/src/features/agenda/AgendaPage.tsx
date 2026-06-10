import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, addDays, startOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, List, Columns3, CalendarRange } from 'lucide-react'
import { api } from '../../lib/api-client'
import { useAuthStore } from '../../stores/auth.store'
import { cn } from '../../lib/utils'
import { CitaCard } from './CitaCard'
import { CobroModal } from './CobroModal'
import { NuevaCitaModal } from './NuevaCitaModal'
import { AtencionModal } from './AtencionModal'
import { AgendaDiaGrid } from './AgendaDiaGrid'
import { AgendaSemanaGrid } from './AgendaSemanaGrid'
import { CitaDetalleModal } from './CitaDetalleModal'
import type { Cita, Doctor } from '@pos/types'
import { EstadoCita } from '@pos/types'

type Vista = 'lista' | 'dia' | 'semana'
const VISTA_KEY = 'pos-agenda-vista'

const VISTAS: Array<{ id: Vista; label: string; icon: typeof List }> = [
  { id: 'lista', label: 'Lista', icon: List },
  { id: 'dia', label: 'Dia', icon: Columns3 },
  { id: 'semana', label: 'Semana', icon: CalendarRange },
]

export function AgendaPage() {
  const user = useAuthStore((s) => s.user)
  const [fecha, setFecha] = useState(new Date())
  const [vista, setVista] = useState<Vista>(
    () => (localStorage.getItem(VISTA_KEY) as Vista) || 'lista',
  )
  const [doctorId, setDoctorId] = useState('')
  const [citaSeleccionada, setCitaSeleccionada] = useState<Cita | null>(null)
  const [citaDetalle, setCitaDetalle] = useState<Cita | null>(null)
  const [modalCobro, setModalCobro] = useState(false)
  const [modalNuevaCita, setModalNuevaCita] = useState(false)
  const [modalAtencion, setModalAtencion] = useState(false)
  const [slotPrefill, setSlotPrefill] = useState<{ doctorId: string; hora: string } | null>(null)
  const queryClient = useQueryClient()

  const fechaStr = format(fecha, 'yyyy-MM-dd')
  const inicioSemana = startOfWeek(fecha, { weekStartsOn: 1 })
  const finSemana = addDays(inicioSemana, 6)

  function cambiarVista(v: Vista) {
    setVista(v)
    localStorage.setItem(VISTA_KEY, v)
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
    if (doctorPropio) setDoctorId(doctorPropio.id)
  }, [doctorPropio?.id])

  // Dia (lista y grilla diaria)
  const { data: citas = [], isLoading } = useQuery<Cita[]>({
    queryKey: ['citas', fechaStr, doctorId],
    queryFn: () =>
      api
        .get(`/citas?fecha=${fechaStr}${doctorId ? `&doctorId=${doctorId}` : ''}`)
        .then((r) => r.data),
    enabled: vista !== 'semana',
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
  })

  const cambiarEstado = useMutation({
    mutationFn: ({ citaId, estado }: { citaId: string; estado: EstadoCita }) =>
      api.put(`/citas/${citaId}/estado`, { estado }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['citas'] }),
  })

  function navegar(direccion: number) {
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
    const ai = estadosOrden.indexOf(a.estado)
    const bi = estadosOrden.indexOf(b.estado)
    if (ai !== bi) return ai - bi
    return new Date(a.fechaHora).getTime() - new Date(b.fechaHora).getTime()
  })

  const doctoresVisibles = doctorId ? doctores.filter((d) => d.id === doctorId) : doctores

  const tituloFecha =
    vista === 'semana'
      ? `${format(inicioSemana, 'd MMM', { locale: es })} – ${format(finSemana, 'd MMM', { locale: es })}`
      : format(fecha, "EEEE d 'de' MMMM", { locale: es })

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b bg-card">
        <div className="flex items-center gap-3">
          <button onClick={() => navegar(-1)} aria-label="Anterior" className="p-1 rounded hover:bg-muted cursor-pointer">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-foreground capitalize">{tituloFecha}</h2>
            {vista !== 'semana' && (
              <p className="text-xs text-muted-foreground">{citas.length} citas</p>
            )}
          </div>
          <button onClick={() => navegar(1)} aria-label="Siguiente" className="p-1 rounded hover:bg-muted cursor-pointer">
            <ChevronRight className="h-5 w-5" />
          </button>
          <button
            onClick={() => setFecha(new Date())}
            className="ml-2 text-xs text-primary hover:underline cursor-pointer"
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
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 text-sm font-medium cursor-pointer transition-colors duration-150',
                  vista === id
                    ? 'bg-primary text-white'
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
              className="px-3 py-2 border rounded-md text-sm max-w-[180px] focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Todos los doctores</option>
              {doctores.map((d) => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setModalNuevaCita(true)}
            className="flex items-center gap-1 bg-primary text-white px-3 py-2 rounded-md text-sm hover:bg-primary/90 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
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
            <div className="text-center text-muted-foreground/70 py-12">
              No hay citas para este dia
            </div>
          ) : (
            <div className="space-y-3 max-w-3xl mx-auto">
              {citasOrdenadas.map((cita) => (
                <CitaCard
                  key={cita.id}
                  cita={cita}
                  onCambiarEstado={(estado) =>
                    cambiarEstado.mutate({ citaId: cita.id, estado })
                  }
                  onCobrar={() => abrirCobro(cita)}
                  onAtencion={() => abrirAtencion(cita)}
                />
              ))}
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
          onClose={() => setCitaDetalle(null)}
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
