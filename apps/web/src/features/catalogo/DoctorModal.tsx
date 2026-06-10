import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, AlertCircle } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn } from '../../lib/utils'
import { inputUI, btnPrimaryUI, btnOutlineUI, btnIconUI, errorUI } from '../../lib/ui'

const COLORES = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

interface Doctor { id?: number; nombre: string; especialidad?: string; colorAgenda: string; activo: boolean }
interface Props { doctor?: Doctor | null; onClose: () => void }

export function DoctorModal({ doctor, onClose }: Props) {
  const qc = useQueryClient()
  const editando = !!doctor?.id
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    nombre: doctor?.nombre ?? '',
    especialidad: doctor?.especialidad ?? '',
    colorAgenda: doctor?.colorAgenda ?? '#3B82F6',
    activo: doctor?.activo ?? true,
  })

  const mutation = useMutation({
    mutationFn: (data: typeof form) => {
      const payload = {
        nombre: data.nombre,
        especialidad: data.especialidad || undefined,
        colorAgenda: data.colorAgenda,
        ...(editando ? { activo: data.activo } : {}),
      }
      return editando ? api.put(`/doctores/${doctor!.id}`, payload) : api.post('/doctores', payload)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['doctores'] }); onClose() },
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
            {editando ? 'Editar doctor' : 'Nuevo doctor'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className={cn(btnIconUI, 'text-muted-foreground hover:bg-muted hover:text-foreground')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate(form) }}
          className="p-6 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Nombre *</label>
            <input required value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              className={inputUI} />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Especialidad</label>
            <input value={form.especialidad}
              onChange={(e) => setForm((f) => ({ ...f, especialidad: e.target.value }))}
              className={inputUI} />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Color en agenda</label>
            <div className="flex gap-2">
              {COLORES.map((c) => (
                <button key={c} type="button"
                  onClick={() => setForm((f) => ({ ...f, colorAgenda: c }))}
                  aria-label={`Color ${c}`}
                  aria-pressed={form.colorAgenda === c}
                  className={cn(
                    'h-9 w-9 rounded-full border-2 cursor-pointer transition-transform duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60',
                    form.colorAgenda === c ? 'border-foreground scale-110' : 'border-transparent',
                  )}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          {editando && (
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" checked={form.activo}
                onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
                className="rounded" />
              Doctor activo
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
              {mutation.isPending ? 'Guardando...' : editando ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
