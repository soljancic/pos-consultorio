import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Lock, EyeOff, CheckCircle2, AlertTriangle } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatMoneda, cn } from '../../lib/utils'
import { inputUI, textareaUI, btnPrimaryUI, btnOutlineUI, errorUI } from '../../lib/ui'
import { ModalHeader } from '../../components/shared/ModalHeader'

interface Props {
  onClose: () => void
}

type Resultado = {
  montoDeclarado: string
  montoEsperado: string
  diferencia: string
  revisadaAt: string | null
}

// Cierre con arqueo ciego (E2-M2): la secretaria cuenta el efectivo y lo
// declara SIN ver el esperado; recien despues se muestra la diferencia.
export function CerrarCajaModal({ onClose }: Props) {
  const qc = useQueryClient()
  const [monto, setMonto] = useState('')
  const [notas, setNotas] = useState('')
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [error, setError] = useState('')

  const cerrar = useMutation({
    mutationFn: () =>
      api.post('/caja/cerrar', {
        montoDeclarado: parseFloat(monto),
        notasCierre: notas || undefined,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['caja-hoy'] })
      qc.invalidateQueries({ queryKey: ['caja-historial'] })
      qc.invalidateQueries({ queryKey: ['caja-estado'] }) // chip global del shell
      setResultado(res.data)
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al cerrar la caja')
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    cerrar.mutate()
  }

  const diferencia = resultado ? Number(resultado.diferencia) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm modal-fade p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-md">
        <ModalHeader icon={Lock} title="Cerrar caja" onClose={onClose} />

        {!resultado ? (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <p className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2.5">
              <EyeOff className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              Arqueo ciego: conta el efectivo fisico de la caja y declara el total. El sistema
              no muestra el monto esperado hasta despues de cerrar.
            </p>

            <div>
              <label htmlFor="cierre-monto" className="block text-sm font-medium text-foreground mb-1.5">
                Efectivo contado *
              </label>
              <input
                id="cierre-monto"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0.00"
                className={inputUI}
                autoFocus
                required
              />
            </div>

            <div>
              <label htmlFor="cierre-notas" className="block text-sm font-medium text-foreground mb-1.5">
                Notas <span className="text-muted-foreground/70 font-normal">(opcional)</span>
              </label>
              <textarea
                id="cierre-notas"
                rows={2}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Observaciones del cierre..."
                className={textareaUI}
              />
            </div>

            {error && (
              <p role="alert" className={errorUI}>
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className={cn(btnOutlineUI, 'flex-1')}>
                Volver
              </button>
              <button type="submit" disabled={cerrar.isPending || monto === ''} className={cn(btnPrimaryUI, 'flex-1')}>
                {cerrar.isPending ? 'Cerrando...' : 'Cerrar caja'}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-6 space-y-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Efectivo declarado</span>
                <span className="font-medium tabular-nums">{formatMoneda(Number(resultado.montoDeclarado))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Efectivo esperado</span>
                <span className="font-medium tabular-nums">{formatMoneda(Number(resultado.montoEsperado))}</span>
              </div>
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Diferencia</span>
                <span className={cn('tabular-nums', diferencia === 0 ? 'text-accent' : 'text-destructive')}>
                  {formatMoneda(diferencia)}
                </span>
              </div>
            </div>

            {diferencia === 0 ? (
              <p className="flex items-center gap-2 text-sm font-medium text-accent bg-accent/10 rounded-md px-3 py-2.5">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                Caja cuadrada: cierre aprobado automaticamente.
              </p>
            ) : (
              <p className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400 bg-amber-500/15 rounded-md px-3 py-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                Hay diferencia: el cierre queda pendiente de revisión del administrador.
              </p>
            )}

            <button onClick={onClose} className={cn(btnPrimaryUI, 'w-full')}>
              Entendido
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
