import { CalendarPlus, CalendarX2, CalendarClock, UserCheck, type LucideIcon } from 'lucide-react'
import { TipoNotificacion } from '@pos/types'

export interface Notificacion {
  id: number
  tipo: TipoNotificacion
  titulo: string
  mensaje: string
  citaId: number | null
  citaFecha: string | null // YYYY-MM-DD (dia local de la cita) para el deep-link
  leida: boolean
  createdAt: string
}

// Icono + etiqueta + color del acento por tipo de evento (forma + color, no solo
// color, para accesibilidad).
export const TIPO_META: Record<TipoNotificacion, { icon: LucideIcon; label: string; clase: string }> = {
  [TipoNotificacion.NUEVA_CITA]: { icon: CalendarPlus, label: 'Nueva solicitud', clase: 'text-emerald-600 bg-emerald-500/10' },
  [TipoNotificacion.CITA_CANCELADA]: { icon: CalendarX2, label: 'Cancelada', clase: 'text-red-600 bg-red-500/10' },
  [TipoNotificacion.CITA_REPROGRAMADA]: { icon: CalendarClock, label: 'Reprogramada', clase: 'text-amber-600 bg-amber-500/10' },
  [TipoNotificacion.PACIENTE_EN_ESPERA]: { icon: UserCheck, label: 'En espera', clase: 'text-primary bg-primary/10' },
}
