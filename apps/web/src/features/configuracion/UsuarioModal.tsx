import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, AlertCircle } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn } from '../../lib/utils'
import { inputUI, btnPrimaryUI, btnOutlineUI, btnIconUI, errorUI } from '../../lib/ui'

const ROLES = ['ADMIN', 'SECRETARIA', 'DOCTOR', 'CAJA'] as const

interface Usuario { id?: number; nombre: string; email: string; rol: string; activo: boolean }
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-xl border shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-foreground">
            {editando ? 'Editar usuario' : 'Nuevo usuario'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className={cn(btnIconUI, 'text-muted-foreground hover:bg-muted hover:text-foreground')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate(form) }} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Nombre *</label>
            <input required value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              className={inputUI} />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Email *</label>
            <input required type="email" autoComplete="off" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className={inputUI} />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              {editando ? 'Nueva contrasena (dejar vacio para no cambiar)' : 'Contrasena *'}
            </label>
            <input type="password" autoComplete="new-password" required={!editando} minLength={8} value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className={inputUI} />
            {!editando && (
              <p className="text-xs text-muted-foreground mt-1.5">Minimo 8 caracteres</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Rol *</label>
            <select value={form.rol} onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value }))}
              className={inputUI}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {editando && (
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" checked={form.activo} onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))} className="rounded" />
              Usuario activo
            </label>
          )}
          {error && (
            <p role="alert" className={errorUI}>
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className={cn(btnOutlineUI, 'flex-1')}>Cancelar</button>
            <button type="submit" disabled={mutation.isPending} className={cn(btnPrimaryUI, 'flex-1')}>
              {mutation.isPending ? 'Guardando...' : editando ? 'Guardar' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
