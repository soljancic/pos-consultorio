import { useState } from 'react'
import { XCircle } from 'lucide-react'
import { cn } from '../../lib/utils'
import { btnOutlineUI, btnDestructiveUI } from '../../lib/ui'
import { ModalHeader } from '../../components/shared/ModalHeader'
import { FloatingTextarea } from '../../components/shared/FloatingTextarea'

interface Props {
  /** Descripción breve de la liquidación (p. ej. nombre del paciente + aseguradora) */
  descripcion?: string
  pendiente?: boolean
  onConfirm: (motivo: string) => void
  onClose: () => void
}

export function RechazarLiquidacionModal({ descripcion, pendiente, onConfirm, onClose }: Props) {
  const [motivo, setMotivo] = useState('')
  const [tocado, setTocado] = useState(false)

  const motivoVacio = motivo.trim().length === 0
  const mostrarError = tocado && motivoVacio

  function handleConfirmar() {
    setTocado(true)
    if (motivoVacio) return
    onConfirm(motivo.trim())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm modal-fade p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-sm">
        <ModalHeader
          icon={XCircle}
          title="Rechazar liquidación"
          subtitle={descripcion}
          tone="destructive"
          onClose={onClose}
        />

        <div className="p-5 space-y-4">
          <FloatingTextarea
            label="Motivo del rechazo"
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value)
              if (tocado && e.target.value.trim().length > 0) setTocado(false)
            }}
            rows={3}
            aria-required="true"
            error={mostrarError ? 'El motivo es obligatorio' : undefined}
            autoFocus
          />

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={pendiente}
              className={cn(btnOutlineUI, 'flex-1')}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmar}
              disabled={pendiente}
              className={cn(btnDestructiveUI, 'flex-1')}
            >
              {pendiente ? 'Procesando...' : 'Rechazar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
