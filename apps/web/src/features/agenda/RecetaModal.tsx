import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, FileSignature } from 'lucide-react'
import type { Cita } from '@pos/types'
import { api } from '../../lib/api-client'
import { formatHora, cn } from '../../lib/utils'
import { btnPrimaryUI, btnOutlineUI, errorUI } from '../../lib/ui'
import { toast } from '../../stores/toast.store'
import { ModalHeader } from '../../components/shared/ModalHeader'
import { FloatingTextarea } from '../../components/shared/FloatingTextarea'

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
      if (err.response) {
        toast.fromError(err, 'Error al emitir la receta')
      } else {
        setError(err.message ?? 'Error al emitir la receta')
      }
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-xs modal-fade p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-md max-h-[90vh] overflow-y-auto">
        <ModalHeader
          icon={FileSignature}
          title="Nueva receta"
          subtitle={<>{cita.paciente?.nombre} {cita.paciente?.apellido} &bull; {formatHora(cita.fechaHora)}</>}
          onClose={onClose}
        />

        <div className="p-6 sm:p-7 space-y-5">
          <FloatingTextarea
            id="receta-meds"
            label="Medicamentos (uno por línea)"
            rows={5}
            value={medicamentos}
            onChange={(e) => setMedicamentos(e.target.value)}
            hint="Ej: Ibuprofeno 400 mg, 1 comprimido cada 8 horas por 5 días."
          />
          <FloatingTextarea
            id="receta-ind"
            label="Indicaciones"
            rows={3}
            value={indicaciones}
            onChange={(e) => setIndicaciones(e.target.value)}
          />

          {error && (
            <p role="alert" className={errorUI}>
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
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
