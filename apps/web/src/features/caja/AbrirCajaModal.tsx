import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, AlertCircle, Unlock } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn } from '../../lib/utils'
import { inputUI, textareaUI, btnPrimaryUI, btnOutlineUI, btnIconUI, errorUI } from '../../lib/ui'

interface Props {
  onClose: () => void
}

// Apertura del turno (E2-M9): la jornada arranca declarando la caja chica.
// Sin caja abierta no se puede cobrar ni registrar gastos.
export function AbrirCajaModal({ onClose }: Props) {
  const qc = useQueryClient()
  const [monto, setMonto] = useState('')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState('')

  const abrir = useMutation({
    mutationFn: () =>
      api.post('/caja/abrir', {
        montoInicial: parseFloat(monto),
        notasApertura: notas || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja-hoy'] })
      qc.invalidateQueries({ queryKey: ['caja-historial'] })
      onClose()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al abrir la caja')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-xl border shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <span className="bg-primary/10 text-primary rounded-md p-1.5">
              <Unlock className="h-4 w-4" aria-hidden="true" />
            </span>
            Abrir caja
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
          onSubmit={(e) => { e.preventDefault(); setError(''); abrir.mutate() }}
          className="p-6 space-y-4"
        >
          <p className="text-sm text-muted-foreground">
            Declara con cuanto efectivo arranca la jornada (caja chica). El arqueo del cierre
            lo contempla: inicial + cobros en efectivo − gastos en efectivo.
          </p>

          <div>
            <label htmlFor="abrir-monto" className="block text-sm font-medium text-foreground mb-1.5">
              Monto inicial *
            </label>
            <input
              id="abrir-monto"
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
            <label htmlFor="abrir-notas" className="block text-sm font-medium text-foreground mb-1.5">
              Notas <span className="text-muted-foreground/70 font-normal">(opcional)</span>
            </label>
            <textarea
              id="abrir-notas"
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
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
            <button type="submit" disabled={abrir.isPending || monto === ''} className={cn(btnPrimaryUI, 'flex-1')}>
              {abrir.isPending ? 'Abriendo...' : 'Abrir caja'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
