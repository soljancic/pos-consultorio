import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, TrendingUp, TrendingDown, CalendarDays, Download } from 'lucide-react'
import { format } from 'date-fns'
import * as XLSX from 'xlsx'
import { api } from '../../lib/api-client'
import { formatMoneda, cn } from '../../lib/utils'
import { inputUI, cardUI, btnOutlineUI } from '../../lib/ui'
import { ErrorState } from '../../components/shared/ErrorState'
import { Skeleton, TableSkeleton } from '../../components/shared/Skeleton'

const LABEL_ESTADO: Record<string, string> = {
  SOLICITADA: 'Solicitada',
  PENDIENTE: 'Pendiente', CONFIRMADA: 'Confirmada', LLEGO: 'Llegó',
  EN_ATENCION: 'En atención', ATENDIDA: 'Atendida', COBRADO: 'Cobrado',
  CON_DEUDA: 'Con deuda', CANCELADA: 'Cancelada', NO_ASISTIO: 'No asistió',
  REPROGRAMADA: 'Reprogramada',
}


type Reporte = {
  mes: string
  ingresos: { total: number; porFormaPago: Record<string, number> }
  gastos: { total: number; porCategoria: Array<{ categoria: string; total: number }> }
  resultadoNeto: number
  citas: { total: number; porEstado: Record<string, number> }
  porDoctor: Array<{
    doctorId: number
    nombre: string
    citasAtendidas: number
    canceladas: number
    noShows: number
    pacientesAtendidos: number
    ingresos: number
    comisionPct: number | null
    comision: number | null
  }>
  totalComisiones: number
}

