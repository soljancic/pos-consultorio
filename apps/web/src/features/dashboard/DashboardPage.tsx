import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import { CampanaFlotante } from '../notificaciones/CampanaFlotante'
import {
  CalendarDays,
  Clock,
  Activity,
  CheckCircle2,
  CircleDollarSign,
  Wallet,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  CalendarClock,
  ArrowRight,
} from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatMoneda, cn } from '../../lib/utils'
import { cardUI, btnOutlineUI } from '../../lib/ui'
import { EmptyState } from '../../components/shared/EmptyState'
import { EstadoCita } from '@pos/types'
import type { Cita } from '@pos/types'
import { useAuthStore } from '../../stores/auth.store'

type StatTone = 'primary' | 'warning' | 'info' | 'success' | 'neutral'

// chip = color del icono; card = tinte de fondo para resaltar las metricas
// accionables (en espera, por cobrar) por encima de las informativas.
const TONOS: Record<StatTone, { chip: string; card: string }> = {
  primary: { chip: 'bg-primary/10 text-primary', card: 'bg-primary/5 border-primary/20' },
  warning: {
    chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    card: 'bg-amber-500/5 border-amber-500/25',
  },
  info: { chip: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400', card: 'bg-cyan-500/5 border-cyan-500/20' },
  success: { chip: 'bg-accent/10 text-accent', card: 'bg-accent/5 border-accent/20' },
  neutral: { chip: 'bg-foreground/5 text-foreground/70', card: '' },
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse motion-reduce:animate-none rounded bg-muted', className)} />
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  emphasis = false,
}: {
  label: string
  value: number
  icon: typeof CalendarDays
  tone: StatTone
  emphasis?: boolean
}) {
  return (
    <div className={cn(cardUI, 'p-4 flex items-center gap-3', emphasis && TONOS[tone].card)}>
      <span className={cn('rounded-lg p-2.5 shrink-0', TONOS[tone].chip)}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-tight tabular-nums text-foreground">{value}</p>
        <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
      </div>
    </div>
  )
}

