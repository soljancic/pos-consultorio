import { Fragment, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, DollarSign, ChevronDown, ChevronRight } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatMoneda, formatFecha, buildWhatsAppUrl } from '../../lib/utils'
import { CobroModal } from '../agenda/CobroModal'
import type { Cita } from '@pos/types'

type CobroDeudor = {
  id: string
  total: number
  saldoPendiente: number
  cita: Cita & { paciente: any; servicio: any }
}

type Deudor = {
  pacienteId: string
  nombre: string
  apellido: string
  whatsapp: string | null
  deudaTotal: number
  ultimaCitaFecha: string
  ultimoServicio: string
  ultimoPago: string | null
  cobros: CobroDeudor[]
}

export function DeudoresPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [citaCobro, setCitaCobro] = useState<Cita | null>(null)
  const [expandido, setExpandido] = useState<string | null>(null)

  const { data: deudores = [], isLoading } = useQuery<Deudor[]>({
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
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card">
        <h1 className="text-lg font-semibold text-foreground">Deudores</h1>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre..."
          className="px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring w-56"
        />
      </div>

      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="text-center text-muted-foreground py-12">Cargando...</div>
        ) : filtrados.length === 0 ? (
          <div className="text-center text-muted-foreground/70 py-12">
            {search ? 'No se encontraron deudores' : 'No hay deudas pendientes'}
          </div>
        ) : (
          <div className="bg-card rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Paciente</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Ultima cita</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Citas</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Ultimo pago</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Deuda</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtrados.map((d) => {
                  const variasCitas = d.cobros.length > 1
                  const abierto = expandido === d.pacienteId
                  return (
                    <Fragment key={d.pacienteId}>
                      <tr className="border-b last:border-0 hover:bg-muted/60">
                        <td className="px-4 py-3 font-medium text-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            {variasCitas && (
                              <button
                                onClick={() =>
                                  setExpandido(abierto ? null : d.pacienteId)
                                }
                                title={abierto ? 'Ocultar detalle' : 'Ver detalle por cita'}
                                aria-expanded={abierto}
                                className="text-muted-foreground/70 hover:text-foreground cursor-pointer"
                              >
                                {abierto ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                            )}
                            {d.apellido}, {d.nombre}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatFecha(d.ultimaCitaFecha)}
                        </td>
                        <td className="px-4 py-3">
                          {variasCitas ? (
                            <button
                              onClick={() => setExpandido(abierto ? null : d.pacienteId)}
                              className="text-xs bg-amber-500/15 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium cursor-pointer hover:bg-amber-500/25"
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
                            {d.whatsapp && (
                              <a
                                href={buildWhatsAppUrl(
                                  d.whatsapp,
                                  `Hola ${d.nombre}, le recordamos que tiene un saldo pendiente de ${formatMoneda(d.deudaTotal)}. Muchas gracias.`
                                )}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 rounded bg-accent/10 text-accent hover:bg-accent/20"
                                title="Enviar WhatsApp"
                              >
                                <MessageCircle className="h-4 w-4" />
                              </a>
                            )}
                            <button
                              onClick={() => cobrarDeudor(d)}
                              className="p-1.5 rounded bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
                              title={variasCitas ? 'Ver citas para cobrar' : 'Cobrar'}
                            >
                              <DollarSign className="h-4 w-4" />
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
                                  className="text-xs font-medium text-primary hover:underline cursor-pointer"
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
