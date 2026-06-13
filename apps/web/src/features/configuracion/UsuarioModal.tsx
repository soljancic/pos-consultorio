import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, AlertCircle } from 'lucide-react'
import type { Doctor } from '@pos/types'
import { api } from '../../lib/api-client'
import { cn } from '../../lib/utils'
import { inputUI, btnPrimaryUI, btnOutlineUI, btnIconUI, errorUI } from '../../lib/ui'

const ROLES = ['ADMIN', 'SECRETARIA', 'DOCTOR', 'CAJA'] as const

interface Usuario {
  id?: number
  nombre: string
  email: string
  rol: string
  activo: boolean
  doctor?: { id: number; nombre: string } | null
}
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
    doctorId: usuario?.doctor ? String(usuario.doctor.id) : '',
  })

  const { data: doctores = [] } = useQuery<Doctor[]>({
    queryKey: ['doctores'],
    queryFn: () => api.get('/doctores').then((r) => r.data),
    enabled: form.rol === 'DOCTOR',
  })
  // Solo doctores libres o el ya vinculado a este usuario
  const doctoresElegibles = doctores.filter(
    (d) => d.usuarioId == null || d.usuarioId === usuario?.id,
  )

  const mutation = useMutation({
    mutationFn: (data: typeof form) => {
      const doctorId =
        data.rol === 'DOCTOR' && data.doctorId ? Number(data.doctorId) : undefined
      if (editando) {
        const payload: Record<string, unknown> = {
          nombre: data.nombre, email: data.email, rol: data.rol, activo: data.activo,
          ...(doctorId && { doctorId }),
        }
        if (data.password) payload.password = data.password
        return api.put(`/usuarios/${usuario!.id}`, payload)
      }
      // Sin contraseña el backend envia una invitacion por correo (E2-M10)
      return api.post('/usuarios', {
        nombre: data.nombre, email: data.email, rol: data.rol,
        ...(data.password && { password: data.password }),
        ...(doctorId && { doctorId }),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuarios'] })
      qc.invalidateQueries({ queryKey: ['doctores'] })
      onClose()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al guardar')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm modal-fade p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-md">
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
              {editando ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña'}
            </label>
            <input type="password" autoComplete="new-password" minLength={8} value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className={inputUI} />
            {!editando && (
              <p className="text-xs text-muted-foreground mt-1.5">
                Mínimo 8 caracteres. Si la dejás vacía, el usuario recibe un correo con un enlace para
                definirla él mismo.
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Rol *</label>
            <select value={form.rol} onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value }))}
              className={inputUI}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {form.rol === 'DOCTOR' && (
            <div>
              <label htmlFor="usuario-doctor" className="block text-sm font-medium text-foreground mb-1.5">
                Doctor asociado
              </label>
              <select id="usuario-doctor" value={form.doctorId}
                onChange={(e) => setForm((f) => ({ ...f, doctorId: e.target.value }))}
                className={inputUI}>
                <option value="">Sin asociar</option>
                {doctoresElegibles.map((d) => (
                  <option key={d.id} value={d.id}>{d.nombre}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1.5">
                Al loguearse vera y editara solo su agenda y su calendario de atención.
              </p>
            </div>
          )}
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