function StatCardSkeleton() {
  return (
    <div className={cn(cardUI, 'p-4 flex items-center gap-3')} aria-hidden="true">
      <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-6 w-10" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  )
}

// Distingue un fallo de carga de un resultado realmente vacio: sin esto, una
// peticion caida se ve igual que "cero" y el usuario confia en un dato falso.
function PanelError({ onRetry, className }: { onRetry: () => void; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center text-center gap-2 py-4', className)} role="alert">
      <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">No se pudieron cargar los datos.</p>
      <button type="button" onClick={onRetry} className={btnOutlineUI}>
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        Reintentar
      </button>
    </div>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const hoy = format(new Date(), 'yyyy-MM-dd')
  const fechaLabel = format(new Date(), "EEEE d 'de' MMMM", { locale: es })

  const citasQuery = useQuery<Cita[]>({
    queryKey: ['citas', hoy],
    queryFn: () => api.get(`/citas?fecha=${hoy}`).then((r) => r.data),
  })
  // Array.isArray (no solo ?? []): si la respuesta llega malformada (ej. un proxy
  // devuelve HTML con 200), data es un no-array y un .filter/.reduce tiraria el
  // ErrorBoundary en la pagina de inicio. Asi degrada a vacio.
  const citas = Array.isArray(citasQuery.data) ? citasQuery.data : []

  const cajaQuery = useQuery({
    queryKey: ['caja-hoy'],
    queryFn: () => api.get('/caja/hoy').then((r) => r.data),
  })
  const cajaData = cajaQuery.data
  const caja = cajaData?.caja

  const deudasQuery = useQuery<{ totalDeuda: number; cantidadPacientes: number }>({
    queryKey: ['deudores-resumen'],
    queryFn: () => api.get('/cobros/deudores/resumen').then((r) => r.data),
  })
  const deudas = deudasQuery.data

  const inicioMes = format(new Date(), 'yyyy-MM-01')
  const historialQuery = useQuery<Array<{ totalGeneral: string }>>({
    queryKey: ['caja-historial', inicioMes, hoy],
    queryFn: () => api.get(`/caja/historial?desde=${inicioMes}&hasta=${hoy}`).then((r) => r.data),
  })
  const ingresosMes = (Array.isArray(historialQuery.data) ? historialQuery.data : []).reduce(
    (acc, c) => acc + Number(c.totalGeneral),
    0,
  )

  const gastosQuery = useQuery<{ total: number }>({
    queryKey: ['gastos-resumen', inicioMes, hoy],
    queryFn: () => api.get(`/gastos/resumen?desde=${inicioMes}&hasta=${hoy}`).then((r) => r.data),
  })
  const resultadoNeto = ingresosMes - (gastosQuery.data?.total ?? 0)
  const mesPendiente = historialQuery.isPending || gastosQuery.isPending

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

  // Desglose dinamico por forma de pago (cuenta), igual que CajaPage: sale del
  // catalogo TipoCuenta, no de campos fijos (totalQr/Vales/Tarjeta ya no existen
  // tras la migracion y daban NaN). El monto llega null cuando el arqueo ciego
  // lo oculta a quien no es ADMIN con el turno abierto.
  const filasCaja: Array<[string, number | null]> = (
    Array.isArray(cajaData?.desglosePagos)
      ? (cajaData.desglosePagos as Array<{ nombre: string; total: number | null }>)
      : []
  ).map((c) => [c.nombre, c.total])

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6 max-w-5xl mx-auto w-full">
      <CampanaFlotante />
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Buen día{user?.nombre ? `, ${user.nombre}` : ''}
        </h1>
        <p className="text-sm text-muted-foreground capitalize mt-0.5">{fechaLabel}</p>
      </div>

      {/* Metricas de citas */}
      <div
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3"
        aria-busy={citasQuery.isPending}
      >
        {citasQuery.isPending ? (
          <div className="contents" role="status" aria-label="Cargando métricas del día">
            {Array.from({ length: 5 }).map((_, i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>
        ) : citasQuery.isError ? (
          <div className="col-span-2 sm:col-span-3 lg:col-span-5">
            <div className={cn(cardUI, 'p-4')}>
              <PanelError onRetry={() => citasQuery.refetch()} />
            </div>
          </div>
        ) : (
          <>
            <StatCard label="Citas hoy" value={citas.length} icon={CalendarDays} tone="neutral" />
            <StatCard label="En espera" value={enEspera} icon={Clock} tone="warning" emphasis />
            <StatCard label="En atención" value={enAtencion} icon={Activity} tone="info" />
            <StatCard label="Atendidos" value={atendidosHoy} icon={CheckCircle2} tone="success" />
            <StatCard label="Por cobrar" value={porCobrar} icon={CircleDollarSign} tone="primary" emphasis />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Caja del día */}
        <div className={cn(cardUI, 'p-5')}>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-4">
            <span className="bg-primary/10 text-primary rounded-md p-1.5">
              <Wallet className="h-4 w-4" aria-hidden="true" />
            </span>
            Caja del día
          </h2>
          {cajaQuery.isPending ? (
            <div className="space-y-2.5" role="status" aria-label="Cargando caja del día">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-5 w-full mt-3" />
            </div>
          ) : cajaQuery.isError ? (
            <PanelError onRetry={() => cajaQuery.refetch()} />
          ) : (
            <>
              {caja ? (
                <div className="space-y-2 text-sm">
                  {filasCaja.map(([label, monto]) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium tabular-nums text-foreground">
                        {monto === null ? '••••' : formatMoneda(Number(monto))}
                      </span>
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
              <div className="space-y-1.5 border-t mt-3 pt-3">
                {mesPendiente ? (
                  <div className="space-y-2" role="status" aria-label="Cargando resumen del mes">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Ingresos del mes</span>
                      <span className="tabular-nums font-medium text-foreground">{formatMoneda(ingresosMes)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Gastos del mes</span>
                      <span className="tabular-nums font-medium text-destructive">
                        {formatMoneda(gastosQuery.data?.total ?? 0)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm font-semibold pt-1">
                      <span className="text-foreground">Resultado neto</span>
                      <span
                        className={cn(
                          'tabular-nums',
                          resultadoNeto >= 0 ? 'text-accent' : 'text-destructive',
                        )}
                      >
                        {formatMoneda(resultadoNeto)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Deudas pendientes */}
        <div className={cn(cardUI, 'p-5')}>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-4">
            <span className="bg-destructive/10 text-destructive rounded-md p-1.5">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
            </span>
            Deudas pendientes
          </h2>
          {deudasQuery.isPending ? (
            <div className="space-y-3" role="status" aria-label="Cargando deudas pendientes">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-4 w-20" />
            </div>
          ) : deudasQuery.isError ? (
            <PanelError onRetry={() => deudasQuery.refetch()} />
          ) : deudas && deudas.totalDeuda > 0 ? (
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
                type="button"
                onClick={() => navigate('/deudores')}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary cursor-pointer hover:underline focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60 rounded transition-colors duration-150"
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
      {!citasQuery.isPending && !citasQuery.isError && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">Próximas citas de hoy</h2>
          {proximasCitas.length > 0 ? (
            <div className={cn(cardUI, 'overflow-x-auto')}>
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-20">Hora</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Paciente</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Doctor</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Servicio</th>
                  </tr>
                </thead>
                <tbody>
                  {proximasCitas.map((cita) => {
                    const hora = format(new Date(cita.fechaHora), 'HH:mm')
                    return (
                      <tr
                        key={cita.id}
                        tabIndex={0}
                        role="link"
                        aria-label={`Ver en agenda la cita de ${hora}, ${cita.paciente?.nombre} ${cita.paciente?.apellido}`}
                        onClick={() => navigate('/agenda')}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            navigate('/agenda')
                          }
                        }}
                        className="border-b last:border-0 hover:bg-muted/60 focus-visible:outline-hidden focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 cursor-pointer transition-colors duration-150"
                      >
                        <td className="px-4 py-3 font-semibold text-primary tabular-nums w-20">{hora}</td>
                        <td className="px-4 py-3 font-medium text-foreground">
                          {cita.paciente?.nombre} {cita.paciente?.apellido}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{cita.doctor?.nombre}</td>
                        <td className="px-4 py-3 text-muted-foreground">{cita.servicio?.nombre}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={cardUI}>
              <EmptyState
                icon={CalendarClock}
                title="No hay próximas citas"
                description="No quedan citas pendientes de atender hoy."
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
