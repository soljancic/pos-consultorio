import { CalendarDays } from 'lucide-react'
import type { Cita, EstadoCita } from '@pos/types'
import { formatFecha } from '../../lib/utils'
import { ModalHeader } from '../../components/shared/ModalHeader'
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
    <div className="fixed inset-0 bg-slate-950/55 backdrop-blur-sm modal-fade flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-lg">
        <ModalHeader
          icon={CalendarDays}
          title={formatFecha(cita.fechaHora, "EEEE d 'de' MMMM")}
          onClose={onClose}
        />
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
