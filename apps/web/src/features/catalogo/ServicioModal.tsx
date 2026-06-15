import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Stethoscope } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn } from '../../lib/utils'
import { btnPrimaryUI, btnOutlineUI, errorUI } from '../../lib/ui'
import { ModalHeader } from '../../components/shared/ModalHeader'
import { FloatingInput } from '../../components/shared/FloatingInput'

interface Servicio {
  id?: number
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm modal-fade p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-md">
        <ModalHeader
          icon={Stethoscope}
          title={editando ? 'Editar servicio' : 'Nuevo servicio'}
          onClose={onClose}
        />
        <form
          onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate(form) }}
          className="p-6 sm:p-7 space-y-5"
        >
          <FloatingInput
            label="Nombre"
            required
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
          />
          <FloatingInput
            label="Descripción"
            value={form.descripcion}
            onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-4">
            <FloatingInput
              label="Duración (min)"
              required
              type="number"
              min={5}
              step={5}
              value={form.duracionMin}
              onChange={(e) => setForm((f) => ({ ...f, duracionMin: Number(e.target.value) }))}
              className="tabular-nums"
            />
            <FloatingInput
              label="Precio base"
              required
              type="number"
              min={0}
              step={0.01}
              value={form.precioBase}
              onChange={(e) => setForm((f) => ({ ...f, precioBase: Number(e.target.value) }))}
              className="tabular-nums"
            />
          </div>
          {editando && (
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" checked={form.activo}
                onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
                className="rounded" />
              Servicio activo
            </label>
          )}
          {error && (
            <p role="alert" className={errorUI}>
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className={cn(btnOutlineUI, 'flex-1')}>
              Cancelar
            </button>
            <button type="submit" disabled={mutation.isPending} className={cn(btnPrimaryUI, 'flex-1')}>
              {mutation.isPending ? 'Guardando...' : editando ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
