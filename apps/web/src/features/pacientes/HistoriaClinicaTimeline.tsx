import { useState, useDeferredValue } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Stethoscope, CalendarPlus, Paperclip } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { api } from '../../lib/api-client'
import { formatDia, cn } from '../../lib/utils'
import { abrirAdjunto, type AdjuntoMeta } from '../../lib/adjuntos'
import { inputUI, cardUI } from '../../lib/ui'

type AtencionTimeline = {
  id: number
  motivo: string | null
  diagnostico: string | null
  tratamiento: string | null
  evolucion: string | null
  proximoControl: string | null
  adjuntos: AdjuntoMeta[] | null
  cita: {
    id: number
    fechaHora: string
    estado: string
    doctor: { nombre: string }
    servicio: { nombre: string }
  }
}

interface Props {
  pacienteId: number
  onAgendarControl: (fecha: string) => void
}

// Linea de tiempo clinica (E2-M4 f2): todas las atenciones del paciente con
// busqueda full-text sobre motivo/diagnostico/tratamiento/evolucion
export function HistoriaClinicaTimeline({ pacienteId, onAgendarControl }: Props) {
  const [busqueda, setBusqueda] = useState('')
  const q = useDeferredValue(busqueda.trim())

  const { data: atenciones = [], isLoading } = useQuery<AtencionTimeline[]>({
    queryKey: ['historia-clinica', pacienteId, q],
    queryFn: () =>
      api
        .get(`/atenciones/paciente/${pacienteId}`, { params: q ? { q } : undefined })
        .then((r) => r.data),
  })

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar en diagnósticos, tratamientos, evoluciones..."
          aria-label="Buscar en la historia clínica"
          className={cn(inputUI, 'pl-9')}
        />
      </div>

      {isLoading ? (
        <div className="p-6 text-center text-muted-foreground text-sm">Cargando...</div>
      ) : atenciones.length === 0 ? (
        <div className={cn(cardUI, 'p-8 text-center text-muted-foreground/70 text-sm')}>
          {q ? 'Sin resultados para la búsqueda' : 'Sin atenciones registradas'}
        </div>
      ) : (
        <ol className="relative ml-3 border-l-2 border-violet-500/30 space-y-4">
          {atenciones.map((a) => (
            <li key={a.id} className="relative pl-6">
              <span
                className="absolute left-[-13px] top-4 inline-flex items-center justify-center h-6 w-6 rounded-full bg-violet-500/15 text-violet-600 ring-4 ring-background"
                aria-hidden="true"
              >
                <Stethoscope className="h-3.5 w-3.5" />
              </span>
              <div className={cn(cardUI, 'p-4 space-y-1.5')}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-semibold text-foreground tabular-nums">
                    {format(new Date(a.cita.fechaHora), "dd/MM/yyyy HH:mm 'hs'", { locale: es })}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {a.cita.servicio.nombre} &bull; {a.cita.doctor.nombre}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  {a.motivo && <p><span className="font-medium text-foreground">Motivo:</span> {a.motivo}</p>}
                  {a.diagnostico && <p><span className="font-medium text-foreground">Diagnóstico:</span> {a.diagnostico}</p>}
                  {a.tratamiento && <p><span className="font-medium text-foreground">Tratamiento:</span> {a.tratamiento}</p>}
                  {a.evolucion && <p><span className="font-medium text-foreground">Evolución:</span> {a.evolucion}</p>}
                  {a.proximoControl && (
                    <p className="flex flex-wrap items-center gap-2">
                      <span>
                        <span className="font-medium text-foreground">Próximo control:</span>{' '}
                        {formatDia(a.proximoControl)}
                      </span>
                      <button
                        onClick={() => onAgendarControl(a.proximoControl!.slice(0, 10))}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary cursor-pointer hover:underline focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60 rounded transition-colors duration-150"
                      >
                        <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
                        Agendar control
                      </button>
                    </p>
                  )}
                </div>
                {(a.adjuntos?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {a.adjuntos!.map((adj, i) => (
                      <button
                        key={`${adj.archivo}-${i}`}
                        onClick={() => abrirAdjunto(a.cita.id, i)}
                        title={adj.nombre}
                        className="inline-flex items-center gap-1 max-w-[200px] text-xs px-2 py-1 rounded-full border text-primary cursor-pointer hover:bg-primary/10 focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150"
                      >
                        <Paperclip className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span className="truncate">{adj.nombre}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
