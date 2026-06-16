import { Fragment, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, DollarSign, ChevronDown, ChevronRight, CircleDollarSign, CheckCircle2, Search } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatMoneda, formatFecha, buildWhatsAppUrl, abrirWhatsApp, cn } from '../../lib/utils'
import { usePlantillasWhatsApp, renderDeuda } from '../../lib/whatsapp'
import { inputUI, cardUI, chipIconUI } from '../../lib/ui'
import { CobroModal } from '../agenda/CobroModal'
import { EmptyState } from '../../components/shared/EmptyState'
import { ErrorState } from '../../components/shared/ErrorState'
import { TableSkeleton } from '../../components/shared/Skeleton'
import type { Cita } from '@pos/types'

type CobroDeudor = {
  id: number
  total: number
  saldoPendiente: number
  cita: Cita & { paciente: any; servicio: any }
}

type Deudor = {
  pacienteId: number
  nombre: string
  apellido: string
  telefono: string | null
  pais: string
  deudaTotal: number
  ultimaCitaFecha: string
  ultimoServicio: string
  ultimoPago: string | null
  cobros: CobroDeudor[]
}

export function DeudoresPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const { plantillas, consultorioNombre, linkQRBase } = usePlantillasWhatsApp()
  const [citaCobro, setCitaCobro] = useState<Cita | null>(null)
  const [expandido, setExpandido] = useState<number | null>(null)

  const { data: deudores = [], isLoading, isError, refetch } = useQuery<Deudor[]>({
    queryKey: ['deudores'],
    queryFn: () => api.get('/cobros/deudores').then((r) => r.data),
  })

  const filtrados = deudores.filter((d) => {
    const q = search.toLowerCase()
    return (
      d.nombre.toLowerCase().includes(q) ||
      d.apellido.toLowerCase().includes(q)
    )
  })

  const totalDeuda = filtrados.reduce((acc, d) => acc + d.deudaTotal, 0)

  // Con una sola cita adeudada cobra directo; con varias, expande el detalle
  // para cobrar cita por cita (los montos del modal siempre corresponden).
  function cobrarDeudor(deudor: Deudor) {
    if (deudor.cobros.length === 1) {
      setCitaCobro(deudor.cobros[0].cita)
    } else {
      setExpandido(expandido === deudor.pacienteId ? null : deudor.pacienteId)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b bg-card">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <span className={chipIconUI}>
            <CircleDollarSign className="h-4 w-4" aria-hidden="true" />
          </span>
          Deudores
        </h1>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre..."
          aria-label="Buscar deudores"
          className={cn(inputUI, 'w-56')}
        />
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {isLoading ? (
          <TableSkeleton cols={6} />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : filtrados.length === 0 ? (
          search ? (
            <EmptyState icon={Search} title="No se encontraron deudores" description="Probá con otro nombre o teléfono." />
          ) : (
            <EmptyState icon={CheckCircle2} title="No hay deudas pendientes" description="Todos los pacientes están al día." />
          )
        ) : (
          <>
          {/* Desktop: tabla de 6 columnas */}
          <div className={cn(cardUI, 'hidden sm:block overflow-x-auto')}>
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Paciente</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Última cita</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Citas</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Último pago</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Deuda</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtrados.map((d) => {
                  const variasCitas = d.cobros.length > 1
                  const abierto = expandido === d.pacienteId
                  const msgWa = renderDeuda(plantillas.deuda, {
                    nombre: d.nombre,
                    monto: formatMoneda(d.deudaTotal),
                    consultorio: consultorioNombre,
                  }, linkQRBase)
                  return (
                    <Fragment key={d.pacienteId}>
                      <tr className="border-b last:border-0 hover:bg-muted/60 transition-colors duration-150">
                        <td className="px-4 py-3 font-medium text-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            {variasCitas && (
                              <button
                                onClick={() =>
                                  setExpandido(abierto ? null : d.pacienteId)
                                }
                                title={abierto ? 'Ocultar detalle' : 'Ver detalle por cita'}
                                aria-expanded={abierto}
                                aria-label={abierto ? 'Ocultar detalle' : 'Ver detalle por cita'}
                                className="inline-flex items-center justify-center h-7 w-7 rounded text-muted-foreground/70 hover:text-foreground hover:bg-muted cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150"
                              >
                                {abierto ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                            )}
                            {d.nombre} {d.apellido}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatFecha(d.ultimaCitaFecha)}
                        </td>
                        <td className="px-4 py-3">
                          {variasCitas ? (
                            <button
                              onClick={() => setExpandido(abierto ? null : d.pacienteId)}
                              className="text-xs bg-amber-500/15 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium cursor-pointer hover:bg-amber-500/25 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150"
                            >
                              {d.cobros.length} citas
                            </button>
                          ) : (
                            <span className="text-muted-foreground">{d.ultimoServicio}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {d.ultimoPago ? formatFecha(d.ultimoPago) : 'Sin pagos'}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-destructive tabular-nums">
                          {formatMoneda(d.deudaTotal)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            {d.telefono && (
                              <a
                                href={buildWhatsAppUrl(d.telefono, msgWa, d.pais)}
                                onClick={(e) => {
                                  e.preventDefault()
                                  abrirWhatsApp(d.telefono!, msgWa, d.pais)
                                }}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-accent/10 text-accent hover:bg-accent/20 cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150"
                                title="Enviar WhatsApp"
                                aria-label="Enviar recordatorio por WhatsApp"
                              >
                                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                              </a>
                            )}
                            <button
                              onClick={() => cobrarDeudor(d)}
                              className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150"
                              title={variasCitas ? 'Ver citas para cobrar' : 'Cobrar'}
                              aria-label={variasCitas ? 'Ver citas para cobrar' : 'Cobrar'}
                            >
                              <DollarSign className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {abierto &&
                        d.cobros.map((cobro) => (
                          <tr
                            key={cobro.id}
                            className="border-b last:border-0 bg-muted/30"
                          >
                            <td className="pl-12 pr-4 py-2.5 text-muted-foreground" colSpan={2}>
                              {formatFecha(cobro.cita.fechaHora)} &middot;{' '}
                              {cobro.cita.servicio?.nombre}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground" colSpan={2}>
                              Total {formatMoneda(Number(cobro.total))}
                            </td>
                            <td className="px-4 py-2.5 text-right font-medium text-destructive tabular-nums">
                              {formatMoneda(Number(cobro.saldoPendiente))}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex justify-end">
                                <button
                                  onClick={() => setCitaCobro(cobro.cita)}
                                  className="text-xs font-medium text-primary hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 rounded transition-colors duration-150"
                                >
                                  Cobrar esta cita
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  )
                })}
              </tbody>
              <tfoot className="bg-muted/50 border-t">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-sm text-muted-foreground">
                    {filtrados.length} paciente{filtrados.length !== 1 ? 's' : ''}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-destructive tabular-nums">
                    {formatMoneda(totalDeuda)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile: lista de tarjetas (la tabla de 6 columnas no entra en celular).
              Prioriza el monto y las 2 acciones; el detalle por cita se expande dentro. */}
          <div className="sm:hidden space-y-3">
            <div className="flex items-center justify-between rounded-xl border bg-muted/40 px-4 py-3">
              <span className="text-sm text-muted-foreground">
                {filtrados.length} paciente{filtrados.length !== 1 ? 's' : ''}
              </span>
              <span className="text-base font-semibold text-destructive tabular-nums">
                {formatMoneda(totalDeuda)}
              </span>
            </div>

            {filtrados.map((d) => {
              const variasCitas = d.cobros.length > 1
              const abierto = expandido === d.pacienteId
              const msgWa = renderDeuda(plantillas.deuda, {
                nombre: d.nombre,
                monto: formatMoneda(d.deudaTotal),
                consultorio: consultorioNombre,
              }, linkQRBase)
              return (
                <div key={d.pacienteId} className={cn(cardUI, 'p-4')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {d.nombre} {d.apellido}
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        Última cita {formatFecha(d.ultimaCitaFecha)}
                        {!variasCitas && d.ultimoServicio ? ` · ${d.ultimoServicio}` : ''}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground/80">
                        {d.ultimoPago ? `Último pago ${formatFecha(d.ultimoPago)}` : 'Sin pagos'}
                      </p>
                    </div>
                    <span className="shrink-0 text-lg font-semibold text-destructive tabular-nums">
                      {formatMoneda(d.deudaTotal)}
                    </span>
                  </div>

                  {variasCitas && (
                    <button
                      onClick={() => setExpandido(abierto ? null : d.pacienteId)}
                      aria-expanded={abierto}
                      aria-label={abierto ? 'Ocultar detalle por cita' : 'Ver detalle por cita'}
                      className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 px-2.5 py-1 text-xs font-medium cursor-pointer hover:bg-amber-500/25 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150"
                    >
                      {d.cobros.length} citas
                      {abierto ? (
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </button>
                  )}

                  {abierto && variasCitas && (
                    <div className="mt-3 space-y-1.5 border-t pt-3">
                      {d.cobros.map((cobro) => (
                        <div
                          key={cobro.id}
                          className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm text-foreground truncate">
                              {cobro.cita.servicio?.nombre}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatFecha(cobro.cita.fechaHora)} &middot; Total{' '}
                              {formatMoneda(Number(cobro.total))}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-0.5">
                            <span className="text-sm font-semibold text-destructive tabular-nums">
                              {formatMoneda(Number(cobro.saldoPendiente))}
                            </span>
                            <button
                              onClick={() => setCitaCobro(cobro.cita)}
                              className="text-xs font-medium text-primary hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 rounded transition-colors duration-150"
                            >
                              Cobrar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex gap-2">
                    {d.telefono && (
                      <a
                        href={buildWhatsAppUrl(d.telefono, msgWa, d.pais)}
                        onClick={(e) => {
                          e.preventDefault()
                          abrirWhatsApp(d.telefono!, msgWa, d.pais)
                        }}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 inline-flex items-center justify-center gap-1.5 h-11 rounded-lg bg-accent/10 text-accent text-sm font-medium cursor-pointer hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150"
                        aria-label="Enviar recordatorio por WhatsApp"
                      >
                        <MessageCircle className="h-4 w-4" aria-hidden="true" />
                        WhatsApp
                      </a>
                    )}
                    <button
                      onClick={() => cobrarDeudor(d)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 h-11 rounded-lg bg-primary/10 text-primary text-sm font-medium cursor-pointer hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150"
                    >
                      <DollarSign className="h-4 w-4" aria-hidden="true" />
                      {variasCitas ? 'Ver citas' : 'Cobrar'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          </>
        )}
      </div>

      {citaCobro && (
        <CobroModal
          cita={citaCobro}
          onClose={() => {
            setCitaCobro(null)
            qc.invalidateQueries({ queryKey: ['deudores'] })
            qc.invalidateQueries({ queryKey: ['deudores-resumen'] })
          }}
        />
      )}
    </div>
  )
}
