import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, AlertCircle, FileSignature } from 'lucide-react'
import type { Cita } from '@pos/types'
import { api } from '../../lib/api-client'
import { formatHora, cn } from '../../lib/utils'
import { textareaUI, btnPrimaryUI, btnOutlineUI, btnIconUI, errorUI } from '../../lib/ui'

interface Props {
  cita: Cita
  onClose: () => void
}

// Emision de receta (E2-M5): medicamentos uno por linea; el PDF con membrete
// se genera en el server al descargar
export function RecetaModal({ cita, onClose }: Props) {
  const qc = useQueryClient()
  const [medicamentos, setMedicamentos] = useState('')
  const [indicaciones, setIndicaciones] = useState('')
  const [error, setError] = useState('')

  const emitir = useMutation({
    mutationFn: async () => {
      const lineas = medicamentos
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      if (lineas.length === 0) throw new Error('Ingrese al menos un medicamento')
      await api.post(`/atenciones/cita/${cita.id}/recetas`, {
        medicamentos: lineas,
        indicaciones: indicaciones.trim() || undefined,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recetas', cita.id] })
      onClose()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? err.message
      setError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al emitir la receta')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm modal-fade p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-card">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <span className="bg-primary/10 text-primary rounded-md p-1.5">
                <FileSignature className="h-4 w-4" aria-hidden="true" />
              </span>
              Nueva receta
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {cita.paciente?.apellido}, {cita.paciente?.nombre} &bull; {formatHora(cita.fechaHora)}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className={cn(btnIconUI, 'text-muted-foreground hover:bg-muted hover:text-foreground')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label htmlFor="receta-meds" className="block text-sm font-medium text-foreground mb-1.5">
              Medicamentos * <span className="font-normal text-muted-foreground">(uno por línea)</span>
            </label>
            <textarea
              id="receta-meds"
              rows={5}
              value={medicamentos}
              onChange={(e) => setMedicamentos(e.target.value)}
              placeholder={'Ibuprofeno 400 mg, 1 comprimido cada 8 horas por 5 días\nOmeprazol 20 mg, 1 cápsula en ayunas por 7 días'}
              className={textareaUI}
            />
          </div>
          <div>
            <label htmlFor="receta-ind" className="block text-sm font-medium text-foreground mb-1.5">
              Indicaciones
            </label>
            <textarea
              id="receta-ind"
              rows={3}
              value={indicaciones}
              onChange={(e) => setIndicaciones(e.target.value)}
              placeholder="Reposo relativo, abundante líquido..."
              className={textareaUI}
            />
          </div>

          {error && (
            <p role="alert" className={errorUI}>
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className={btnOutlineUI}>
              Cancelar
            </button>
            <button
              type="button"
              disabled={emitir.isPending}
              onClick={() => { setError(''); emitir.mutate() }}
              className={cn(btnPrimaryUI, 'flex-1')}
            >
              {emitir.isPending ? 'Emitiendo...' : 'Emitir receta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
