import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatMoneda, formatDia, cn } from '../../lib/utils'
import { btnPrimaryUI, btnOutlineUI } from '../../lib/ui'
import { toast } from '../../stores/toast.store'
import { ModalHeader } from '../../components/shared/ModalHeader'
import { FloatingInput } from '../../components/shared/FloatingInput'

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

  const revisar = useMutation({
    mutationFn: () => api.put(`/caja/${caja.id}/revisar`, { nota: nota || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja-historial'] })
      qc.invalidateQueries({ queryKey: ['caja-hoy'] })
      onClose()
    },
    onError: (err: any) => {
      toast.fromError(err, 'Error al revisar')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-xs modal-fade p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-md">
        <ModalHeader
          icon={ShieldCheck}
          title={`Revisar cierre del ${formatDia(caja.fecha)}`}
          onClose={onClose}
        />

        <div className="p-6 sm:p-7 space-y-5">
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

          <FloatingInput
            id="revision-nota"
            label="Nota de revisión (opcional)"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
          />

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className={cn(btnOutlineUI, 'flex-1')}>
              Volver
            </button>
            <button
              type="button"
              onClick={() => revisar.mutate()}
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
