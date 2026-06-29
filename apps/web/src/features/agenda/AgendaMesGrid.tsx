import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  isSameDay, isSameMonth, format,
} from 'date-fns'
import { COLORES_ESTADO, type Cita } from '@pos/types'
import { formatHora, cn } from '../../lib/utils'

// Vista mensual: grilla 7 columnas (lunes primero) x 4-6 filas. Cada celda
// muestra hasta 3 citas (hora + paciente, color del ESTADO igual que dia/semana)
// y "+N mas" si desborda. Click en una celda -> vista diaria de ese dia.

interface Props {
  mes: Date // cualquier dia del mes a mostrar
  citas: Cita[]
  // Mostrar el doctor junto al paciente. Solo tiene sentido cuando se ven todos
  // los doctores; si la agenda esta filtrada a uno, es redundante.
  mostrarDoctor: boolean
  onCitaClick: (cita: Cita) => void
  onDiaClick: (dia: Date) => void
}

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MAX_CHIPS = 3

export function AgendaMesGrid({ mes, citas, mostrarDoctor, onCitaClick, onDiaClick }: Props) {
  const primero = startOfMonth(mes)
  const dias = eachDayOfInterval({
    start: startOfWeek(primero, { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(primero), { weekStartsOn: 1 }),
  })
  const hoy = new Date()

  return (
    <div className="bg-card rounded-xl border shadow-xs overflow-x-auto">
      <div className="min-w-[700px]">
        {/* Encabezado de dias */}
        <div className="grid grid-cols-7 border-b">
          {DIAS.map((d) => (
            <span key={d} className="px-2 py-2 text-center text-xs uppercase font-medium text-muted-foreground">
              {d}
            </span>
          ))}
        </div>
        {/* Celdas */}
        <div className="grid grid-cols-7">
          {dias.map((dia) => {
            const enMes = isSameMonth(dia, primero)
            const esHoy = isSameDay(dia, hoy)
            const citasDia = citas
              .filter((c) => isSameDay(new Date(c.fechaHora), dia))
              .sort((a, b) => new Date(a.fechaHora).getTime() - new Date(b.fechaHora).getTime())
            const visibles = citasDia.slice(0, MAX_CHIPS)
            const extra = citasDia.length - visibles.length
            return (
              <div
                key={dia.toISOString()}
                className={cn(
                  'border-l border-t first:border-l-0 min-h-[110px] p-1 flex flex-col gap-1',
                  !enMes && 'bg-muted/30',
                )}
              >
                <button
                  onClick={() => onDiaClick(dia)}
                  title="Abrir vista diaria"
                  className="self-start focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded-full cursor-pointer"
                >
                  <span
                    className={cn(
                      'inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-semibold tabular-nums transition-colors duration-150',
                      esHoy
                        ? 'bg-primary text-primary-foreground'
                        : enMes
                        ? 'text-foreground hover:bg-muted'
                        : 'text-muted-foreground/50',
                    )}
                  >
                    {format(dia, 'd')}
                  </span>
                </button>
                <div className="flex-1 space-y-0.5">
                  {visibles.map((cita) => {
                    // Color por ESTADO (igual que dia y semana): el color comunica
                    // el estado de la cita en toda la agenda, no el doctor.
                    const color = COLORES_ESTADO[cita.estado]
                    return (
                      <button
                        key={cita.id}
                        onClick={() => onCitaClick(cita)}
                        className="w-full rounded px-1 py-0.5 text-left text-[11px] leading-tight flex items-center gap-1 overflow-hidden hover:brightness-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring cursor-pointer transition-[filter] duration-150"
                        style={{ backgroundColor: color + '26', border: `1px solid ${color}66` }}
                        title={
                          mostrarDoctor && cita.doctor?.nombre
                            ? `${formatHora(cita.fechaHora)} — ${cita.paciente?.nombre} ${cita.paciente?.apellido} · ${cita.doctor.nombre}`
                            : `${formatHora(cita.fechaHora)} — ${cita.paciente?.nombre} ${cita.paciente?.apellido}`
                        }
                      >
                        <span className="font-semibold tabular-nums text-foreground shrink-0">
                          {formatHora(cita.fechaHora)}
                        </span>
                        <span className="text-foreground truncate">
                          {cita.paciente?.nombre} {cita.paciente?.apellido}
                          {mostrarDoctor && cita.doctor?.nombre && (
                            <span className="text-muted-foreground"> · {cita.doctor.nombre}</span>
                          )}
                        </span>
                      </button>
                    )
                  })}
                  {extra > 0 && (
                    <button
                      onClick={() => onDiaClick(dia)}
                      className="w-full text-left text-[11px] font-medium text-primary hover:underline px-1 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded"
                    >
                      +{extra} más
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