// Item 29: reporte mensual con desglose por doctor (solo ADMIN)
export function ReportesPage() {
  const [mes, setMes] = useState(format(new Date(), 'yyyy-MM'))

  const { data: reporte, isLoading, isError, refetch } = useQuery<Reporte>({
    queryKey: ['reporte-mensual', mes],
    queryFn: () => api.get('/reportes/mensual', { params: { mes } }).then((r) => r.data),
  })

  // Export directo a Excel (.xlsx, decision owner 2026-06-12): los montos
  // van como numeros nativos para que Excel los sume sin pelear con comas
  function exportarExcel() {
    if (!reporte) return
    const filas: Array<Array<string | number>> = [
      ['Reporte mensual', reporte.mes],
      [],
      ['Ingresos', reporte.ingresos.total],
      ...Object.entries(reporte.ingresos.porFormaPago).map(
        ([f, t]): Array<string | number> => [`  ${f}`, t],
      ),
      ['Gastos', reporte.gastos.total],
      ...reporte.gastos.porCategoria.map(
        (g): Array<string | number> => [`  ${g.categoria}`, g.total],
      ),
      ['Resultado neto', reporte.resultadoNeto],
      ['Citas del mes', reporte.citas.total],
      ...Object.entries(reporte.citas.porEstado).map(
        ([e, n]): Array<string | number> => [`  ${LABEL_ESTADO[e] ?? e}`, n],
      ),
      [],
      ['Doctor', 'Atendidas', 'Pacientes', 'Canceladas', 'No asistió', 'Ingresos', 'Comisión %', 'Comisión'],
      ...reporte.porDoctor.map(
        (d): Array<string | number> => [
          d.nombre, d.citasAtendidas, d.pacientesAtendidos, d.canceladas,
          d.noShows, d.ingresos,
          d.comisionPct !== null ? d.comisionPct : '', d.comision !== null ? d.comision : '',
        ],
      ),
      ['Total comisiones', '', '', '', '', '', '', reporte.totalComisiones],
    ]
    const hoja = XLSX.utils.aoa_to_sheet(filas)
    hoja['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }]
    const libro = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(libro, hoja, `Reporte ${reporte.mes}`)
    XLSX.writeFile(libro, `reporte-${reporte.mes}.xlsx`)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b bg-card">
        <h1 className="flex items-center gap-2.5 text-lg font-semibold text-foreground">
          <span className="bg-primary/10 text-primary rounded-md p-1.5">
            <BarChart3 className="h-5 w-5" aria-hidden="true" />
          </span>
          Reportes
        </h1>
        <div className="flex items-center gap-2">
          <label htmlFor="reporte-mes" className="sr-only">Mes</label>
          <input
            id="reporte-mes"
            type="month"
            value={mes}
            onChange={(e) => e.target.value && setMes(e.target.value)}
            className={cn(inputUI, 'w-44')}
          />
          <button onClick={exportarExcel} disabled={!reporte} className={btnOutlineUI}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Excel
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6 max-w-5xl mx-auto w-full">
        {isError ? (
          <ErrorState description="No se pudo cargar el reporte del mes." onRetry={() => refetch()} />
        ) : isLoading || !reporte ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className={cn(cardUI, 'p-4 space-y-2')}>
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
            <TableSkeleton cols={5} />
          </>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className={cn(cardUI, 'p-4')}>
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-accent" aria-hidden="true" /> Ingresos
                </p>
                <p className="text-xl font-bold text-foreground tabular-nums mt-1">
                  {formatMoneda(reporte.ingresos.total)}
                </p>
              </div>
              <div className={cn(cardUI, 'p-4')}>
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <TrendingDown className="h-3.5 w-3.5 text-destructive" aria-hidden="true" /> Gastos
                </p>
                <p className="text-xl font-bold text-foreground tabular-nums mt-1">
                  {formatMoneda(reporte.gastos.total)}
                </p>
              </div>
              <div className={cn(cardUI, 'p-4')}>
                <p className="text-xs font-medium text-muted-foreground">Resultado neto</p>
                <p className={cn(
                  'text-xl font-bold tabular-nums mt-1',
                  reporte.resultadoNeto >= 0 ? 'text-accent' : 'text-destructive',
                )}>
                  {formatMoneda(reporte.resultadoNeto)}
                </p>
              </div>
              <div className={cn(cardUI, 'p-4')}>
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> Citas del mes
                </p>
                <p className="text-xl font-bold text-foreground tabular-nums mt-1">{reporte.citas.total}</p>
              </div>
            </div>

            {/* Desgloses */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className={cn(cardUI, 'p-5')}>
                <h2 className="text-sm font-semibold text-foreground mb-3">Ingresos por forma de pago</h2>
                {Object.keys(reporte.ingresos.porFormaPago).length === 0 ? (
                  <p className="text-sm text-muted-foreground/70">Sin pagos en el mes</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {Object.entries(reporte.ingresos.porFormaPago).map(([forma, total]) => (
                      <li key={forma} className="flex justify-between">
                        <span className="text-muted-foreground">{forma}</span>
                        <span className="font-medium tabular-nums">{formatMoneda(total)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className={cn(cardUI, 'p-5')}>
                <h2 className="text-sm font-semibold text-foreground mb-3">Gastos por categoría</h2>
                {reporte.gastos.porCategoria.length === 0 ? (
                  <p className="text-sm text-muted-foreground/70">Sin gastos en el mes</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {reporte.gastos.porCategoria.map((g) => (
                      <li key={g.categoria} className="flex justify-between">
                        <span className="text-muted-foreground">{g.categoria}</span>
                        <span className="font-medium tabular-nums">{formatMoneda(g.total)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className={cn(cardUI, 'p-5')}>
                <h2 className="text-sm font-semibold text-foreground mb-3">Citas por estado</h2>
                {Object.keys(reporte.citas.porEstado).length === 0 ? (
                  <p className="text-sm text-muted-foreground/70">Sin citas en el mes</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {Object.entries(reporte.citas.porEstado).map(([estado, n]) => (
                      <li key={estado} className="flex justify-between">
                        <span className="text-muted-foreground">{LABEL_ESTADO[estado] ?? estado}</span>
                        <span className="font-medium tabular-nums">{n}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Por doctor */}
            <div>
              <h2 className="text-sm font-semibold text-foreground mb-3">Por doctor</h2>
              {reporte.porDoctor.length === 0 ? (
                <div className={cn(cardUI, 'p-8 text-center text-muted-foreground/70 text-sm')}>
                  Sin actividad en el mes
                </div>
              ) : (
                <div className={cn(cardUI, 'overflow-x-auto')}>
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Doctor</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Atendidas</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Pacientes</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Canceladas</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">No asistió</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Ingresos</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Comisión</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reporte.porDoctor.map((d) => (
                        <tr key={d.doctorId} className="border-b last:border-0">
                          <td className="px-4 py-3 text-foreground font-medium">{d.nombre}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{d.citasAtendidas}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{d.pacientesAtendidos}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{d.canceladas}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{d.noShows}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium">{formatMoneda(d.ingresos)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {d.comision !== null ? (
                              <span title={`${d.comisionPct}% de ${formatMoneda(d.ingresos)}`}>
                                {formatMoneda(d.comision)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/60">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {reporte.totalComisiones > 0 && (
                      <tfoot className="border-t bg-muted/30">
                        <tr>
                          <td colSpan={6} className="px-4 py-3 text-right font-medium text-muted-foreground">
                            Total comisiones a liquidar
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold">
                            {formatMoneda(reporte.totalComisiones)}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
