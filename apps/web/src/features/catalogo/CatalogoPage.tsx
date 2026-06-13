import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Pencil, ClipboardList } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatMoneda, cn } from '../../lib/utils'
import { btnPrimaryUI, btnIconUI, cardUI, chipIconUI } from '../../lib/ui'
import { useAuthStore } from '../../stores/auth.store'
import { ServicioModal } from './ServicioModal'
import { DoctorModal } from './DoctorModal'
import { TipoGastoModal } from './TipoGastoModal'
import { TipoCuentaModal } from './TipoCuentaModal'

export function CatalogoPage() {
  const user = useAuthStore((s) => s.user)
  const esAdmin = user?.rol === 'ADMIN'

  const [servicioEdit, setServicioEdit] = useState<any | null>(null)
  const [servicioModal, setServicioModal] = useState(false)
  const [doctorEdit, setDoctorEdit] = useState<any | null>(null)
  const [doctorModal, setDoctorModal] = useState(false)
  const [tgEdit, setTgEdit] = useState<any | null>(null)
  const [tgModal, setTgModal] = useState(false)
  const [tcEdit, setTcEdit] = useState<any | null>(null)
  const [tcModal, setTcModal] = useState(false)

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

  // Catalogos de tipos (solo ADMIN los administra)
  const { data: tiposGasto = [] } = useQuery({
    queryKey: ['tipos-gasto', 'todos'],
    queryFn: () => api.get('/tipos-gasto').then((r) => r.data),
    enabled: esAdmin,
  })

  const { data: tiposCuenta = [] } = useQuery({
    queryKey: ['tipos-cuenta', 'todos'],
    queryFn: () => api.get('/tipos-cuenta').then((r) => r.data),
    enabled: esAdmin,
  })

  return (
    <div className="p-4 sm:p-6 space-y-8 max-w-4xl mx-auto">
      <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <span className={chipIconUI}>
          <ClipboardList className="h-4 w-4" aria-hidden="true" />
        </span>
        Catálogo
      </h1>

      {/* Servicios */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Servicios</h2>
          {esAdmin && (
            <button onClick={() => { setServicioEdit(null); setServicioModal(true) }}
              className={cn(btnPrimaryUI, 'h-9 px-3')}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Nuevo servicio
            </button>
          )}
        </div>
        <div className={cn(cardUI, 'overflow-x-auto')}>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Duración</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Precio base</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
                {esAdmin && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {(servicios as any[]).map((s) => (
                <tr key={s.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors duration-150">
                  <td className="px-4 py-3 font-medium">{s.nombre}</td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">{s.duracionMin} min</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoneda(Number(s.precioBase))}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.activo ? 'bg-accent/10 text-accent' : 'bg-muted text-muted-foreground'}`}>
                      {s.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  {esAdmin && (
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => { setServicioEdit(s); setServicioModal(true) }}
                        aria-label={`Editar servicio ${s.nombre}`}
                        className={cn(btnIconUI, 'text-muted-foreground/70 hover:text-foreground hover:bg-muted')}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
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
              className={cn(btnPrimaryUI, 'h-9 px-3')}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Nuevo doctor
            </button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(doctores as any[]).map((d) => (
            <div key={d.id} className={cn(cardUI, 'p-4 flex items-center gap-3')}>
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
                  aria-label={`Editar doctor ${d.nombre}`}
                  className={cn(btnIconUI, 'text-muted-foreground/70 hover:text-foreground hover:bg-muted shrink-0')}>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
          {(doctores as any[]).length === 0 && (
            <div className="text-sm text-muted-foreground/70 py-4">Sin doctores</div>
          )}
        </div>
      </section>

      {/* Tipos de gasto (solo ADMIN) */}
      {esAdmin && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Tipos de gasto</h2>
            <button onClick={() => { setTgEdit(null); setTgModal(true) }}
              className={cn(btnPrimaryUI, 'h-9 px-3')}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Nuevo tipo
            </button>
          </div>
          <div className={cn(cardUI, 'overflow-x-auto')}>
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nombre</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {(tiposGasto as any[]).map((t) => (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors duration-150">
                    <td className="px-4 py-3 font-medium">{t.nombre}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.activo ? 'bg-accent/10 text-accent' : 'bg-muted text-muted-foreground'}`}>
                        {t.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => { setTgEdit(t); setTgModal(true) }}
                        aria-label={`Editar ${t.nombre}`}
                        className={cn(btnIconUI, 'text-muted-foreground/70 hover:text-foreground hover:bg-muted')}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
                {(tiposGasto as any[]).length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground/70">Sin tipos de gasto</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Tipos de cuenta (solo ADMIN) */}
      {esAdmin && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Tipos de cuenta</h2>
            <button onClick={() => { setTcEdit(null); setTcModal(true) }}
              className={cn(btnPrimaryUI, 'h-9 px-3')}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Nueva cuenta
            </button>
          </div>
          <div className={cn(cardUI, 'overflow-x-auto')}>
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nombre</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Efectivo</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {(tiposCuenta as any[]).map((t) => (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors duration-150">
                    <td className="px-4 py-3 font-medium">{t.nombre}</td>
                    <td className="px-4 py-3">
                      {t.esEfectivo && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-primary/10 text-primary">Efectivo</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.activo ? 'bg-accent/10 text-accent' : 'bg-muted text-muted-foreground'}`}>
                        {t.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => { setTcEdit(t); setTcModal(true) }}
                        aria-label={`Editar ${t.nombre}`}
                        className={cn(btnIconUI, 'text-muted-foreground/70 hover:text-foreground hover:bg-muted')}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
                {(tiposCuenta as any[]).length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground/70">Sin tipos de cuenta</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {servicioModal && (
        <ServicioModal servicio={servicioEdit} onClose={() => setServicioModal(false)} />
      )}
      {doctorModal && (
        <DoctorModal doctor={doctorEdit} onClose={() => setDoctorModal(false)} />
      )}
      {tgModal && (
        <TipoGastoModal tipo={tgEdit} onClose={() => setTgModal(false)} />
      )}
      {tcModal && (
        <TipoCuentaModal tipo={tcEdit} onClose={() => setTcModal(false)} />
      )}
    </div>
  )
}
