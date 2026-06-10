import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Pencil } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatMoneda } from '../../lib/utils'
import { useAuthStore } from '../../stores/auth.store'
import { ServicioModal } from './ServicioModal'
import { DoctorModal } from './DoctorModal'

export function CatalogoPage() {
  const user = useAuthStore((s) => s.user)
  const esAdmin = user?.rol === 'ADMIN'

  const [servicioEdit, setServicioEdit] = useState<any | null>(null)
  const [servicioModal, setServicioModal] = useState(false)
  const [doctorEdit, setDoctorEdit] = useState<any | null>(null)
  const [doctorModal, setDoctorModal] = useState(false)

  // queryKey distinto al de la agenda (['servicios'] / ['doctores']) porque
  // el catalogo incluye inactivos; la invalidacion por prefijo cubre ambos.
  const { data: servicios = [] } = useQuery({
    queryKey: ['servicios', 'todos'],
    queryFn: () => api.get('/servicios?todos=true').then((r) => r.data),
  })

  const { data: doctores = [] } = useQuery({
    queryKey: ['doctores', 'todos'],
    queryFn: () => api.get('/doctores?todos=true').then((r) => r.data),
  })

  return (
    <div className="p-6 space-y-8 max-w-4xl mx-auto">
      <h1 className="text-lg font-semibold text-foreground">Catalogo</h1>

      {/* Servicios */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Servicios</h2>
          {esAdmin && (
            <button onClick={() => { setServicioEdit(null); setServicioModal(true) }}
              className="flex items-center gap-1 bg-primary text-white px-3 py-1.5 rounded-md text-sm hover:bg-primary/90">
              <Plus className="h-3.5 w-3.5" /> Nuevo servicio
            </button>
          )}
        </div>
        <div className="bg-card rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Duracion</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Precio base</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
                {esAdmin && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {(servicios as any[]).map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{s.nombre}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.duracionMin} min</td>
                  <td className="px-4 py-3 text-right">{formatMoneda(Number(s.precioBase))}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.activo ? 'bg-accent/10 text-accent' : 'bg-muted text-muted-foreground'}`}>
                      {s.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  {esAdmin && (
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => { setServicioEdit(s); setServicioModal(true) }}
                        className="text-muted-foreground/70 hover:text-foreground">
                        <Pencil className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {(servicios as any[]).length === 0 && (
                <tr><td colSpan={esAdmin ? 5 : 4} className="px-4 py-8 text-center text-muted-foreground/70">Sin servicios</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Doctores */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Doctores</h2>
          {esAdmin && (
            <button onClick={() => { setDoctorEdit(null); setDoctorModal(true) }}
              className="flex items-center gap-1 bg-primary text-white px-3 py-1.5 rounded-md text-sm hover:bg-primary/90">
              <Plus className="h-3.5 w-3.5" /> Nuevo doctor
            </button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(doctores as any[]).map((d) => (
            <div key={d.id} className="bg-card rounded-lg border p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full shrink-0" style={{ backgroundColor: d.colorAgenda }} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground truncate">{d.nombre}</div>
                <div className="text-sm text-muted-foreground">{d.especialidad || 'Sin especialidad'}</div>
                {!d.activo && (
                  <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">
                    Inactivo
                  </span>
                )}
              </div>
              {esAdmin && (
                <button onClick={() => { setDoctorEdit(d); setDoctorModal(true) }}
                  className="text-muted-foreground/70 hover:text-foreground shrink-0">
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {(doctores as any[]).length === 0 && (
            <div className="text-sm text-muted-foreground/70 py-4">Sin doctores</div>
          )}
        </div>
      </section>

      {servicioModal && (
        <ServicioModal servicio={servicioEdit} onClose={() => setServicioModal(false)} />
      )}
      {doctorModal && (
        <DoctorModal doctor={doctorEdit} onClose={() => setDoctorModal(false)} />
      )}
    </div>
  )
}
