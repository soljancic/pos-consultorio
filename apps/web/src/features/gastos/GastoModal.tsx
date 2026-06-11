import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { X, AlertCircle } from 'lucide-react'
import { CategoriaGasto, CuentaGasto } from '@pos/types'
import { api } from '../../lib/api-client'
import { cn } from '../../lib/utils'
import { inputUI, btnPrimaryUI, btnOutlineUI, btnIconUI, errorUI } from '../../lib/ui'

export const LABEL_CATEGORIA: Record<CategoriaGasto, string> = {
  [CategoriaGasto.INSUMOS]: 'Insumos',
  [CategoriaGasto.SUELDOS]: 'Sueldos',
  [CategoriaGasto.ALQUILER]: 'Alquiler',
  [CategoriaGasto.SERVICIOS]: 'Servicios',
  [CategoriaGasto.IMPUESTOS]: 'Impuestos',
  [CategoriaGasto.OTROS]: 'Otros',
}

export const LABEL_CUENTA: Record<CuentaGasto, string> = {
  [CuentaGasto.CAJA_EFECTIVO]: 'Caja (efectivo)',
  [CuentaGasto.BANCO]: 'Banco',
  [CuentaGasto.OTRO]: 'Otro',
}

export interface GastoEditable {
  id: number
  fecha: string
  categoria: CategoriaGasto
  monto: string | number
  descripcion: string
  personal: string | null
  cuenta: CuentaGasto
}

interface Props {
  gasto?: GastoEditable | null
  onClose: () => void
}

export function GastoModal({ gasto, onClose }: Props) {
  const qc = useQueryClient()
  const editando = !!gasto?.id
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    fecha: gasto ? gasto.fecha.slice(0, 10) : format(new Date(), 'yyyy-MM-dd'),
    categoria: gasto?.categoria ?? CategoriaGasto.INSUMOS,
    monto: gasto ? String(Number(gasto.monto)) : '',
    descripcion: gasto?.descripcion ?? '',
    personal: gasto?.personal ?? '',
    cuenta: gasto?.cuenta ?? CuentaGasto.CAJA_EFECTIVO,
  })

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        fecha: form.fecha,
        categoria: form.categoria,
        monto: parseFloat(form.monto),
        descripcion: form.descripcion,
        personal: form.personal || undefined,
        cuenta: form.cuenta,
      }
      return editando ? api.put(`/gastos/${gasto!.id}`, payload) : api.post('/gastos', payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gastos'] })
      qc.invalidateQueries({ queryKey: ['gastos-resumen'] })
      qc.invalidateQueries({ queryKey: ['caja-hoy'] })
      onClose()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al guardar')
    },
  })

  function set<K extends keyof typeof form>(campo: K, valor: (typeof form)[K]) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-xl border shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-foreground">
            {editando ? 'Editar gasto' : 'Nuevo gasto'}
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
          onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate() }}
          className="p-6 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Fecha *</label>
              <input type="date" required value={form.fecha}
                onChange={(e) => set('fecha', e.target.value)} className={inputUI} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Monto *</label>
              <input type="number" inputMode="decimal" required min={0.01} step="0.01"
                value={form.monto} onChange={(e) => set('monto', e.target.value)}
                placeholder="0.00" className={inputUI} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Categoria *</label>
              <select value={form.categoria}
                onChange={(e) => set('categoria', e.target.value as CategoriaGasto)}
                className={inputUI}>
                {Object.values(CategoriaGasto).map((c) => (
                  <option key={c} value={c}>{LABEL_CATEGORIA[c]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Cuenta *</label>
              <select value={form.cuenta}
                onChange={(e) => set('cuenta', e.target.value as CuentaGasto)}
                className={inputUI}>
                {Object.values(CuentaGasto).map((c) => (
                  <option key={c} value={c}>{LABEL_CUENTA[c]}</option>
                ))}
              </select>
            </div>
          </div>

          {form.cuenta === CuentaGasto.CAJA_EFECTIVO && (
            <p className="text-xs text-muted-foreground">
              Los gastos en efectivo descuentan del arqueo de la caja del dia.
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Descripcion *</label>
            <input required value={form.descripcion}
              onChange={(e) => set('descripcion', e.target.value)}
              placeholder="Ej: compra de guantes y gasas" className={inputUI} />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Personal / beneficiario <span className="text-muted-foreground/70 font-normal">(opcional)</span>
            </label>
            <input value={form.personal} onChange={(e) => set('personal', e.target.value)}
              placeholder="A quien se le pago" className={inputUI} />
          </div>

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
              {mutation.isPending ? 'Guardando...' : editando ? 'Guardar' : 'Registrar gasto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
