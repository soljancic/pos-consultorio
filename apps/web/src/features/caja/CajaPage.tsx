import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, subDays } from 'date-fns'
import { Lock, Wallet, Undo2, ShieldCheck } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatMoneda, formatHora, formatFecha, cn } from '../../lib/utils'
import { inputUI, btnOutlineUI, btnIconUI, cardUI, chipIconUI } from '../../lib/ui'
import { useAuthStore } from '../../stores/auth.store'
import { AnularPagoModal, type PagoAnulable } from './AnularPagoModal'
import { CerrarCajaModal } from './CerrarCajaModal'
import { RevisarCajaModal, type CajaRevisable } from './RevisarCajaModal'

export function CajaPage() {
  const user = useAuthStore((s) => s.user)
  const esAdmin = user?.rol === 'ADMIN'
  const [pagoAnular, setPagoAnular] = useState<PagoAnulable | null>(null)
  const [modalCerrar, setModalCerrar] = useState(false)
  const [cajaRevisar, setCajaRevisar] = useState<CajaRevisable | null>(null)
  const [tab, setTab] = useState<'hoy' | 'historial'>('hoy')
  const [desde, setDesde] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [hasta, setHasta] = useState(format(new Date(), 'yyyy-MM-dd'))

  const { data } = useQuery({
    queryKey: ['caja-hoy'],
    queryFn: () => api.get('/caja/hoy').then((r) => r.data),
    refetchInterval: 30_000,
  })

  const { data: historial = [] } = useQuery<any[]>({
    queryKey: ['caja-historial', desde, hasta],
    queryFn: () => api.get(`/caja/historial?desde=${desde}&hasta=${hasta}`).then((r) => r.data),
    enabled: tab === 'historial',
  })

  const caja = data?.caja
  const pagos: any[] = data?.pagos || []
  const hoyStr = new Date().toDateString()

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b bg-card">
        <div className="flex items-center gap-4">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <span className={chipIconUI}>
              <Wallet className="h-4 w-4" aria-hidden="true" />
            </span>
            Caja
          </h1>
          <div className="flex gap-1" role="tablist">
            {(['hoy', 'historial'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                role="tab"
                aria-selected={tab === t}
                className={cn(
                  'px-4 py-1.5 rounded-md text-sm font-medium capitalize cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150',
                  tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                )}>
                {t}
              </button>
            ))}
          </div>
        </div>
        {tab === 'hoy' && caja && !caja.cerrada && (
          <button onClick={() => setModalCerrar(true)} className={btnOutlineUI}>
            <Lock className="h-4 w-4" aria-hidden="true" />
            Cerrar caja
          </button>
        )}
        {tab === 'hoy' && caja?.cerrada && (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <Lock className="h-4 w-4" aria-hidden="true" />
            Caja cerrada
          </span>
        )}
      </div>

      {tab === 'hoy' && (
        <div className="p-4 sm:p-6 flex-1 overflow-auto space-y-6">
          {/* Totales */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { label: 'Efectivo', value: caja?.totalEfectivo },
              { label: 'QR / Transferencia', value: caja?.totalQr },
              { label: 'Tarjeta', value: caja?.totalTarjeta },
              { label: 'Vales', value: caja?.totalVales },
              { label: 'TOTAL', value: caja?.totalGeneral, highlight: true },
            ].map((item) => (
              <div
                key={item.label}
                className={cn(cardUI, 'p-4', item.highlight && 'border-primary/60 bg-primary/10')}
              >
                <div className="text-xs font-medium text-muted-foreground mb-1">{item.label}</div>
                <div className={cn('text-xl font-bold tabular-nums', item.highlight ? 'text-primary' : 'text-foreground')}>
                  {formatMoneda(Number(item.value || 0))}
                </div>
              </div>
            ))}
          </div>

          {/* Desglose deuda + egresos (MVP + E2-M8) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className={cn(cardUI, 'border-accent/40 p-4')}>
              <div className="text-xs font-medium text-muted-foreground mb-1">Pagos de deuda anterior</div>
              <div className="text-xl font-bold text-accent tabular-nums">
                {formatMoneda(Number(data?.pagosDeudaAnterior || 0))}
              </div>
            </div>
            <div className={cn(cardUI, 'border-destructive/30 p-4')}>
              <div className="text-xs font-medium text-muted-foreground mb-1">Nuevas deudas de hoy</div>
              <div className="text-xl font-bold text-destructive tabular-nums">
                {formatMoneda(Number(data?.nuevasDeudas || 0))}
              </div>
            </div>
            <div className={cn(cardUI, 'border-destructive/30 p-4')}>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                Egresos de hoy <span className="font-normal">(efectivo: {formatMoneda(Number(data?.egresosEfectivo || 0))})</span>
              </div>
              <div className="text-xl font-bold text-destructive tabular-nums">
                {formatMoneda(Number(data?.egresosTotales || 0))}
              </div>
            </div>
          </div>

          {/* Movimientos */}
          <div className={cn(cardUI, 'overflow-x-auto')}>
            <div className="px-4 py-3 border-b bg-muted/50">
              <h2 className="text-sm font-semibold text-foreground">
                Movimientos ({pagos.length})
              </h2>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="text-left px-4 py-2 text-muted-foreground font-medium">Hora</th>
                  <th className="text-left px-4 py-2 text-muted-foreground font-medium">Paciente</th>
                  <th className="text-left px-4 py-2 text-muted-foreground font-medium">Servicio</th>
                  <th className="text-left px-4 py-2 text-muted-foreground font-medium">Doctor</th>
                  <th className="text-left px-4 py-2 text-muted-foreground font-medium">Forma</th>
                  <th className="text-right px-4 py-2 text-muted-foreground font-medium">Monto</th>
                  {esAdmin && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody>
                {pagos.map((p) => {
                  const fechaCita = new Date(p.cobro.cita.fechaHora)
                  const esDeudaVieja = fechaCita.toDateString() !== hoyStr && fechaCita < new Date()
                  const esReversa = Number(p.monto) < 0
                  return (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors duration-150">
                      <td className="px-4 py-2 text-muted-foreground tabular-nums">{formatHora(p.createdAt)}</td>
                      <td className="px-4 py-2 font-medium">
                        {p.cobro.cita.paciente.apellido}, {p.cobro.cita.paciente.nombre}
                        {esDeudaVieja && (
                          <span className="ml-2 text-xs bg-amber-500/15 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium">Deuda</span>
                        )}
                        {esReversa && (
                          <span className="ml-2 text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded font-medium" title={p.motivoAnulacion ?? undefined}>Reversa</span>
                        )}
                        {p.anuladoAt && (
                          <span className="ml-2 text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium" title={p.motivoAnulacion ?? undefined}>Anulado</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{p.cobro.cita.servicio.nombre}</td>
                      <td className="px-4 py-2 text-muted-foreground">{p.cobro.cita.doctor.nombre}</td>
                      <td className="px-4 py-2 text-muted-foreground">{p.formaPago}</td>
                      <td className={cn('px-4 py-2 text-right font-medium tabular-nums', esReversa ? 'text-destructive' : 'text-accent', p.anuladoAt && 'line-through opacity-60')}>
                        {formatMoneda(Number(p.monto))}
                      </td>
                      {esAdmin && (
                        <td className="px-4 py-2 text-right">
                          {!esReversa && !p.anuladoAt && (
                            <button
                              onClick={() =>
                                setPagoAnular({
                                  id: p.id,
                                  monto: Number(p.monto),
                                  formaPago: p.formaPago,
                                  descripcion: `${p.cobro.cita.paciente.apellido}, ${p.cobro.cita.paciente.nombre} - ${p.cobro.cita.servicio.nombre}`,
                                })
                              }
                              title="Anular pago"
                              aria-label={`Anular pago de ${formatMoneda(Number(p.monto))}`}
                              className={cn(btnIconUI, 'h-8 w-8 text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10')}
                            >
                              <Undo2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
                {pagos.length === 0 && (
                  <tr>
                    <td colSpan={esAdmin ? 7 : 6} className="px-4 py-8 text-center text-muted-foreground/70">
                      No hay movimientos hoy
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'historial' && (
        <div className="p-4 sm:p-6 flex-1 overflow-auto space-y-4">
          <div className="flex items-center gap-2">
            <label htmlFor="caja-desde" className="sr-only">Desde</label>
            <input id="caja-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
              className={cn(inputUI, 'w-auto')} />
            <span className="text-muted-foreground/70">a</span>
            <label htmlFor="caja-hasta" className="sr-only">Hasta</label>
            <input id="caja-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
              className={cn(inputUI, 'w-auto')} />
          </div>
          <div className={cn(cardUI, 'overflow-x-auto')}>
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Fecha</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Efectivo</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">QR</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Vales</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Tarjeta</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Diferencia</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((c) => {
                  const tieneDiferencia = c.diferencia != null && Number(c.diferencia) !== 0
                  const pendienteRevision = c.cerrada && tieneDiferencia && !c.revisadaAt
                  return (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors duration-150">
                    <td className="px-4 py-3 font-medium tabular-nums">{formatFecha(c.fecha)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMoneda(Number(c.totalEfectivo))}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMoneda(Number(c.totalQr))}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMoneda(Number(c.totalVales))}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMoneda(Number(c.totalTarjeta))}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatMoneda(Number(c.totalGeneral))}</td>
                    <td className={cn('px-4 py-3 text-right tabular-nums font-medium', tieneDiferencia ? 'text-destructive' : 'text-muted-foreground')} title={c.notasRevision ?? undefined}>
                      {c.diferencia != null ? formatMoneda(Number(c.diferencia)) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.cerrada ? 'bg-muted text-muted-foreground' : 'bg-accent/10 text-accent'}`}>
                          {c.cerrada ? 'Cerrada' : 'Abierta'}
                        </span>
                        {pendienteRevision && (
                          <span className="text-xs bg-amber-500/15 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
                            Pendiente revision
                          </span>
                        )}
                        {c.revisadaAt && tieneDiferencia && (
                          <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full font-medium" title={c.notasRevision ?? undefined}>
                            Revisada
                          </span>
                        )}
                        {pendienteRevision && esAdmin && (
                          <button
                            onClick={() => setCajaRevisar(c)}
                            title="Revisar cierre"
                            aria-label={`Revisar cierre del ${formatFecha(c.fecha)}`}
                            className={cn(btnIconUI, 'h-8 w-8 text-primary hover:bg-primary/10')}
                          >
                            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                  )
                })}
                {historial.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground/70">Sin cajas en el periodo</td></tr>
                )}
              </tbody>
              <tfoot className="bg-muted/50 border-t">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-sm text-muted-foreground">Total del periodo</td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums">
                    {formatMoneda(historial.reduce((acc, c) => acc + Number(c.totalGeneral), 0))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {pagoAnular && (
        <AnularPagoModal pago={pagoAnular} onClose={() => setPagoAnular(null)} />
      )}

      {modalCerrar && <CerrarCajaModal onClose={() => setModalCerrar(false)} />}

      {cajaRevisar && (
        <RevisarCajaModal caja={cajaRevisar} onClose={() => setCajaRevisar(null)} />
      )}
    </div>
  )
}
