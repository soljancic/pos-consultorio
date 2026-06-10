import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, subDays } from 'date-fns'
import { Lock } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatMoneda, formatHora, formatFecha } from '../../lib/utils'

export function CajaPage() {
  const queryClient = useQueryClient()
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

  const cerrar = useMutation({
    mutationFn: () => api.post('/caja/cerrar'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['caja-hoy'] }),
  })

  const caja = data?.caja
  const pagos: any[] = data?.pagos || []
  const hoyStr = new Date().toDateString()

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-slate-800">Caja</h1>
          <div className="flex gap-1">
            {(['hoy', 'historial'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize ${tab === t ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        {tab === 'hoy' && caja && !caja.cerrada && (
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

      {tab === 'hoy' && (
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

          {/* Desglose deuda (MVP: Nuevas deudas / Pagos de deuda) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-lg border border-green-200 p-4">
              <div className="text-xs text-slate-500 mb-1">Pagos de deuda anterior</div>
              <div className="text-xl font-bold text-green-700">
                {formatMoneda(Number(data?.pagosDeudaAnterior || 0))}
              </div>
            </div>
            <div className="bg-white rounded-lg border border-red-200 p-4">
              <div className="text-xs text-slate-500 mb-1">Nuevas deudas de hoy</div>
              <div className="text-xl font-bold text-red-600">
                {formatMoneda(Number(data?.nuevasDeudas || 0))}
              </div>
            </div>
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
                {pagos.map((p) => {
                  const fechaCita = new Date(p.cobro.cita.fechaHora)
                  const esDeudaVieja = fechaCita.toDateString() !== hoyStr && fechaCita < new Date()
                  return (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="px-4 py-2 text-slate-500">{formatHora(p.createdAt)}</td>
                      <td className="px-4 py-2 font-medium">
                        {p.cobro.cita.paciente.apellido}, {p.cobro.cita.paciente.nombre}
                        {esDeudaVieja && (
                          <span className="ml-2 text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-medium">Deuda</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate-500">{p.cobro.cita.servicio.nombre}</td>
                      <td className="px-4 py-2 text-slate-500">{p.cobro.cita.doctor.nombre}</td>
                      <td className="px-4 py-2 text-slate-500">{p.formaPago}</td>
                      <td className="px-4 py-2 text-right font-medium text-green-700">
                        {formatMoneda(Number(p.monto))}
                      </td>
                    </tr>
                  )
                })}
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
      )}

      {tab === 'historial' && (
        <div className="p-6 flex-1 overflow-auto space-y-4">
          <div className="flex items-center gap-2">
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
              className="px-3 py-2 border rounded-md text-sm" />
            <span className="text-slate-400">a</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
              className="px-3 py-2 border rounded-md text-sm" />
          </div>
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Fecha</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Efectivo</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">QR</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Transf.</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Tarjeta</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Total</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Estado</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="px-4 py-3 font-medium">{formatFecha(c.fecha)}</td>
                    <td className="px-4 py-3 text-right">{formatMoneda(Number(c.totalEfectivo))}</td>
                    <td className="px-4 py-3 text-right">{formatMoneda(Number(c.totalQr))}</td>
                    <td className="px-4 py-3 text-right">{formatMoneda(Number(c.totalTransferencia))}</td>
                    <td className="px-4 py-3 text-right">{formatMoneda(Number(c.totalTarjeta))}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatMoneda(Number(c.totalGeneral))}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.cerrada ? 'bg-slate-100 text-slate-600' : 'bg-green-50 text-green-700'}`}>
                        {c.cerrada ? 'Cerrada' : 'Abierta'}
                      </span>
                    </td>
                  </tr>
                ))}
                {historial.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Sin cajas en el periodo</td></tr>
                )}
              </tbody>
              <tfoot className="bg-slate-50 border-t">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-sm text-slate-500">Total del periodo</td>
                  <td className="px-4 py-3 text-right font-bold">
                    {formatMoneda(historial.reduce((acc, c) => acc + Number(c.totalGeneral), 0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
