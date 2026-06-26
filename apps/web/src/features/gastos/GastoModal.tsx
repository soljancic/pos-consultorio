import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { AlertCircle, Receipt, Calendar, Tag, Wallet, FileText, User } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn, simboloMoneda } from '../../lib/utils'
import { btnPrimaryUI, btnOutlineUI, errorUI } from '../../lib/ui'
import { ModalHeader } from '../../components/shared/ModalHeader'
import { FloatingInput } from '../../components/shared/FloatingInput'
import { FloatingSelect } from '../../components/shared/FloatingSelect'
import { toast } from '../../stores/toast.store'

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
  const [errores, setErrores] = useState<{ monto?: string; descripcion?: string }>({})

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
        descripcion: form.descripcion.trim(),
        personal: form.personal.trim() || undefined,
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
      toast.fromError(err, 'Error al guardar')
    },
  })

  function set<K extends keyof typeof form>(campo: K, valor: (typeof form)[K]) {
    setForm((f) => ({ ...f, [campo]: valor }))
    if (campo === 'monto' || campo === 'descripcion') {
      setErrores((e) => ({ ...e, [campo]: undefined }))
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs: typeof errores = {}
    const montoNum = parseFloat(form.monto)
    if (!form.monto || isNaN(montoNum) || montoNum <= 0) errs.monto = 'Ingresá un monto mayor a 0.'
    if (!form.descripcion.trim()) errs.descripcion = 'Agregá una descripción.'
    setErrores(errs)
    if (Object.keys(errs).length > 0) return
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm modal-fade p-4">
      <div className="bg-card rounded-2xl border shadow-xl ring-1 ring-black/5 modal-pop w-full max-w-md">
        <ModalHeader
          icon={Receipt}
          title={editando ? 'Editar gasto' : 'Nuevo gasto'}
          onClose={onClose}
        />

        <form onSubmit={handleSubmit} className="p-6 sm:p-7 space-y-5">
          {sinTipos && (
            <p role="alert" className={errorUI}>
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              Configurá tipos de gasto y de cuenta en Catálogo antes de registrar.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FloatingInput
              id="gasto-fecha"
              type="date"
              label="Fecha"
              Icon={Calendar}
              alwaysFloat
              value={form.fecha}
              onChange={(e) => set('fecha', e.target.value)}
            />
            <FloatingSelect
              id="gasto-categoria"
              label="Tipo de gasto"
              Icon={Tag}
              value={form.tipoGastoId}
              onChange={(e) => set('tipoGastoId', Number(e.target.value))}
            >
              {tiposGasto.map((t) => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </FloatingSelect>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FloatingInput
              id="gasto-monto"
              type="number"
              inputMode="decimal"
              label="Monto"
              leftSlot={
                <span className="text-sm font-semibold text-primary/70 leading-none">
                  {simboloMoneda()}
                </span>
              }
              min={0.01}
              step="0.01"
              value={form.monto}
              onChange={(e) => set('monto', e.target.value)}
              className="tabular-nums"
              error={errores.monto}
            />
            <FloatingSelect
              id="gasto-cuenta"
              label="Cuenta"
              Icon={Wallet}
              value={form.tipoCuentaId}
              onChange={(e) => set('tipoCuentaId', Number(e.target.value))}
            >
              {tiposCuenta.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </FloatingSelect>
          </div>

          {cuentaSel?.esEfectivo && (
            <p className="text-xs text-muted-foreground -mt-1">
              Los gastos en efectivo descuentan del arqueo de la caja del día.
            </p>
          )}

          <FloatingInput
            id="gasto-descripcion"
            label="Descripción"
            Icon={FileText}
            value={form.descripcion}
            onChange={(e) => set('descripcion', e.target.value)}
            error={errores.descripcion}
          />

          <FloatingInput
            id="gasto-personal"
            label="Pagado a (opcional)"
            Icon={User}
            value={form.personal}
            onChange={(e) => set('personal', e.target.value)}
          />

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className={cn(btnOutlineUI, 'flex-1')}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || sinTipos}
              className={cn(btnPrimaryUI, 'flex-1')}
            >
              {mutation.isPending ? 'Guardando...' : editando ? 'Guardar cambios' : 'Guardar gasto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
