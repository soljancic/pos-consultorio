import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { api } from '../../lib/api-client'
import { CitaCard } from './CitaCard'
import { CobroModal } from './CobroModal'
import { NuevaCitaModal } from './NuevaCitaModal'
import type { Cita } from '@pos/types'
import { EstadoCita } from '@pos/types'

export function AgendaPage() {
  const [fecha, setFecha] = useState(new Date())
  const [citaSeleccionada, setCitaSeleccionada] = useState<Cita | null>(null)
  const [modalCobro, setModalCobro] = useState(false)
  const [modalNuevaCita, setModalNuevaCita] = useState(false)
  const queryClient = useQueryClient()

  const fechaStr = format(fecha, 'yyyy-MM-dd')

  const { data: citas = [], isLoading } = useQuery<Cita[]>({
    queryKey: ['citas', fechaStr],
    queryFn: () => api.get(`/citas?fecha=${fechaStr}`).then((r) => r.data),
  })

  const cambiarEstado = useMutation({
    mutationFn: ({ citaId, estado }: { citaId: string; estado: EstadoCita }) =>
      api.put(`/citas/${citaId}/estado`, { estado }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['citas', fechaStr] }),
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
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navegarDia(-1)}
            className="p-1 rounded hover:bg-slate-100"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-slate-800 capitalize">
              {format(fecha, "EEEE d 'de' MMMM", { locale: es })}
            </h2>
            <p className="text-xs text-slate-500">{citas.length} citas</p>
          </div>
          <button
            onClick={() => navegarDia(1)}
            className="p-1 rounded hover:bg-slate-100"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <button
            onClick={() => setFecha(new Date())}
            className="ml-2 text-xs text-blue-600 hover:underline"
          >
            Hoy
          </button>
        </div>

        <button
          onClick={() => setModalNuevaCita(true)}
          className="flex items-center gap-1 bg-blue-600 text-white px-3 py-2 rounded-md text-sm hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Nueva cita
        </button>
      </div>

      {/* Citas */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="text-center text-slate-500 py-12">Cargando agenda...</div>
        ) : citasOrdenadas.length === 0 ? (
          <div className="text-center text-slate-400 py-12">
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
            queryClient.invalidateQueries({ queryKey: ['citas', fechaStr] })
          }}
        />
      )}
    </div>
  )
}
