import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, AlertCircle, ShieldCheck } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatMoneda, formatDia, cn } from '../../lib/utils'
import { inputUI, btnPrimaryUI, btnOutlineUI, btnIconUI, errorUI } from '../../lib/ui'

export interface CajaRevisable {
  id: number
  fecha: string
  montoDeclarado: string | null
  montoEsperado: string | null
  diferencia: string | null
  notasCierre: string | null
}

interface Props {
  caja: CajaRevisable
  onClose: () => void
}

// Revision del ADMIN de un cierre con diferencia (E2-M2)
export function RevisarCajaModal({ caja, onClose }: Props) {
  const qc = useQueryClient()
  const [nota, setNota] = useState('')
  const [error, setError] = useState('')

  const revisar = useMutation({
    mutationFn: () => api.put(`/caja/${caja.id}/revisar`, { nota: nota || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja-historial'] })
      qc.invalidateQueries({ queryKey: ['caja-hoy'] })
      onClose()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al revisar')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-xl border shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <span className="bg-primary/10 text-primary rounded-md p-1.5">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            </span>
            Revisar cierre del {formatDia(caja.fecha)}
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className={cn(btnIconUI, 'text-muted-foreground hover:bg-muted hover:text-foreground')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Declarado</span>
              <span className="font-medium tabular-nums">{formatMoneda(Number(caja.montoDeclarado ?? 0))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Esperado</span>
              <span className="font-medium tabular-nums">{formatMoneda(Number(caja.montoEsperado ?? 0))}</span>
            </div>
            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>Diferencia</span>
              <span className="text-destructive tabular-nums">{formatMoneda(Number(caja.diferencia ?? 0))}</span>
            </div>
            {caja.notasCierre && (
              <p className="text-muted-foreground pt-1">
                <span className="font-medium">Notas del cierre:</span> {caja.notasCierre}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="revision-nota" className="block text-sm font-medium text-foreground mb-1.5">
              Nota de revisión <span className="text-muted-foreground/70 font-normal">(opcional)</span>
            </label>
            <input
              id="revision-nota"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ej: faltante justificado, se repuso"
              className={inputUI}
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
            <button
              type="button"
              onClick={() => { setError(''); revisar.mutate() }}
              disabled={revisar.isPending}
              className={cn(btnPrimaryUI, 'flex-1')}
            >
              {revisar.isPending ? 'Guardando...' : 'Aprobar revision'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
