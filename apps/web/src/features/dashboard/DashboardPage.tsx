import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api-client'
import { formatMoneda } from '../../lib/utils'
import { EstadoCita } from '@pos/types'
import type { Cita } from '@pos/types'
import { useAuthStore } from '../../stores/auth.store'

const STAT_COLORS: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-700',
  green: 'bg-green-50 text-green-700',
  yellow: 'bg-yellow-50 text-yellow-700',
  red: 'bg-red-50 text-red-700',
  violet: 'bg-violet-50 text-violet-700',
}

function StatCard({ label, value, color = 'blue' }: { label: string; value: number; color?: string }) {
  return (
    <div className={`rounded-xl p-5 ${STAT_COLORS[color] ?? STAT_COLORS.blue}`}>
      <p className="text-sm font-medium opacity-75">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
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
    .filter((c) => c.estado === EstadoCita.PENDIENTE || c.estado === EstadoCita.CONFIRMADA)
    .sort((a, b) => new Date(a.fechaHora).getTime() - new Date(b.fechaHora).getTime())
    .slice(0, 5)

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6 max-w-5xl mx-auto w-full">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">
          Buen dia{user?.nombre ? `, ${user.nombre}` : ''}
        </h1>
        <p className="text-sm text-slate-500 capitalize">{fechaLabel}</p>
      </div>

      {/* Metricas de citas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Citas hoy" value={citas.length} color="blue" />
        <StatCard label="En espera" value={enEspera} color="yellow" />
        <StatCard label="En atencion" value={enAtencion} color="green" />
        <StatCard label="Atendidos" value={atendidosHoy} color="violet" />
        <StatCard label="Por cobrar" value={porCobrar} color="red" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Caja del dia */}
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-sm font-medium text-slate-600 uppercase tracking-wide mb-3">
            Caja del dia
          </h2>
          {caja ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Efectivo</span>
                <span className="font-medium">{formatMoneda(Number(caja.totalEfectivo))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">QR</span>
                <span className="font-medium">{formatMoneda(Number(caja.totalQr))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Transferencia</span>
                <span className="font-medium">{formatMoneda(Number(caja.totalTransferencia))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tarjeta</span>
                <span className="font-medium">{formatMoneda(Number(caja.totalTarjeta))}</span>
              </div>
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Total</span>
                <span>{formatMoneda(Number(caja.totalGeneral))}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400 pt-1">
                <span>Ingresos del mes</span>
                <span>{formatMoneda(ingresosMes)}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Caja sin movimientos hoy</p>
          )}
        </div>

        {/* Deudas pendientes */}
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-sm font-medium text-slate-600 uppercase tracking-wide mb-3">
            Deudas pendientes
          </h2>
          {deudas && deudas.totalDeuda > 0 ? (
            <div className="space-y-3">
              <div>
                <p className="text-3xl font-bold text-red-600">
                  {formatMoneda(deudas.totalDeuda)}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  {deudas.cantidadPacientes} paciente{deudas.cantidadPacientes !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={() => navigate('/deudores')}
                className="text-sm text-blue-600 hover:underline"
              >
                Ver deudores
              </button>
            </div>
          ) : (
            <p className="text-sm text-green-600 font-medium">Sin deudas pendientes</p>
          )}
        </div>
      </div>

      {/* Proximas citas */}
      {proximasCitas.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-slate-600 uppercase tracking-wide mb-3">
            Proximas citas de hoy
          </h2>
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {proximasCitas.map((cita) => (
                  <tr
                    key={cita.id}
                    onClick={() => navigate('/agenda')}
                    className="border-b last:border-0 hover:bg-slate-50 cursor-pointer"
                  >
                    <td className="px-4 py-3 font-medium text-slate-700 w-20">
                      {format(new Date(cita.fechaHora), 'HH:mm')}
                    </td>
                    <td className="px-4 py-3 text-slate-800">
                      {cita.paciente?.apellido}, {cita.paciente?.nombre}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{cita.doctor?.nombre}</td>
                    <td className="px-4 py-3 text-slate-500">{cita.servicio?.nombre}</td>
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
