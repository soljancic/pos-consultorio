import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import {
  CalendarDays,
  Clock,
  Activity,
  CheckCircle2,
  CircleDollarSign,
  Wallet,
  AlertCircle,
  ArrowRight,
} from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatMoneda } from '../../lib/utils'
import { EstadoCita } from '@pos/types'
import type { Cita } from '@pos/types'
import { useAuthStore } from '../../stores/auth.store'

type StatTone = 'primary' | 'warning' | 'info' | 'success' | 'danger'

const TONOS: Record<StatTone, string> = {
  primary: 'bg-primary/10 text-primary',
  warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  info: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400',
  success: 'bg-accent/10 text-accent',
  danger: 'bg-destructive/10 text-destructive',
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: number
  icon: typeof CalendarDays
  tone: StatTone
}) {
  return (
    <div className="bg-card rounded-xl border p-4 flex items-center gap-3 shadow-sm">
      <span className={`rounded-lg p-2.5 shrink-0 ${TONOS[tone]}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-tight tabular-nums text-foreground">{value}</p>
        <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
      </div>
    </div>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const hoy = format(new Date(), 'yyyy-MM-dd')
  const fechaLabel = format(new Date(), "EEEE d 'de' MMMM", { locale: es })

  const { data: citas = [] } = useQuery<Cita[]>({
    queryKey: ['citas', hoy],
    queryFn: () => api.get(`/citas?fecha=${hoy}`).then((r) => r.data),
  })

  const { data: cajaData } = useQuery({
    queryKey: ['caja-hoy'],
    queryFn: () => api.get('/caja/hoy').then((r) => r.data),
  })
  const caja = cajaData?.caja

  const { data: deudas } = useQuery<{ totalDeuda: number; cantidadPacientes: number }>({
    queryKey: ['deudores-resumen'],
    queryFn: () => api.get('/cobros/deudores/resumen').then((r) => r.data),
  })

  const inicioMes = format(new Date(), 'yyyy-MM-01')
  const { data: historialMes = [] } = useQuery<Array<{ totalGeneral: string }>>({
    queryKey: ['caja-historial', inicioMes, hoy],
    queryFn: () =>
      api.get(`/caja/historial?desde=${inicioMes}&hasta=${hoy}`).then((r) => r.data),
  })
  const ingresosMes = historialMes.reduce((acc, c) => acc + Number(c.totalGeneral), 0)

  const { data: gastosMes } = useQuery<{ total: number }>({
    queryKey: ['gastos-resumen', inicioMes, hoy],
    queryFn: () =>
      api.get(`/gastos/resumen?desde=${inicioMes}&hasta=${hoy}`).then((r) => r.data),
  })
  const resultadoNeto = ingresosMes - (gastosMes?.total ?? 0)

  const enEspera = citas.filter((c) => c.estado === EstadoCita.LLEGO).length
  const enAtencion = citas.filter((c) => c.estado === EstadoCita.EN_ATENCION).length
  const porCobrar = citas.filter(
    (c) => c.estado === EstadoCita.ATENDIDA || c.estado === EstadoCita.CON_DEUDA
  ).length
  const atendidosHoy = citas.filter(
    (c) =>
      c.estado === EstadoCita.ATENDIDA ||
      c.estado === EstadoCita.COBRADO ||
      c.estado === EstadoCita.CON_DEUDA
  ).length

  const proximasCitas = citas
    .filter(
      (c) =>
        c.estado === EstadoCita.SOLICITADA ||
        c.estado === EstadoCita.PENDIENTE ||
        c.estado === EstadoCita.CONFIRMADA,
    )
    .sort((a, b) => new Date(a.fechaHora).getTime() - new Date(b.fechaHora).getTime())
    .slice(0, 5)

  const filasCaja: Array<[string, number]> = caja
    ? [
        ['Efectivo', Number(caja.totalEfectivo)],
        ['QR', Number(caja.totalQr)],
        ['Vales', Number(caja.totalVales)],
        ['Tarjeta', Number(caja.totalTarjeta)],
      ]
    : []

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6 max-w-5xl mx-auto w-full">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Buen dia{user?.nombre ? `, ${user.nombre}` : ''}
        </h1>
        <p className="text-sm text-muted-foreground capitalize mt-0.5">{fechaLabel}</p>
      </div>

      {/* Metricas de citas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Citas hoy" value={citas.length} icon={CalendarDays} tone="primary" />
        <StatCard label="En espera" value={enEspera} icon={Clock} tone="warning" />
        <StatCard label="En atención" value={enAtencion} icon={Activity} tone="info" />
        <StatCard label="Atendidos" value={atendidosHoy} icon={CheckCircle2} tone="success" />
        <StatCard label="Por cobrar" value={porCobrar} icon={CircleDollarSign} tone="danger" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Caja del día */}
        <div className="bg-card rounded-xl border shadow-sm p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-4">
            <span className="bg-primary/10 text-primary rounded-md p-1.5">
              <Wallet className="h-4 w-4" aria-hidden="true" />
            </span>
            Caja del día
          </h2>
          {caja ? (
            <div className="space-y-2 text-sm">
              {filasCaja.map(([label, monto]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium tabular-nums">{formatMoneda(monto)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t pt-2.5 mt-2.5 font-bold text-foreground">
                <span>Total</span>
                <span className="tabular-nums">{formatMoneda(Number(caja.totalGeneral))}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Caja sin movimientos hoy</p>
          )}
          {/* KPIs del mes: independientes de que haya caja hoy */}
          <div className="space-y-1 border-t mt-3 pt-2.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Ingresos del mes</span>
              <span className="tabular-nums">{formatMoneda(ingresosMes)}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Gastos del mes</span>
              <span className="tabular-nums text-destructive">{formatMoneda(gastosMes?.total ?? 0)}</span>
            </div>
            <div className="flex justify-between text-xs font-semibold text-foreground">
              <span>Resultado neto</span>
              <span className={`tabular-nums ${resultadoNeto >= 0 ? 'text-accent' : 'text-destructive'}`}>
                {formatMoneda(resultadoNeto)}
              </span>
            </div>
          </div>
        </div>

        {/* Deudas pendientes */}
        <div className="bg-card rounded-xl border shadow-sm p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-4">
            <span className="bg-destructive/10 text-destructive rounded-md p-1.5">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
            </span>
            Deudas pendientes
          </h2>
          {deudas && deudas.totalDeuda > 0 ? (
            <div className="space-y-3">
              <div>
                <p className="text-3xl font-bold text-destructive tabular-nums">
                  {formatMoneda(deudas.totalDeuda)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {deudas.cantidadPacientes} paciente{deudas.cantidadPacientes !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={() => navigate('/deudores')}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary cursor-pointer hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 rounded transition-colors duration-150"
              >
                Ver deudores
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <p className="text-sm font-medium text-accent">Sin deudas pendientes</p>
          )}
        </div>
      </div>

      {/* Próximas citas */}
      {proximasCitas.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">
            Próximas citas de hoy
          </h2>
          <div className="bg-card rounded-xl border shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {proximasCitas.map((cita) => (
                  <tr
                    key={cita.id}
                    onClick={() => navigate('/agenda')}
                    className="border-b last:border-0 hover:bg-muted/60 cursor-pointer transition-colors duration-150"
                  >
                    <td className="px-4 py-3 font-semibold text-primary tabular-nums w-20">
                      {format(new Date(cita.fechaHora), 'HH:mm')}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {cita.paciente?.apellido}, {cita.paciente?.nombre}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{cita.doctor?.nombre}</td>
                    <td className="px-4 py-3 text-muted-foreground">{cita.servicio?.nombre}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
