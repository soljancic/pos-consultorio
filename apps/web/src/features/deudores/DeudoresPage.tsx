import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, DollarSign } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatMoneda, formatFecha, buildWhatsAppUrl } from '../../lib/utils'
import { CobroModal } from '../agenda/CobroModal'
import type { Cita } from '@pos/types'

type Deudor = {
  pacienteId: string
  nombre: string
  apellido: string
  whatsapp: string | null
  deudaTotal: number
  ultimaCitaFecha: string
  ultimoServicio: string
  ultimoPago: string | null
  cobros: Array<{
    id: string
    saldoPendiente: number
    cita: Cita & { paciente: any; servicio: any }
  }>
}

export function DeudoresPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [citaCobro, setCitaCobro] = useState<Cita | null>(null)

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

  function cobrarDeudor(deudor: Deudor) {
    const cobroMayor = [...deudor.cobros].sort(
      (a, b) => Number(b.saldoPendiente) - Number(a.saldoPendiente)
    )[0]
    setCitaCobro(cobroMayor.cita)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
        <h1 className="text-lg font-semibold text-slate-800">Deudores</h1>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre..."
          className="px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
        />
      </div>

      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="text-center text-slate-500 py-12">Cargando...</div>
        ) : filtrados.length === 0 ? (
          <div className="text-center text-slate-400 py-12">
            {search ? 'No se encontraron deudores' : 'No hay deudas pendientes'}
          </div>
        ) : (
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Paciente</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Ultima cita</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Servicio</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Ultimo pago</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Deuda</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtrados.map((d) => (
                  <tr key={d.pacienteId} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {d.apellido}, {d.nombre}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatFecha(d.ultimaCitaFecha)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{d.ultimoServicio}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {d.ultimoPago ? formatFecha(d.ultimoPago) : 'Sin pagos'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-red-600">
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
                            className="p-1.5 rounded bg-green-50 text-green-600 hover:bg-green-100"
                            title="Enviar WhatsApp"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </a>
                        )}
                        <button
                          onClick={() => cobrarDeudor(d)}
                          className="p-1.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100"
                          title="Cobrar"
                        >
                          <DollarSign className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-sm text-slate-500">
                    {filtrados.length} paciente{filtrados.length !== 1 ? 's' : ''}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600">
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
