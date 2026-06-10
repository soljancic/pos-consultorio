import { MessageCircle, DollarSign, ChevronRight, Stethoscope } from 'lucide-react'
import { EstadoCita, COLORES_ESTADO, TRANSICIONES_VALIDAS, type Cita } from '@pos/types'
import { formatHora, formatMoneda, buildWhatsAppUrl } from '../../lib/utils'
import { useAuthStore } from '../../stores/auth.store'

const ESTADOS_CON_ATENCION = [
  EstadoCita.EN_ATENCION,
  EstadoCita.ATENDIDA,
  EstadoCita.COBRADO,
  EstadoCita.CON_DEUDA,
]

const LABEL_ESTADO: Record<EstadoCita, string> = {
  [EstadoCita.PENDIENTE]: 'Pendiente',
  [EstadoCita.CONFIRMADA]: 'Confirmada',
  [EstadoCita.LLEGO]: 'Llego',
  [EstadoCita.EN_ATENCION]: 'En atencion',
  [EstadoCita.ATENDIDA]: 'Atendida',
  [EstadoCita.COBRADO]: 'Cobrado',
  [EstadoCita.CON_DEUDA]: 'Con deuda',
  [EstadoCita.CANCELADA]: 'Cancelada',
  [EstadoCita.NO_ASISTIO]: 'No asistio',
  [EstadoCita.REPROGRAMADA]: 'Reprogramada',
}

interface CitaCardProps {
  cita: Cita
  onCambiarEstado: (estado: EstadoCita) => void
  onCobrar: () => void
  onAtencion: () => void
}

export function CitaCard({ cita, onCambiarEstado, onCobrar, onAtencion }: CitaCardProps) {
  const user = useAuthStore((s) => s.user)
  const color = COLORES_ESTADO[cita.estado]
  const transicionesDisponibles = TRANSICIONES_VALIDAS[cita.estado]
  const tieneSaldo = cita.cobro && Number(cita.cobro.saldoPendiente) > 0

  // Registrar (EN_ATENCION) es del doctor/admin; consultar (estados posteriores) es de todos
  const muestraAtencion =
    ESTADOS_CON_ATENCION.includes(cita.estado) &&
    (cita.estado !== EstadoCita.EN_ATENCION || user?.rol === 'DOCTOR' || user?.rol === 'ADMIN')

  const proximaTransicion = transicionesDisponibles.find(
    (t) => t !== EstadoCita.CANCELADA && t !== EstadoCita.NO_ASISTIO,
  )

  function handleWhatsApp() {
    if (!cita.paciente?.whatsapp) return
    const msg = `Hola ${cita.paciente.nombre}, le recordamos su cita el dia de hoy a las ${formatHora(cita.fechaHora)}.`
    window.open(buildWhatsAppUrl(cita.paciente.whatsapp, msg), '_blank')
  }

  return (
    <div
      className="bg-white rounded-lg border shadow-sm p-4 flex items-start gap-3"
      style={{ borderLeftWidth: 4, borderLeftColor: color }}
    >
      {/* Hora */}
      <div className="text-center min-w-[48px]">
        <div className="text-lg font-bold text-slate-800">{formatHora(cita.fechaHora)}</div>
        <div className="text-xs text-slate-400">{cita.duracionMin}min</div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-800 truncate">
            {cita.paciente?.apellido}, {cita.paciente?.nombre}
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium text-white shrink-0"
            style={{ backgroundColor: color }}
          >
            {LABEL_ESTADO[cita.estado]}
          </span>
        </div>
        <div className="text-sm text-slate-500 mt-0.5">
          {cita.servicio?.nombre} &bull; {cita.doctor?.nombre}
        </div>
        {tieneSaldo && (
          <div className="text-xs text-red-600 font-medium mt-1">
            Deuda: {formatMoneda(Number(cita.cobro?.saldoPendiente))}
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-1 shrink-0">
        {cita.paciente?.whatsapp && (
          <button
            onClick={handleWhatsApp}
            className="p-2 rounded hover:bg-green-50 text-green-600"
            title="Enviar WhatsApp"
          >
            <MessageCircle className="h-4 w-4" />
          </button>
        )}

        {muestraAtencion && (
          <button
            onClick={onAtencion}
            className="p-2 rounded hover:bg-violet-50 text-violet-600"
            title="Atencion"
          >
            <Stethoscope className="h-4 w-4" />
          </button>
        )}

        {(cita.estado === EstadoCita.ATENDIDA || cita.estado === EstadoCita.CON_DEUDA) && (
          <button
            onClick={onCobrar}
            className="p-2 rounded hover:bg-blue-50 text-blue-600"
            title="Cobrar"
          >
            <DollarSign className="h-4 w-4" />
          </button>
        )}

        {proximaTransicion && (
          <button
            onClick={() => onCambiarEstado(proximaTransicion)}
            className="flex items-center gap-1 text-xs bg-slate-100 hover:bg-slate-200 px-2 py-1.5 rounded text-slate-700"
          >
            {LABEL_ESTADO[proximaTransicion]}
            <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  )
}
