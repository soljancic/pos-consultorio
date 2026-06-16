import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, ClipboardList, Stethoscope, UserRound, Tag, Landmark } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatMoneda, cn } from '../../lib/utils'
import { btnPrimaryUI, btnIconUI, cardUI, chipIconUI } from '../../lib/ui'
import { useAuthStore } from '../../stores/auth.store'
import { ServicioModal } from './ServicioModal'
import { DoctorModal } from './DoctorModal'
import { TipoGastoModal } from './TipoGastoModal'
import { TipoCuentaModal } from './TipoCuentaModal'
import { ConfirmarModal } from '../../components/shared/ConfirmarModal'
import { EmptyState } from '../../components/shared/EmptyState'
import { ErrorState } from '../../components/shared/ErrorState'
import { DoctorAvatar } from '../../components/shared/DoctorAvatar'
import { CampanaHeader } from '../notificaciones/CampanaHeader'

export function CatalogoPage() {
  const user = useAuthStore((s) => s.user)
  const esAdmin = user?.rol === 'ADMIN'

  // 2 tabs para que la pagina no quede larguisima (los tipos solo los ve ADMIN)
  const [tab, setTab] = useState<'prestaciones' | 'finanzas'>('prestaciones')
  const TABS = [
    { id: 'prestaciones' as const, label: 'Servicios y doctores' },
    ...(esAdmin ? [{ id: 'finanzas' as const, label: 'Tipos de gasto y cuenta' }] : []),
  ]

  const [servicioEdit, setServicioEdit] = useState<any | null>(null)
  const [servicioModal, setServicioModal] = useState(false)
  const [doctorEdit, setDoctorEdit] = useState<any | null>(null)
  const [doctorModal, setDoctorModal] = useState(false)
  const [tgEdit, setTgEdit] = useState<any | null>(null)
  const [tgModal, setTgModal] = useState(false)
  const [tcEdit, setTcEdit] = useState<any | null>(null)
  const [tcModal, setTcModal] = useState(false)
  const [tgBorrar, setTgBorrar] = useState<any | null>(null)
  const [tcBorrar, setTcBorrar] = useState<any | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const qc = useQueryClient()

  // queryKey distinto al de la agenda (['servicios'] / ['doctores']) porque
  // el catalogo incluye inactivos; la invalidacion por prefijo cubre ambos.
  const { data: servicios = [], isError: errSrv, refetch: refSrv } = useQuery({
    queryKey: ['servicios', 'todos'],
    queryFn: () => api.get('/servicios?todos=true').then((r) => r.data),
  })

  const { data: doctores = [], isError: errDoc, refetch: refDoc } = useQuery({
    queryKey: ['doctores', 'todos'],
    queryFn: () => api.get('/doctores?todos=true').then((r) => r.data),
  })

  // Catalogos de tipos (solo ADMIN los administra)
  const { data: tiposGasto = [], isError: errTG, refetch: refTG } = useQuery({
    queryKey: ['tipos-gasto', 'todos'],
    queryFn: () => api.get('/tipos-gasto').then((r) => r.data),
    enabled: esAdmin,
  })

  const { data: tiposCuenta = [], isError: errTC, refetch: refTC } = useQuery({
    queryKey: ['tipos-cuenta', 'todos'],
    queryFn: () => api.get('/tipos-cuenta').then((r) => r.data),
    enabled: esAdmin,
  })

  // El backend borra si no esta usado; si la FK lo impide, lo desactiva y avisa
  const borrarTipoGasto = useMutation({
    mutationFn: (id: number) => api.delete(`/tipos-gasto/${id}`).then((r) => r.data),
    onSuccess: (res: { eliminado: boolean }) => {
      qc.invalidateQueries({ queryKey: ['tipos-gasto'] })
      setTgBorrar(null)
      if (res?.eliminado === false) {
        setAviso('Este tipo de gasto ya tiene gastos registrados, asi que no se pudo eliminar. Se marco como inactivo para que no aparezca al cargar nuevos gastos.')
      }
    },
  })

  const borrarTipoCuenta = useMutation({
    mutationFn: (id: number) => api.delete(`/tipos-cuenta/${id}`).then((r) => r.data),
    onSuccess: (res: { eliminado: boolean }) => {
      qc.invalidateQueries({ queryKey: ['tipos-cuenta'] })
      setTcBorrar(null)
      if (res?.eliminado === false) {
        setAviso('Esta cuenta ya tiene gastos registrados, asi que no se pudo eliminar. Se marco como inactiva para que no aparezca al cargar nuevos gastos.')
      }
    },
  })

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b bg-card">
        <div className="flex items-center gap-4">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <span className={chipIconUI}>
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
            </span>
            Catálogo
          </h1>
          <div className="flex gap-1" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                role="tab"
                aria-selected={tab === t.id}
                className={cn(
                  'px-4 py-1.5 rounded-md text-sm font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150',
                  tab === t.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <CampanaHeader />
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-6 max-w-4xl mx-auto w-full">

      {tab === 'prestaciones' && (errSrv || errDoc ? (
        <ErrorState onRetry={() => { refSrv(); refDoc() }} />
      ) : (
        <div className="space-y-8">

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
                <tr><td colSpan={esAdmin ? 5 : 4} className="px-4 py-2"><EmptyState icon={Stethoscope} title="Sin servicios" description="Agregá tu primer servicio con “Nuevo servicio”." className="py-8" /></td></tr>
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
              <DoctorAvatar nombre={d.nombre} colorAgenda={d.colorAgenda} fotoUrl={d.fotoUrl} size={40} />
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
            <EmptyState icon={UserRound} title="Sin doctores" description="Agregá tu primer profesional con “Nuevo doctor”." className="py-8 col-span-full" />
          )}
        </div>
      </section>
        </div>
      ))}

      {tab === 'finanzas' && esAdmin && (errTG || errTC ? (
        <ErrorState onRetry={() => { refTG(); refTC() }} />
      ) : (
        <div className="space-y-8">

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
                      <span className="inline-flex gap-1">
                        <button onClick={() => { setTgEdit(t); setTgModal(true) }}
                          aria-label={`Editar ${t.nombre}`}
                          className={cn(btnIconUI, 'text-muted-foreground/70 hover:text-foreground hover:bg-muted')}>
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button onClick={() => setTgBorrar(t)}
                          aria-label={`Eliminar ${t.nombre}`}
                          className={cn(btnIconUI, 'text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10')}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
                {(tiposGasto as any[]).length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-2"><EmptyState icon={Tag} title="Sin tipos de gasto" description="Creá las categorías con las que vas a clasificar los gastos." className="py-8" /></td></tr>
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
                      <span className="inline-flex gap-1">
                        <button onClick={() => { setTcEdit(t); setTcModal(true) }}
                          aria-label={`Editar ${t.nombre}`}
                          className={cn(btnIconUI, 'text-muted-foreground/70 hover:text-foreground hover:bg-muted')}>
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button onClick={() => setTcBorrar(t)}
                          aria-label={`Eliminar ${t.nombre}`}
                          className={cn(btnIconUI, 'text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10')}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
                {(tiposCuenta as any[]).length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-2"><EmptyState icon={Landmark} title="Sin tipos de cuenta" description="Definí las cuentas/formas de pago para los gastos." className="py-8" /></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
        </div>
      ))}
      </div>

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
      {tgBorrar && (
        <ConfirmarModal
          titulo="Eliminar tipo de gasto"
          mensaje={`Se elimina "${tgBorrar.nombre}". Si ya tiene gastos registrados no se puede borrar: en ese caso se marca como inactivo y deja de aparecer al cargar nuevos gastos.`}
          confirmLabel="Eliminar"
          pendiente={borrarTipoGasto.isPending}
          onConfirm={() => borrarTipoGasto.mutate(tgBorrar.id)}
          onClose={() => setTgBorrar(null)}
        />
      )}
      {tcBorrar && (
        <ConfirmarModal
          titulo="Eliminar tipo de cuenta"
          mensaje={`Se elimina "${tcBorrar.nombre}". Si ya tiene gastos registrados no se puede borrar: en ese caso se marca como inactiva y deja de aparecer al cargar nuevos gastos.`}
          confirmLabel="Eliminar"
          pendiente={borrarTipoCuenta.isPending}
          onConfirm={() => borrarTipoCuenta.mutate(tcBorrar.id)}
          onClose={() => setTcBorrar(null)}
        />
      )}
      {aviso && (
        <ConfirmarModal
          titulo="No se pudo eliminar"
          mensaje={aviso}
          confirmLabel="Entendido"
          onConfirm={() => setAviso(null)}
          onClose={() => setAviso(null)}
        />
      )}
    </div>
  )
}
