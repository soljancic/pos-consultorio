import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Tag } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn } from '../../lib/utils'
import { btnPrimaryUI, btnOutlineUI, errorUI } from '../../lib/ui'
import { ModalHeader } from '../../components/shared/ModalHeader'
import { FloatingInput } from '../../components/shared/FloatingInput'

interface TipoGasto {
  id?: number
  nombre: string
  activo: boolean
}

interface Props {
  tipo?: TipoGasto | null
  onClose: () => void
}

export function TipoGastoModal({ tipo, onClose }: Props) {
  const qc = useQueryClient()
  const editando = !!tipo?.id
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    nombre: tipo?.nombre ?? '',
    activo: tipo?.activo ?? true,
  })

  const mutation = useMutation({
    mutationFn: (data: typeof form) => {
      const payload = editando ? { nombre: data.nombre, activo: data.activo } : { nombre: data.nombre }
      return editando
        ? api.put(`/tipos-gasto/${tipo!.id}`, payload)
        : api.post('/tipos-gasto', payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tipos-gasto'] })
      onClose()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al guardar')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm modal-fade p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-sm">
        <ModalHeader
          icon={Tag}
          title={editando ? 'Editar tipo de gasto' : 'Nuevo tipo de gasto'}
          onClose={onClose}
        />
        <form
          onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate(form) }}
          className="p-6 sm:p-7 space-y-5"
        >
          <FloatingInput
            id="tg-nombre"
            label="Nombre"
            required
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
          />
          {editando && (
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" checked={form.activo}
                onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
                className="rounded" />
              Activo
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
