import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, subDays } from 'date-fns'
import { History, ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatHora, formatDia, cn } from '../../lib/utils'
import { inputUI, btnIconUI, cardUI, chipIconUI } from '../../lib/ui'
import { EmptyState } from '../../components/shared/EmptyState'

// E2-M3: feed de la tabla logs (solo ADMIN). Solo lectura.

const ENTIDADES = ['Cita', 'Cobro', 'Pago', 'Paciente', 'Gasto', 'CajaDiaria', 'Disponibilidad']
const ACCIONES = ['CREATE', 'UPDATE', 'DELETE', 'STATE_CHANGE', 'PAYMENT'] as const

const LABEL_ACCION: Record<string, string> = {
  CREATE: 'Creación',
  UPDATE: 'Edición',
  DELETE: 'Borrado',
  STATE_CHANGE: 'Cambio de estado',
  PAYMENT: 'Pago',
}

const ESTILO_ACCION: Record<string, string> = {
  CREATE: 'bg-accent/10 text-accent',
  UPDATE: 'bg-primary/10 text-primary',
  DELETE: 'bg-destructive/10 text-destructive',
  STATE_CHANGE: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  PAYMENT: 'bg-accent/10 text-accent',
}

export function ActividadPage() {
  const [desde, setDesde] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'))
  const [hasta, setHasta] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [entidad, setEntidad] = useState('')
  const [accion, setAccion] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['actividad', desde, hasta, entidad, accion, page],
    queryFn: () =>
      api
        .get(
          `/logs?desde=${desde}&hasta=${hasta}&page=${page}` +
            (entidad ? `&entidad=${entidad}` : '') +
            (accion ? `&accion=${accion}` : ''),
        )
        .then((r) => r.data),
  })

  const items: any[] = data?.items ?? []
  const totalPaginas = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 50)))

  // Agrupar por dia calendario
  const porDia = new Map<string, any[]>()
  for (const log of items) {
    const dia = String(log.createdAt).slice(0, 10)
    if (!porDia.has(dia)) porDia.set(dia, [])
    porDia.get(dia)!.push(log)
  }

  function filtrar(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
      setter(e.target.value)
      setPage(1)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b bg-card">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <span className={chipIconUI}>
            <History className="h-4 w-4" aria-hidden="true" />
          </span>
          Actividad
        </h1>
        <span className="text-sm text-muted-foreground tabular-nums">
          {data?.total ?? 0} registro{(data?.total ?? 0) !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="p-4 sm:p-6 flex-1 overflow-auto space-y-4 max-w-4xl mx-auto w-full">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="act-desde" className="sr-only">Desde</label>
          <input id="act-desde" type="date" value={desde} onChange={filtrar(setDesde)} className={cn(inputUI, 'w-auto')} />
          <span className="text-muted-foreground/70">a</span>
          <label htmlFor="act-hasta" className="sr-only">Hasta</label>
          <input id="act-hasta" type="date" value={hasta} onChange={filtrar(setHasta)} className={cn(inputUI, 'w-auto')} />
          <select value={entidad} onChange={filtrar(setEntidad)} aria-label="Filtrar por entidad" className={cn(inputUI, 'w-auto')}>
            <option value="">Todas las entidades</option>
            {ENTIDADES.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <select value={accion} onChange={filtrar(setAccion)} aria-label="Filtrar por acción" className={cn(inputUI, 'w-auto')}>
            <option value="">Todas las acciones</option>
            {ACCIONES.map((a) => <option key={a} value={a}>{LABEL_ACCION[a]}</option>)}
          </select>
        </div>

        {isLoading ? (
          <div className="text-center text-muted-foreground py-8">Cargando...</div>
        ) : items.length === 0 ? (
          <div className={cardUI}>
            <EmptyState icon={History} title="Sin actividad en el período" description="Las acciones del equipo van a aparecer acá." />
          </div>
        ) : (
          Array.from(porDia.entries()).map(([dia, logs]) => (
            <div key={dia}>
              <h2 className="text-sm font-semibold text-foreground mb-2 capitalize">
                {formatDia(dia, "EEEE d 'de' MMMM")}
              </h2>
              <div className={cn(cardUI, 'divide-y')}>
                {logs.map((log) => (
                  <details key={log.id} className="group">
                    <summary className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm cursor-pointer hover:bg-muted/40 transition-colors duration-150 list-none [&::-webkit-details-marker]:hidden">
                      <span className="text-muted-foreground tabular-nums">{formatHora(log.createdAt)}</span>
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', ESTILO_ACCION[log.accion] ?? 'bg-muted text-muted-foreground')}>
                        {LABEL_ACCION[log.accion] ?? log.accion}
                      </span>
                      <span className="font-medium text-foreground">
                        {log.entidad} #{log.entidadId}
                      </span>
                      <span className="text-muted-foreground ml-auto">
                        {log.usuario?.nombre ?? 'Sistema'}
                      </span>
                    </summary>
                    <div className="px-4 pb-3 text-xs space-y-1.5">
                      {log.payloadAntes && (
                        <div>
                          <span className="font-semibold text-muted-foreground">Antes:</span>
                          <pre className="mt-0.5 bg-muted/50 rounded p-2 overflow-x-auto text-foreground">{JSON.stringify(log.payloadAntes, null, 2)}</pre>
                        </div>
                      )}
                      {log.payloadDespues && (
                        <div>
                          <span className="font-semibold text-muted-foreground">Despues:</span>
                          <pre className="mt-0.5 bg-muted/50 rounded p-2 overflow-x-auto text-foreground">{JSON.stringify(log.payloadDespues, null, 2)}</pre>
                        </div>
                      )}
                      {!log.payloadAntes && !log.payloadDespues && (
                        <p className="text-muted-foreground">Sin detalle adicional.</p>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          ))
        )}

        {totalPaginas > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              aria-label="Pagina anterior"
              className={cn(btnIconUI, 'border border-input text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed')}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="text-sm text-muted-foreground tabular-nums">
              {page} / {totalPaginas}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPaginas, p + 1))}
              disabled={page >= totalPaginas}
              aria-label="Pagina siguiente"
              className={cn(btnIconUI, 'border border-input text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed')}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
