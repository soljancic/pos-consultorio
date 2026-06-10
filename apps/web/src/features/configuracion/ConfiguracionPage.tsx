import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil } from 'lucide-react'
import { api } from '../../lib/api-client'
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
  })

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
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultorio'] })
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2000)
    },
  })

  const inputClass =
    'w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b bg-card">
        <h1 className="text-lg font-semibold text-foreground">Configuracion</h1>
        <div className="flex gap-1 mt-3">
          {(['usuarios', 'consultorio'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize ${tab === t ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 max-w-3xl mx-auto w-full">
        {tab === 'usuarios' && (
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={() => { setUsuarioEdit(null); setUsuarioModal(true) }}
                className="flex items-center gap-1 bg-primary text-white px-3 py-1.5 rounded-md text-sm hover:bg-primary/90">
                <Plus className="h-3.5 w-3.5" /> Nuevo usuario
              </button>
            </div>
            <div className="bg-card rounded-lg border overflow-x-auto">
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
                    <tr key={u.id} className="border-b last:border-0">
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
                          className="text-muted-foreground/70 hover:text-foreground">
                          <Pencil className="h-4 w-4" />
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
          <div className="bg-card rounded-lg border p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Nombre del consultorio</label>
              <input value={consForm.nombre} onChange={(e) => setConsForm((f) => ({ ...f, nombre: e.target.value }))}
                className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Logo (URL)</label>
              <input value={consForm.logoUrl} placeholder="https://..."
                onChange={(e) => setConsForm((f) => ({ ...f, logoUrl: e.target.value }))}
                className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Telefono</label>
                <input value={consForm.telefono} onChange={(e) => setConsForm((f) => ({ ...f, telefono: e.target.value }))}
                  className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Direccion</label>
                <input value={consForm.direccion} onChange={(e) => setConsForm((f) => ({ ...f, direccion: e.target.value }))}
                  className={inputClass} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Moneda</label>
                <select value={consForm.moneda} onChange={(e) => setConsForm((f) => ({ ...f, moneda: e.target.value }))}
                  className={inputClass}>
                  {MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Timezone</label>
                <select value={consForm.timezone} onChange={(e) => setConsForm((f) => ({ ...f, timezone: e.target.value }))}
                  className={inputClass}>
                  {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button onClick={() => updateConsultorio.mutate(consForm)} disabled={updateConsultorio.isPending}
                className="px-4 py-2 bg-primary text-white rounded-md text-sm hover:bg-primary/90 disabled:opacity-60">
                {updateConsultorio.isPending ? 'Guardando...' : 'Guardar cambios'}
              </button>
              {guardado && <span className="text-sm text-accent">Guardado</span>}
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
