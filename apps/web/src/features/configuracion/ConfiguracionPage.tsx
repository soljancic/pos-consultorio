import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Settings, Check } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn } from '../../lib/utils'
import { inputUI, btnPrimaryUI, btnIconUI, cardUI, chipIconUI } from '../../lib/ui'
import { UsuarioModal } from './UsuarioModal'

const MONEDAS = ['ARS', 'USD', 'UYU', 'CLP', 'PEN', 'COP', 'MXN', 'BOB', 'BRL']
const TIMEZONES = [
  'America/Argentina/Buenos_Aires',
  'America/La_Paz',
  'America/Sao_Paulo',
  'America/Montevideo',
  'America/Santiago',
  'America/Lima',
  'America/Bogota',
  'America/Mexico_City',
  'America/New_York',
]
const ROL_LABEL: Record<string, string> = {
  ADMIN: 'Admin', SECRETARIA: 'Secretaria', DOCTOR: 'Doctor', CAJA: 'Caja',
}

type Consultorio = {
  id: number; nombre: string; logoUrl: string | null
  telefono: string | null; direccion: string | null
  moneda: string; timezone: string
  slug: string | null; portalActivo: boolean
}
type Usuario = { id: number; nombre: string; email: string; rol: string; activo: boolean }

export function ConfiguracionPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'usuarios' | 'consultorio'>('usuarios')
  const [usuarioEdit, setUsuarioEdit] = useState<Usuario | null>(null)
  const [usuarioModal, setUsuarioModal] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [consForm, setConsForm] = useState({
    nombre: '', logoUrl: '', telefono: '', direccion: '',
    moneda: 'ARS', timezone: 'America/Argentina/Buenos_Aires',
    slug: '', portalActivo: false,
  })
  const [linkCopiado, setLinkCopiado] = useState(false)

  const { data: usuarios = [] } = useQuery<Usuario[]>({
    queryKey: ['usuarios'],
    queryFn: () => api.get('/usuarios').then((r) => r.data),
  })

  const { data: consultorio } = useQuery<Consultorio>({
    queryKey: ['consultorio'],
    queryFn: () => api.get('/consultorio').then((r) => r.data),
  })

  useEffect(() => {
    if (consultorio) {
      setConsForm({
        nombre: consultorio.nombre,
        logoUrl: consultorio.logoUrl ?? '',
        telefono: consultorio.telefono ?? '',
        direccion: consultorio.direccion ?? '',
        moneda: consultorio.moneda,
        timezone: consultorio.timezone,
        slug: consultorio.slug ?? '',
        portalActivo: consultorio.portalActivo ?? false,
      })
    }
  }, [consultorio])

  const updateConsultorio = useMutation({
    mutationFn: (data: typeof consForm) =>
      api.put('/consultorio', {
        ...data,
        logoUrl: data.logoUrl || undefined,
        telefono: data.telefono || undefined,
        direccion: data.direccion || undefined,
        slug: data.slug || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultorio'] })
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2000)
    },
  })

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 sm:px-6 py-4 border-b bg-card">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <span className={chipIconUI}>
            <Settings className="h-4 w-4" aria-hidden="true" />
          </span>
          Configuración
        </h1>
        <div className="flex gap-1 mt-3" role="tablist">
          {(['usuarios', 'consultorio'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              role="tab"
              aria-selected={tab === t}
              className={cn(
                'px-4 py-1.5 rounded-md text-sm font-medium capitalize cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150',
                tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
              )}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6 max-w-3xl mx-auto w-full">
        {tab === 'usuarios' && (
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={() => { setUsuarioEdit(null); setUsuarioModal(true) }}
                className={cn(btnPrimaryUI, 'h-9 px-3')}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Nuevo usuario
              </button>
            </div>
            <div className={cn(cardUI, 'overflow-x-auto')}>
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nombre</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Rol</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((u) => (
                    <tr key={u.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors duration-150">
                      <td className="px-4 py-3 font-medium">{u.nombre}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-muted text-foreground px-2 py-0.5 rounded-full font-medium">
                          {ROL_LABEL[u.rol] ?? u.rol}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.activo ? 'bg-accent/10 text-accent' : 'bg-muted text-muted-foreground'}`}>
                          {u.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => { setUsuarioEdit(u); setUsuarioModal(true) }}
                          aria-label={`Editar usuario ${u.nombre}`}
                          className={cn(btnIconUI, 'text-muted-foreground/70 hover:text-foreground hover:bg-muted')}>
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'consultorio' && (
          <div className={cn(cardUI, 'p-6 space-y-4')}>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Nombre del consultorio</label>
              <input value={consForm.nombre} onChange={(e) => setConsForm((f) => ({ ...f, nombre: e.target.value }))}
                className={inputUI} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Logo (URL)</label>
              <input type="url" value={consForm.logoUrl} placeholder="https://..."
                onChange={(e) => setConsForm((f) => ({ ...f, logoUrl: e.target.value }))}
                className={inputUI} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Teléfono</label>
                <input type="tel" value={consForm.telefono} onChange={(e) => setConsForm((f) => ({ ...f, telefono: e.target.value }))}
                  className={inputUI} />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Dirección</label>
                <input value={consForm.direccion} onChange={(e) => setConsForm((f) => ({ ...f, direccion: e.target.value }))}
                  className={inputUI} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Moneda</label>
                <select value={consForm.moneda} onChange={(e) => setConsForm((f) => ({ ...f, moneda: e.target.value }))}
                  className={inputUI}>
                  {MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Timezone</label>
                <select value={consForm.timezone} onChange={(e) => setConsForm((f) => ({ ...f, timezone: e.target.value }))}
                  className={inputUI}>
                  {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
            </div>
            {/* Portal publico de reservas (E2.5b) */}
            <div className="border-t pt-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Portal de reservas en línea</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="cons-slug" className="block text-sm font-medium text-foreground mb-1.5">
                    Enlace (slug)
                  </label>
                  <input id="cons-slug" value={consForm.slug}
                    placeholder="mi-consultorio"
                    onChange={(e) => setConsForm((f) => ({ ...f, slug: e.target.value.toLowerCase() }))}
                    className={inputUI} />
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Minúsculas, números y guiones (3-40).
                  </p>
                </div>
                <div className="flex items-start pt-7">
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer">
                    <input type="checkbox" checked={consForm.portalActivo}
                      onChange={(e) => setConsForm((f) => ({ ...f, portalActivo: e.target.checked }))}
                      className="rounded" />
                    Portal activo
                  </label>
                </div>
              </div>
              {consultorio?.slug && consultorio?.portalActivo && (
                <div className="flex flex-wrap items-center gap-2 text-sm bg-muted/50 rounded-md px-3 py-2">
                  <span className="text-muted-foreground truncate">
                    {`${window.location.origin}/reservar/${consultorio.slug}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/reservar/${consultorio.slug}`)
                      setLinkCopiado(true)
                      setTimeout(() => setLinkCopiado(false), 2000)
                    }}
                    className="text-xs font-medium text-primary cursor-pointer hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 rounded transition-colors duration-150"
                  >
                    {linkCopiado ? 'Copiado ✓' : 'Copiar enlace'}
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button onClick={() => updateConsultorio.mutate(consForm)} disabled={updateConsultorio.isPending}
                className={btnPrimaryUI}>
                {updateConsultorio.isPending ? 'Guardando...' : 'Guardar cambios'}
              </button>
              {guardado && (
                <span role="status" className="inline-flex items-center gap-1 text-sm font-medium text-accent">
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Guardado
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {usuarioModal && (
        <UsuarioModal usuario={usuarioEdit} onClose={() => setUsuarioModal(false)} />
      )}
    </div>
  )
}
