import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api-client'
import { formatMoneda } from '../../lib/utils'

export function CatalogoPage() {
  const { data: servicios = [] } = useQuery({
    queryKey: ['servicios'],
    queryFn: () => api.get('/servicios').then((r) => r.data),
  })

  const { data: doctores = [] } = useQuery({
    queryKey: ['doctores'],
    queryFn: () => api.get('/doctores').then((r) => r.data),
  })

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-lg font-semibold text-slate-800">Catalogo</h1>

      <section>
        <h2 className="text-sm font-medium text-slate-600 mb-3 uppercase tracking-wide">Servicios</h2>
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Duracion</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Precio base</th>
              </tr>
            </thead>
            <tbody>
              {(servicios as any[]).map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{s.nombre}</td>
                  <td className="px-4 py-3 text-slate-500">{s.duracionMin} min</td>
                  <td className="px-4 py-3 text-right">{formatMoneda(Number(s.precioBase))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-slate-600 mb-3 uppercase tracking-wide">Doctores</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(doctores as any[]).map((d) => (
            <div key={d.id} className="bg-white rounded-lg border p-4 flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-full shrink-0"
                style={{ backgroundColor: d.colorAgenda }}
              />
              <div>
                <div className="font-medium text-slate-800">{d.nombre}</div>
                <div className="text-sm text-slate-500">{d.especialidad || 'Sin especialidad'}</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {d.horarios?.length || 0} dias de atencion
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
