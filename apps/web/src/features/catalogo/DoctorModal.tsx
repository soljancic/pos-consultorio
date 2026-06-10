import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { api } from '../../lib/api-client'

const COLORES = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

interface Doctor { id?: string; nombre: string; especialidad?: string; colorAgenda: string; activo: boolean }
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

  const inputClass =
    'w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-slate-800">
            {editando ? 'Editar doctor' : 'Nuevo doctor'}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate(form) }}
          className="p-6 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
            <input required value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Especialidad</label>
            <input value={form.especialidad}
              onChange={(e) => setForm((f) => ({ ...f, especialidad: e.target.value }))}
              className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Color en agenda</label>
            <div className="flex gap-2">
              {COLORES.map((c) => (
                <button key={c} type="button"
                  onClick={() => setForm((f) => ({ ...f, colorAgenda: c }))}
                  className={`h-8 w-8 rounded-full border-2 transition-transform ${form.colorAgenda === c ? 'border-slate-800 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          {editando && (
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={form.activo}
                onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
                className="rounded" />
              Doctor activo
            </label>
          )}
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border rounded-md text-sm text-slate-700 hover:bg-slate-50">Cancelar</button>
            <button type="submit" disabled={mutation.isPending}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-60">
              {mutation.isPending ? 'Guardando...' : editando ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
