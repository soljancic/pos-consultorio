import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { api } from '../../lib/api-client'

const ROLES = ['ADMIN', 'SECRETARIA', 'DOCTOR', 'CAJA'] as const

interface Usuario { id?: string; nombre: string; email: string; rol: string; activo: boolean }
interface Props { usuario?: Usuario | null; onClose: () => void }

export function UsuarioModal({ usuario, onClose }: Props) {
  const qc = useQueryClient()
  const editando = !!usuario?.id
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    nombre: usuario?.nombre ?? '',
    email: usuario?.email ?? '',
    password: '',
    rol: usuario?.rol ?? 'SECRETARIA',
    activo: usuario?.activo ?? true,
  })

  const mutation = useMutation({
    mutationFn: (data: typeof form) => {
      if (editando) {
        const payload: Record<string, unknown> = {
          nombre: data.nombre, email: data.email, rol: data.rol, activo: data.activo,
        }
        if (data.password) payload.password = data.password
        return api.put(`/usuarios/${usuario!.id}`, payload)
      }
      return api.post('/usuarios', {
        nombre: data.nombre, email: data.email, rol: data.rol, password: data.password,
      })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['usuarios'] }); onClose() },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al guardar')
    },
  })

  const inputClass =
    'w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-slate-800">
            {editando ? 'Editar usuario' : 'Nuevo usuario'}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate(form) }} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
            <input required value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
            <input required type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {editando ? 'Nueva contrasena (dejar vacio para no cambiar)' : 'Contrasena *'}
            </label>
            <input type="password" required={!editando} minLength={8} value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Rol *</label>
            <select value={form.rol} onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value }))}
              className={inputClass}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {editando && (
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={form.activo} onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))} className="rounded" />
              Usuario activo
            </label>
          )}
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border rounded-md text-sm text-slate-700 hover:bg-slate-50">Cancelar</button>
            <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-60">
              {mutation.isPending ? 'Guardando...' : editando ? 'Guardar' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
