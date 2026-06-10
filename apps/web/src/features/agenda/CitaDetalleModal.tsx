import { X } from 'lucide-react'
import type { Cita, EstadoCita } from '@pos/types'
import { formatFecha } from '../../lib/utils'
import { CitaCard } from './CitaCard'

// Detalle de una cita desde las vistas de grilla: reutiliza la CitaCard
// con todas sus acciones (estados, cobrar, atencion, WhatsApp).

interface Props {
  cita: Cita
  onCambiarEstado: (estado: EstadoCita) => void
  onCobrar: () => void
  onAtencion: () => void
  onClose: () => void
}

export function CitaDetalleModal({ cita, onCambiarEstado, onCobrar, onAtencion, onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-foreground capitalize">
            {formatFecha(cita.fechaHora, "EEEE d 'de' MMMM")}
          </h2>
          <button onClick={onClose} aria-label="Cerrar" className="p-1 rounded hover:bg-muted cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4">
          <CitaCard
            cita={cita}
            onCambiarEstado={onCambiarEstado}
            onCobrar={onCobrar}
            onAtencion={onAtencion}
          />
        </div>
      </div>
    </div>
  )
}
