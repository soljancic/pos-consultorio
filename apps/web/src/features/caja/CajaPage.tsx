import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, subDays } from 'date-fns'
import { Lock, Unlock, Wallet, Undo2, ShieldCheck } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatMoneda, formatHora, formatDia, cn } from '../../lib/utils'
import { inputUI, btnPrimaryUI, btnOutlineUI, btnIconUI, cardUI, chipIconUI } from '../../lib/ui'
import { useAuthStore } from '../../stores/auth.store'
import { AnularPagoModal, type PagoAnulable } from './AnularPagoModal'
import { AbrirCajaModal } from './AbrirCajaModal'
import { CerrarCajaModal } from './CerrarCajaModal'
import { RevisarCajaModal, type CajaRevisable } from './RevisarCajaModal'
import { EmptyState } from '../../components/shared/EmptyState'
import { ErrorState } from '../../components/shared/ErrorState'
import { CampanaHeader } from '../notificaciones/CampanaHeader'
import { ConfirmarModal } from '../../components/shared/ConfirmarModal'

export function CajaPage() {
  const user = useAuthStore((s) => s.user)
  const esAdmin = user?.rol === 'ADMIN'
  const [pagoAnular, setPagoAnular] = useState<PagoAnulable | null>(null)
  const [modalAbrir, setModalAbrir] = useState(false)
  const [modalCerrar, setModalCerrar] = useState(false)
  const [cajaRevisar, setCajaRevisar] = useState<CajaRevisable | null>(null)
  const [confirmarReabrir, setConfirmarReabrir] = useState(false)
  const qc = useQueryClient()
  const [tab, setTab] = useState<'hoy' | 'historial'>('hoy')
  const [desde, setDesde] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [hasta, setHasta] = useState(format(new Date(), 'yyyy-MM-dd'))

  const { data, isError, refetch } = useQuery({
    queryKey: ['caja-hoy'],
    queryFn: () => api.get('/caja/hoy').then((r) => r.data),
    refetchInterval: 30_000,
  })

  const { data: historial = [], isError: errorHistorial, refetch: refetchHistorial } = useQuery<any[]>({
    queryKey: ['caja-historial', desde, hasta],
    queryFn: () => api.get(`/caja/historial?desde=${desde}&hasta=${hasta}`).then((r) => r.data),
    enabled: tab === 'historial',
  })

  const caja = data?.caja
  const pagos: any[] = data?.pagos || []

  // Reabrir el turno cerrado (solo ADMIN): descarta el arqueo y vuelve a
  // aceptar cobros; al re-cerrar se declara el efectivo de nuevo
  const reabrir = useMutation({
    mutationFn: () => api.post('/caja/reabrir'),
    onSuccess: () => {
      setConfirmarReabrir(false)
      qc.invalidateQueries({ queryKey: ['caja-hoy'] })
      qc.invalidateQueries({ queryKey: ['caja-estado'] })
      qc.invalidateQueries({ queryKey: ['caja-historial'] })
    },
    onError: () => setConfirmarReabrir(false),
  })
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
                  'px-4 py-1.5 rounded-md text-sm font-medium capitalize cursor-pointer focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150',
                  tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                )}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
        {tab === 'hoy' && data && !caja && (
          <button onClick={() => setModalAbrir(true)} className={btnPrimaryUI}>
            <Unlock className="h-4 w-4" aria-hidden="true" />
            Abrir caja
          </button>
        )}
        {tab === 'hoy' && caja && !caja.cerrada && (
          <button onClick={() => setModalCerrar(true)} className={btnOutlineUI}>
            <Lock className="h-4 w-4" aria-hidden="true" />
            Cerrar caja
          </button>
        )}
        {tab === 'hoy' && caja?.cerrada && (
          <span className="inline-flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <Lock className="h-4 w-4" aria-hidden="true" />
              Caja cerrada
            </span>
            {esAdmin && (
              <button onClick={() => setConfirmarReabrir(true)} className={btnOutlineUI}>
                <Unlock className="h-4 w-4" aria-hidden="true" />
                Reabrir caja
              </button>
            )}
          </span>
        )}
        <CampanaHeader />
        </div>
      </div>

      {tab === 'hoy' && (
        <div className="p-4 sm:p-6 flex-1 overflow-auto space-y-6">
          {isError ? (
            <ErrorState description="No se pudo cargar la caja de hoy." onRetry={() => refetch()} />
          ) : (
          <>
          {data && !caja && (
            <p className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400 bg-amber-500/15 rounded-md px-3 py-2.5">
              <Unlock className="h-4 w-4 shrink-0" aria-hidden="true" />
              La caja de hoy no esta abierta: abri el turno para poder cobrar y registrar gastos.
            </p>
          )}
          {/* Totales */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {([
              { label: 'Caja inicial', value: caja?.montoInicial },
              // Desglose dinamico por forma de pago (cuenta); el efectivo viene
              // null cuando el arqueo ciego lo oculta
              ...((data?.desglosePagos ?? []) as Array<{ nombre: string; total: number | null }>).map(
                (c) => ({ label: c.nombre, value: c.total, highlight: false }),
              ),
              { label: 'TOTAL', value: caja?.totalGeneral, highlight: true },
            ] as Array<{ label: string; value: number | null; highlight?: boolean }>).map((item) => {
              // Arqueo ciego estricto: el backend manda null en los montos de
              // efectivo para quien no es ADMIN mientras el turno este abierto
              const oculto = caja && item.value === null
              return (
              <div
                key={item.label}
                className={cn(cardUI, 'p-4', item.highlight && 'border-primary/60 bg-primary/10')}
              >
                <div className="text-xs font-medium text-muted-foreground mb-1">{item.label}</div>
                <div
                  className={cn('text-xl font-bold tabular-nums', item.highlight ? 'text-primary' : 'text-foreground')}
                  title={oculto ? 'Oculto hasta el cierre (arqueo ciego)' : undefined}
                >
                  {oculto ? '••••' : formatMoneda(Number(item.value || 0))}
                </div>
              </div>
              )
            })}
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
                  // Venta directa: el pago no tiene cita; el paciente cuelga del
                  // cobro (o no hay, si fue contado sin paciente).
                  const pac = p.cobro.cita?.paciente ?? p.cobro.paciente
                  const nombrePaciente = pac ? `${pac.nombre} ${pac.apellido}` : 'Venta directa'
                  const servicio = p.cobro.cita?.servicio?.nombre ?? 'Venta de productos'
                  const doctor = p.cobro.cita?.doctor?.nombre ?? '—'
                  const fechaRef = new Date(p.cobro.cita?.fechaHora ?? p.cobro.createdAt)
                  const esDeudaVieja = fechaRef.toDateString() !== hoyStr && fechaRef < new Date()
                  const esReversa = Number(p.monto) < 0
                  return (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors duration-150">
                      <td className="px-4 py-2 text-muted-foreground tabular-nums">{formatHora(p.createdAt)}</td>
                      <td className="px-4 py-2 font-medium">
                        {nombrePaciente}
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
                      <td className="px-4 py-2 text-muted-foreground">{servicio}</td>
                      <td className="px-4 py-2 text-muted-foreground">{doctor}</td>
                      <td className="px-4 py-2 text-muted-foreground">{p.tipoCuenta?.nombre}</td>
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
                                  cuenta: p.tipoCuenta?.nombre ?? '',
                                  descripcion: `${nombrePaciente} - ${servicio}`,
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
                    <td colSpan={esAdmin ? 7 : 6} className="px-4 py-2">
                      <EmptyState icon={Wallet} title="No hay movimientos hoy" description="Los cobros del día van a aparecer acá." className="py-8" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </>
          )}
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
          {errorHistorial ? (
            <ErrorState description="No se pudo cargar el historial de caja." onRetry={() => refetchHistorial()} />
          ) : (
          <div className={cn(cardUI, 'overflow-x-auto')}>
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Fecha</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Efectivo</th>
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
                    <td className="px-4 py-3 font-medium tabular-nums">{formatDia(c.fecha)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMoneda(Number(c.totalEfectivo))}</td>
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
                            Pendiente revisión
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
                            aria-label={`Revisar cierre del ${formatDia(c.fecha)}`}
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
                  <tr><td colSpan={5} className="px-4 py-2"><EmptyState icon={Wallet} title="Sin cajas en el período" description="Los cierres de caja del rango van a aparecer acá." className="py-8" /></td></tr>
                )}
              </tbody>
              <tfoot className="bg-muted/50 border-t">
                <tr>
                  <td colSpan={2} className="px-4 py-3 text-sm text-muted-foreground">Total del periodo</td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums">
                    {formatMoneda(historial.reduce((acc, c) => acc + Number(c.totalGeneral), 0))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
          )}
        </div>
      )}

      {pagoAnular && (
        <AnularPagoModal pago={pagoAnular} onClose={() => setPagoAnular(null)} />
      )}

      {modalAbrir && <AbrirCajaModal onClose={() => setModalAbrir(false)} />}

      {modalCerrar && <CerrarCajaModal onClose={() => setModalCerrar(false)} />}

      {confirmarReabrir && (
        <ConfirmarModal
          titulo="Reabrir caja"
          mensaje="Se descarta el arqueo de hoy (al volver a cerrar se declara el efectivo de nuevo) y la caja vuelve a aceptar cobros y gastos. La reapertura queda registrada en la actividad."
          confirmLabel="Reabrir"
          pendiente={reabrir.isPending}
          onConfirm={() => reabrir.mutate()}
          onClose={() => setConfirmarReabrir(false)}
        />
      )}

      {cajaRevisar && (
        <RevisarCajaModal caja={cajaRevisar} onClose={() => setCajaRevisar(null)} />
      )}
    </div>
  )
}
