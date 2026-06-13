import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, AlertCircle } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn } from '../../lib/utils'
import { inputUI, btnPrimaryUI, btnOutlineUI, btnIconUI, errorUI } from '../../lib/ui'

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
  const [error, setError] = useState('')
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
    onError: (err: any) => {
      const msg = err.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al guardar')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm modal-fade p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-foreground">
            {editando ? 'Editar tipo de cuenta' : 'Nuevo tipo de cuenta'}
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
            <label htmlFor="tc-nombre" className="block text-sm font-medium text-foreground mb-1.5">Nombre *</label>
            <input id="tc-nombre" required value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              placeholder="Ej: Mercado Pago" className={inputUI} />
          </div>
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
          {error && (
            <p role="alert" className={errorUI}>
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
          <div className="flex gap-3 pt-2">
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
