import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { api } from '../../lib/api-client'
import { useAuthStore } from '../../stores/auth.store'
import { CitaCard } from './CitaCard'
import { CobroModal } from './CobroModal'
import { NuevaCitaModal } from './NuevaCitaModal'
import { AtencionModal } from './AtencionModal'
import type { Cita } from '@pos/types'
import { EstadoCita } from '@pos/types'

export function AgendaPage() {
  const user = useAuthStore((s) => s.user)
  const [fecha, setFecha] = useState(new Date())
  const [doctorId, setDoctorId] = useState('')
  const [citaSeleccionada, setCitaSeleccionada] = useState<Cita | null>(null)
  const [modalCobro, setModalCobro] = useState(false)
  const [modalNuevaCita, setModalNuevaCita] = useState(false)
  const [modalAtencion, setModalAtencion] = useState(false)
  const queryClient = useQueryClient()

  const fechaStr = format(fecha, 'yyyy-MM-dd')

  const { data: doctores = [] } = useQuery<any[]>({
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

  const { data: citas = [], isLoading } = useQuery<Cita[]>({
    queryKey: ['citas', fechaStr, doctorId],
    queryFn: () =>
      api
        .get(`/citas?fecha=${fechaStr}${doctorId ? `&doctorId=${doctorId}` : ''}`)
        .then((r) => r.data),
  })

  const cambiarEstado = useMutation({
    mutationFn: ({ citaId, estado }: { citaId: string; estado: EstadoCita }) =>
      api.put(`/citas/${citaId}/estado`, { estado }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['citas'] }),
  })

  function navegarDia(dias: number) {
    const d = new Date(fecha)
    d.setDate(d.getDate() + dias)
    setFecha(d)
  }

  function abrirCobro(cita: Cita) {
    setCitaSeleccionada(cita)
    setModalCobro(true)
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navegarDia(-1)}
            className="p-1 rounded hover:bg-muted"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-foreground capitalize">
              {format(fecha, "EEEE d 'de' MMMM", { locale: es })}
            </h2>
            <p className="text-xs text-muted-foreground">{citas.length} citas</p>
          </div>
          <button
            onClick={() => navegarDia(1)}
            className="p-1 rounded hover:bg-muted"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <button
            onClick={() => setFecha(new Date())}
            className="ml-2 text-xs text-primary hover:underline"
          >
            Hoy
          </button>
        </div>

        <div className="flex items-center gap-2">
          {user?.rol !== 'DOCTOR' && (
            <select
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              className="px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Todos los doctores</option>
              {doctores.map((d) => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setModalNuevaCita(true)}
            className="flex items-center gap-1 bg-primary text-white px-3 py-2 rounded-md text-sm hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Nueva cita
          </button>
        </div>
      </div>

      {/* Citas */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
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
                onAtencion={() => {
                  setCitaSeleccionada(cita)
                  setModalAtencion(true)
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal nueva cita */}
      {modalNuevaCita && (
        <NuevaCitaModal
          fechaInicial={fecha}
          onClose={() => {
            setModalNuevaCita(false)
            queryClient.invalidateQueries({ queryKey: ['citas', fechaStr] })
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
