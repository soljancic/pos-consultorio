import { addDays, format, isSameDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { COLORES_ESTADO, type Cita } from '@pos/types'
import { formatHora, cn } from '../../lib/utils'

// Vista semanal: 7 columnas (lunes a domingo), citas compactas apiladas.
// Click en el encabezado de un dia -> vista diaria de ese dia.

interface Props {
  inicioSemana: Date // lunes
  citas: Cita[]
  // Mostrar el doctor junto al paciente. Solo tiene sentido cuando se ven todos
  // los doctores; si la agenda esta filtrada a uno, es redundante.
  mostrarDoctor: boolean
  onCitaClick: (cita: Cita) => void
  onDiaClick: (dia: Date) => void
}

export function AgendaSemanaGrid({ inicioSemana, citas, mostrarDoctor, onCitaClick, onDiaClick }: Props) {
  const dias = Array.from({ length: 7 }, (_, i) => addDays(inicioSemana, i))
  const hoy = new Date()

  return (
    <div className="bg-card rounded-xl border shadow-xs overflow-x-auto">
      <div className="min-w-[840px] grid grid-cols-7">
        {dias.map((dia) => {
          const citasDia = citas
            .filter((c) => isSameDay(new Date(c.fechaHora), dia))
            .sort((a, b) => new Date(a.fechaHora).getTime() - new Date(b.fechaHora).getTime())
          const esHoy = isSameDay(dia, hoy)
          return (
            <div key={dia.toISOString()} className="border-l first:border-l-0 min-h-[420px] flex flex-col">
              <button
                onClick={() => onDiaClick(dia)}
                title="Abrir vista diaria"
                className={cn(
                  'px-2 py-2.5 border-b text-center cursor-pointer hover:bg-muted/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-150',
                  esHoy && 'bg-primary/10',
                )}
              >
                <span className="block text-xs uppercase text-muted-foreground">
                  {format(dia, 'EEE', { locale: es })}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center justify-center h-7 w-7 rounded-full text-sm font-semibold',
                    esHoy ? 'bg-primary text-primary-foreground' : 'text-foreground',
                  )}
                >
                  {format(dia, 'd')}
                </span>
              </button>
              <div className="flex-1 p-1.5 space-y-1">
                {citasDia.map((cita) => {
                  const color = COLORES_ESTADO[cita.estado]
                  return (
                    <button
                      key={cita.id}
                      onClick={() => onCitaClick(cita)}
                      className="w-full rounded px-1.5 py-1 text-left text-xs overflow-hidden hover:brightness-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring cursor-pointer transition-[filter] duration-150"
                      style={{ backgroundColor: color + '26', border: `1px solid ${color}66` }}
                      title={
                        mostrarDoctor && cita.doctor?.nombre
                          ? `${formatHora(cita.fechaHora)} — ${cita.paciente?.nombre} ${cita.paciente?.apellido} · ${cita.doctor.nombre}`
                          : `${formatHora(cita.fechaHora)} — ${cita.paciente?.nombre} ${cita.paciente?.apellido}`
                      }
                    >
                      <span className="font-semibold tabular-nums text-foreground">
                        {formatHora(cita.fechaHora)}
                      </span>{' '}
                      <span className="text-foreground truncate">
                        {cita.paciente?.nombre} {cita.paciente?.apellido}
                        {mostrarDoctor && cita.doctor?.nombre && (
                          <span className="text-muted-foreground"> · {cita.doctor.nombre}</span>
                        )}
                      </span>
                    </button>
                  )
                })}
                {citasDia.length === 0 && (
                  <p className="text-center text-xs text-muted-foreground/50 pt-4">—</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
