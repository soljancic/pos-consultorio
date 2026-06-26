import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Landmark } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn } from '../../lib/utils'
import { btnPrimaryUI, btnOutlineUI } from '../../lib/ui'
import { toast } from '../../stores/toast.store'
import { ModalHeader } from '../../components/shared/ModalHeader'
import { FloatingInput } from '../../components/shared/FloatingInput'

interface TipoCuenta {
  id?: number
  nombre: string
  activo: boolean
  esEfectivo: boolean
}

interface Props {
  tipo?: TipoCuenta | null
  onClose: () => void
}

export function TipoCuentaModal({ tipo, onClose }: Props) {
  const qc = useQueryClient()
  const editando = !!tipo?.id
  const [form, setForm] = useState({
    nombre: tipo?.nombre ?? '',
    activo: tipo?.activo ?? true,
    esEfectivo: tipo?.esEfectivo ?? false,
  })

  const mutation = useMutation({
    mutationFn: (data: typeof form) => {
      const payload = editando
        ? { nombre: data.nombre, activo: data.activo, esEfectivo: data.esEfectivo }
        : { nombre: data.nombre, esEfectivo: data.esEfectivo }
      return editando
        ? api.put(`/tipos-cuenta/${tipo!.id}`, payload)
        : api.post('/tipos-cuenta', payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tipos-cuenta'] })
      onClose()
    },
    onError: (err: any) => toast.fromError(err, 'Error al guardar'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm modal-fade p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-sm">
        <ModalHeader
          icon={Landmark}
          title={editando ? 'Editar tipo de cuenta' : 'Nuevo tipo de cuenta'}
          onClose={onClose}
        />
        <form
          onSubmit={(e) => { e.preventDefault(); mutation.mutate(form) }}
          className="p-6 sm:p-7 space-y-5"
        >
          <FloatingInput
            id="tc-nombre"
            label="Nombre"
            required
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
          />
          <label className="flex items-start gap-2 text-sm text-foreground cursor-pointer">
            <input type="checkbox" checked={form.esEfectivo}
              onChange={(e) => setForm((f) => ({ ...f, esEfectivo: e.target.checked }))}
              className="rounded mt-0.5" />
            <span>
              Es cuenta de efectivo
              <span className="block text-xs text-muted-foreground font-normal">
                Participa en el arqueo de caja. Solo una cuenta puede serlo: marcarla desmarca la anterior.
              </span>
            </span>
          </label>
          {editando && (
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input type="checkbox" checked={form.activo}
                onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
                className="rounded" />
              Activo
            </label>
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
