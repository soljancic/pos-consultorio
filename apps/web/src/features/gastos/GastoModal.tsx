import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { X, AlertCircle } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn } from '../../lib/utils'
import { inputUI, btnPrimaryUI, btnOutlineUI, btnIconUI, errorUI } from '../../lib/ui'

interface TipoGasto { id: number; nombre: string }
interface TipoCuenta { id: number; nombre: string; esEfectivo: boolean }

export interface GastoEditable {
  id: number
  fecha: string
  tipoGastoId: number
  monto: string | number
  descripcion: string
  personal: string | null
  tipoCuentaId: number
}

interface Props {
  gasto?: GastoEditable | null
  onClose: () => void
}

export function GastoModal({ gasto, onClose }: Props) {
  const qc = useQueryClient()
  const editando = !!gasto?.id
  const [error, setError] = useState('')

  const { data: tiposGasto = [] } = useQuery<TipoGasto[]>({
    queryKey: ['tipos-gasto', 'activos'],
    queryFn: () => api.get('/tipos-gasto/activos').then((r) => r.data),
  })
  const { data: tiposCuenta = [] } = useQuery<TipoCuenta[]>({
    queryKey: ['tipos-cuenta', 'activos'],
    queryFn: () => api.get('/tipos-cuenta/activos').then((r) => r.data),
  })

  const [form, setForm] = useState({
    fecha: gasto ? gasto.fecha.slice(0, 10) : format(new Date(), 'yyyy-MM-dd'),
    tipoGastoId: gasto?.tipoGastoId ?? 0,
    monto: gasto ? String(Number(gasto.monto)) : '',
    descripcion: gasto?.descripcion ?? '',
    personal: gasto?.personal ?? '',
    tipoCuentaId: gasto?.tipoCuentaId ?? 0,
  })

  // En alta, default al primer tipo de gasto y a la cuenta de efectivo (o la primera)
  useEffect(() => {
    if (form.tipoGastoId === 0 && tiposGasto.length > 0) {
      setForm((f) => ({ ...f, tipoGastoId: tiposGasto[0].id }))
    }
  }, [tiposGasto, form.tipoGastoId])
  useEffect(() => {
    if (form.tipoCuentaId === 0 && tiposCuenta.length > 0) {
      const efectivo = tiposCuenta.find((c) => c.esEfectivo)
      setForm((f) => ({ ...f, tipoCuentaId: (efectivo ?? tiposCuenta[0]).id }))
    }
  }, [tiposCuenta, form.tipoCuentaId])

  const sinTipos = tiposGasto.length === 0 || tiposCuenta.length === 0
  const cuentaSel = tiposCuenta.find((c) => c.id === form.tipoCuentaId)

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        fecha: form.fecha,
        tipoGastoId: form.tipoGastoId,
        monto: parseFloat(form.monto),
        descripcion: form.descripcion,
        personal: form.personal || undefined,
        tipoCuentaId: form.tipoCuentaId,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm modal-fade p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-md">
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
          {sinTipos && (
            <p role="alert" className={errorUI}>
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              Configure tipos de gasto y de cuenta en Catálogo antes de registrar.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="gasto-fecha" className="block text-sm font-medium text-foreground mb-1.5">Fecha *</label>
              <input id="gasto-fecha" type="date" required value={form.fecha}
                onChange={(e) => set('fecha', e.target.value)} className={inputUI} />
            </div>
            <div>
              <label htmlFor="gasto-categoria" className="block text-sm font-medium text-foreground mb-1.5">Tipo de gasto *</label>
              <select id="gasto-categoria" value={form.tipoGastoId}
                onChange={(e) => set('tipoGastoId', Number(e.target.value))}
                className={inputUI}>
                {tiposGasto.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="gasto-monto" className="block text-sm font-medium text-foreground mb-1.5">Monto *</label>
              <input id="gasto-monto" type="number" inputMode="decimal" required min={0.01} step="0.01"
                value={form.monto} onChange={(e) => set('monto', e.target.value)}
                placeholder="0.00" className={inputUI} />
            </div>
            <div>
              <label htmlFor="gasto-cuenta" className="block text-sm font-medium text-foreground mb-1.5">Cuenta *</label>
              <select id="gasto-cuenta" value={form.tipoCuentaId}
                onChange={(e) => set('tipoCuentaId', Number(e.target.value))}
                className={inputUI}>
                {tiposCuenta.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          {cuentaSel?.esEfectivo && (
            <p className="text-xs text-muted-foreground">
              Los gastos en efectivo descuentan del arqueo de la caja del día.
            </p>
          )}

          <div>
            <label htmlFor="gasto-descripcion" className="block text-sm font-medium text-foreground mb-1.5">Descripción *</label>
            <input id="gasto-descripcion" required value={form.descripcion}
              onChange={(e) => set('descripcion', e.target.value)}
              placeholder="Ej: compra de guantes y gasas" className={inputUI} />
          </div>

          <div>
            <label htmlFor="gasto-personal" className="block text-sm font-medium text-foreground mb-1.5">
              Personal / beneficiario <span className="text-muted-foreground/70 font-normal">(opcional)</span>
            </label>
            <input id="gasto-personal" value={form.personal} onChange={(e) => set('personal', e.target.value)}
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
            <button type="submit" disabled={mutation.isPending || sinTipos} className={cn(btnPrimaryUI, 'flex-1')}>
              {mutation.isPending ? 'Guardando...' : editando ? 'Guardar' : 'Registrar gasto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
