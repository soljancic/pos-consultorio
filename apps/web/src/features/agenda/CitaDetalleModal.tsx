import { X } from 'lucide-react'
import type { Cita, EstadoCita } from '@pos/types'
import { formatFecha, cn } from '../../lib/utils'
import { btnIconUI } from '../../lib/ui'
import { CitaCard } from './CitaCard'

// Detalle de una cita desde las vistas de grilla: reutiliza la CitaCard
// con todas sus acciones (estados, cobrar, atencion, WhatsApp).

interface Props {
  cita: Cita
  onCambiarEstado: (estado: EstadoCita) => void
  onCobrar: () => void
  onAtencion: () => void
  onReprogramar: () => void
  onCancelar: () => void
  onNoAsistio: () => void
  onClose: () => void
}

export function CitaDetalleModal({ cita, onCambiarEstado, onCobrar, onAtencion, onReprogramar, onCancelar, onNoAsistio, onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl border shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-foreground capitalize">
            {formatFecha(cita.fechaHora, "EEEE d 'de' MMMM")}
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className={cn(btnIconUI, 'text-muted-foreground hover:bg-muted hover:text-foreground')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="p-4">
          <CitaCard
            cita={cita}
            onCambiarEstado={onCambiarEstado}
            onCobrar={onCobrar}
            onAtencion={onAtencion}
            onReprogramar={onReprogramar}
            onCancelar={onCancelar}
            onNoAsistio={onNoAsistio}
          />
        </div>
      </div>
    </div>
  )
}
