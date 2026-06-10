import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { api } from '../../lib/api-client'

interface Servicio {
  id?: string
  nombre: string
  descripcion?: string
  duracionMin: number
  precioBase: number
  activo: boolean
}

interface Props {
  servicio?: Servicio | null
  onClose: () => void
}

export function ServicioModal({ servicio, onClose }: Props) {
  const qc = useQueryClient()
  const editando = !!servicio?.id
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    nombre: servicio?.nombre ?? '',
    descripcion: servicio?.descripcion ?? '',
    duracionMin: servicio?.duracionMin ?? 30,
    precioBase: Number(servicio?.precioBase ?? 0),
    activo: servicio?.activo ?? true,
  })

  const mutation = useMutation({
    mutationFn: (data: typeof form) => {
      const payload = {
        nombre: data.nombre,
        descripcion: data.descripcion || undefined,
        duracionMin: data.duracionMin,
        precioBase: data.precioBase,
        ...(editando ? { activo: data.activo } : {}),
      }
      return editando
        ? api.put(`/servicios/${servicio!.id}`, payload)
        : api.post('/servicios', payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['servicios'] })
      onClose()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al guardar')
    },
  })

  const inputClass =
    'w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-foreground">
            {editando ? 'Editar servicio' : 'Nuevo servicio'}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate(form) }}
          className="p-6 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Nombre *</label>
            <input required value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Descripcion</label>
            <input value={form.descripcion}
              onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
              className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Duracion (min) *</label>
              <input required type="number" min={5} step={5} value={form.duracionMin}
                onChange={(e) => setForm((f) => ({ ...f, duracionMin: Number(e.target.value) }))}
                className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Precio base *</label>
              <input required type="number" min={0} step={0.01} value={form.precioBase}
                onChange={(e) => setForm((f) => ({ ...f, precioBase: Number(e.target.value) }))}
                className={inputClass} />
            </div>
          </div>
          {editando && (
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" checked={form.activo}
                onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
                className="rounded" />
              Servicio activo
            </label>
          )}
          {error && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border rounded-md text-sm text-foreground hover:bg-muted/60">
              Cancelar
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="flex-1 px-4 py-2 bg-primary text-white rounded-md text-sm hover:bg-primary/90 disabled:opacity-60">
              {mutation.isPending ? 'Guardando...' : editando ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
