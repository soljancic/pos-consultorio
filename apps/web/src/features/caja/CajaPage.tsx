import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatMoneda, formatHora } from '../../lib/utils'

export function CajaPage() {
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['caja-hoy'],
    queryFn: () => api.get('/caja/hoy').then((r) => r.data),
    refetchInterval: 30_000,
  })

  const cerrar = useMutation({
    mutationFn: () => api.post('/caja/cerrar'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['caja-hoy'] }),
  })

  const caja = data?.caja
  const pagos: any[] = data?.pagos || []

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
        <h1 className="text-lg font-semibold text-slate-800">Caja del dia</h1>
        {caja && !caja.cerrada && (
          <button
            onClick={() => cerrar.mutate()}
            disabled={cerrar.isPending}
            className="flex items-center gap-1 border border-slate-300 px-3 py-2 rounded-md text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Lock className="h-4 w-4" />
            Cerrar caja
          </button>
        )}
      </div>

      <div className="p-6 flex-1 overflow-auto space-y-6">
        {/* Totales */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: 'Efectivo', value: caja?.totalEfectivo },
            { label: 'QR', value: caja?.totalQr },
            { label: 'Transferencia', value: caja?.totalTransferencia },
            { label: 'Tarjeta', value: caja?.totalTarjeta },
            { label: 'TOTAL', value: caja?.totalGeneral, highlight: true },
          ].map((item) => (
            <div
              key={item.label}
              className={`bg-white rounded-lg border p-4 ${item.highlight ? 'border-blue-400 bg-blue-50' : ''}`}
            >
              <div className="text-xs text-slate-500 mb-1">{item.label}</div>
              <div className={`text-xl font-bold ${item.highlight ? 'text-blue-700' : 'text-slate-800'}`}>
                {formatMoneda(Number(item.value || 0))}
              </div>
            </div>
          ))}
        </div>

        {/* Movimientos */}
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="px-4 py-3 border-b bg-slate-50">
            <h2 className="text-sm font-medium text-slate-700">
              Movimientos ({pagos.length})
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr>
                <th className="text-left px-4 py-2 text-slate-500 font-medium">Hora</th>
                <th className="text-left px-4 py-2 text-slate-500 font-medium">Paciente</th>
                <th className="text-left px-4 py-2 text-slate-500 font-medium">Servicio</th>
                <th className="text-left px-4 py-2 text-slate-500 font-medium">Doctor</th>
                <th className="text-left px-4 py-2 text-slate-500 font-medium">Forma</th>
                <th className="text-right px-4 py-2 text-slate-500 font-medium">Monto</th>
              </tr>
            </thead>
            <tbody>
              {pagos.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-4 py-2 text-slate-500">{formatHora(p.createdAt)}</td>
                  <td className="px-4 py-2 font-medium">
                    {p.cobro.cita.paciente.apellido}, {p.cobro.cita.paciente.nombre}
                  </td>
                  <td className="px-4 py-2 text-slate-500">{p.cobro.cita.servicio.nombre}</td>
                  <td className="px-4 py-2 text-slate-500">{p.cobro.cita.doctor.nombre}</td>
                  <td className="px-4 py-2 text-slate-500">{p.formaPago}</td>
                  <td className="px-4 py-2 text-right font-medium text-green-700">
                    {formatMoneda(Number(p.monto))}
                  </td>
                </tr>
              ))}
              {pagos.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No hay movimientos hoy
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
