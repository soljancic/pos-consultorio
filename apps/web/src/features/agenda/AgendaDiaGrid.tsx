import { UserRound } from 'lucide-react'
import { COLORES_ESTADO, type Cita, type Doctor } from '@pos/types'
import { formatHora } from '../../lib/utils'
import { EmptyState } from '../../components/shared/EmptyState'
import { DoctorAvatar } from '../../components/shared/DoctorAvatar'

// Grilla horaria del día con una columna por doctor (estilo Pabau).
// Las citas se posicionan por hora/duracion; el color es el estado.

const HORA_INICIO = 7
const HORA_FIN = 21
const PX_POR_HORA = 64
const ALTO_GRILLA = (HORA_FIN - HORA_INICIO) * PX_POR_HORA

interface Props {
  citas: Cita[]
  doctores: Doctor[]
  onCitaClick: (cita: Cita) => void
  onSlotClick: (doctorId: number, hora: string) => void
}

function offsetTop(fechaHora: Date) {
  const horas = fechaHora.getHours() + fechaHora.getMinutes() / 60
  return Math.max(0, (horas - HORA_INICIO) * PX_POR_HORA)
}

export function AgendaDiaGrid({ citas, doctores, onCitaClick, onSlotClick }: Props) {
  const horas = Array.from({ length: HORA_FIN - HORA_INICIO }, (_, i) => HORA_INICIO + i)

  function handleSlotClick(e: React.MouseEvent<HTMLDivElement>, doctorId: number) {
    // Solo clicks directos sobre el fondo de la columna (no sobre una cita)
    if (e.target !== e.currentTarget) return
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top
    const horaDecimal = HORA_INICIO + y / PX_POR_HORA
    const h = Math.floor(horaDecimal)
    const m = horaDecimal % 1 >= 0.5 ? 30 : 0
    onSlotClick(doctorId, `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }

  if (doctores.length === 0) {
    return (
      <EmptyState
        icon={UserRound}
        title="No hay doctores activos"
        description="Creá un profesional en el Catálogo para verlo en la agenda."
      />
    )
  }

  return (
    <div className="bg-card rounded-xl border shadow-sm overflow-x-auto">
      <div className="min-w-[640px]">
        {/* Header: doctores */}
        <div
          className="grid border-b sticky top-0 bg-card z-10"
          style={{ gridTemplateColumns: `56px repeat(${doctores.length}, minmax(140px, 1fr))` }}
        >
          <div />
          {doctores.map((d) => (
            <div key={d.id} className="flex items-center gap-2 px-3 py-3 border-l">
              <DoctorAvatar nombre={d.nombre} colorAgenda={d.colorAgenda} fotoUrl={d.fotoUrl} size={28} />
              <span className="text-sm font-semibold text-foreground truncate">{d.nombre}</span>
            </div>
          ))}
        </div>

        {/* Cuerpo: horas x doctores */}
        <div
          className="grid"
          style={{ gridTemplateColumns: `56px repeat(${doctores.length}, minmax(140px, 1fr))` }}
        >
          {/* Columna de horas */}
          <div className="relative" style={{ height: ALTO_GRILLA }}>
            {horas.map((h) => (
              <div
                key={h}
                className="absolute right-2 -translate-y-1/2 text-xs text-muted-foreground tabular-nums"
                style={{ top: (h - HORA_INICIO) * PX_POR_HORA }}
              >
                {h !== HORA_INICIO ? `${String(h).padStart(2, '0')}:00` : ''}
              </div>
            ))}
          </div>

          {/* Una columna por doctor */}
          {doctores.map((d) => {
            const citasDoctor = citas.filter((c) => c.doctorId === d.id)
            return (
              <div
                key={d.id}
                className="relative border-l cursor-pointer"
                style={{
                  height: ALTO_GRILLA,
                  backgroundImage:
                    'repeating-linear-gradient(to bottom, transparent, transparent 63px, hsl(var(--border)) 63px, hsl(var(--border)) 64px)',
                }}
                onClick={(e) => handleSlotClick(e, d.id)}
                title="Click en un espacio libre para agendar"
              >
                {citasDoctor.map((cita) => {
                  const inicio = new Date(cita.fechaHora)
                  const alto = Math.max(28, (cita.duracionMin / 60) * PX_POR_HORA - 2)
                  const color = COLORES_ESTADO[cita.estado]
                  return (
                    <button
                      key={cita.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        onCitaClick(cita)
                      }}
                      className="absolute left-1 right-1 rounded-md px-2 py-1 text-left text-xs overflow-hidden shadow-sm hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer transition-[filter] duration-150"
                      style={{
                        top: offsetTop(inicio),
                        height: alto,
                        backgroundColor: color + '26',
                        border: `1px solid ${color}66`,
                      }}
                      title={`${formatHora(cita.fechaHora)} — ${cita.paciente?.nombre} ${cita.paciente?.apellido} (${cita.servicio?.nombre})`}
                    >
                      <span className="font-semibold text-foreground tabular-nums">
                        {formatHora(cita.fechaHora)}
                      </span>{' '}
                      <span className="font-medium text-foreground">
                        {cita.paciente?.nombre} {cita.paciente?.apellido}
                      </span>
                      {alto >= 44 && (
                        <span className="block text-muted-foreground truncate">
                          {cita.servicio?.nombre}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
