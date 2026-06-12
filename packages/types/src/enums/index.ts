export enum Rol {
  ADMIN = 'ADMIN',
  SECRETARIA = 'SECRETARIA',
  DOCTOR = 'DOCTOR',
  CAJA = 'CAJA',
}

export enum EstadoCita {
  PENDIENTE = 'PENDIENTE',
  CONFIRMADA = 'CONFIRMADA',
  LLEGO = 'LLEGO',
  EN_ATENCION = 'EN_ATENCION',
  ATENDIDA = 'ATENDIDA',
  COBRADO = 'COBRADO',
  CON_DEUDA = 'CON_DEUDA',
  CANCELADA = 'CANCELADA',
  NO_ASISTIO = 'NO_ASISTIO',
  REPROGRAMADA = 'REPROGRAMADA',
}

// Como entro la cita al sistema (E2.5b): el portal publico marca PORTAL
export enum OrigenCita {
  INTERNO = 'INTERNO',
  PORTAL = 'PORTAL',
}

export enum EstadoCobro {
  PENDIENTE = 'PENDIENTE',
  PARCIAL = 'PARCIAL',
  COMPLETO = 'COMPLETO',
  // Cita cancelada o no asistida sin pagos: el cobro no es deuda ni cuenta abierta
  ANULADO = 'ANULADO',
}

// QR cubre tambien transferencias (mismo canal en la practica); VALES para
// ordenes de empresas/obras sociales
export enum FormaPago {
  EFECTIVO = 'EFECTIVO',
  QR = 'QR',
  TARJETA = 'TARJETA',
  VALES = 'VALES',
}

// Calendario de Atencion (E2.5a): tipo de bloque del horario del doctor.
// Solo DISPONIBLE acepta citas; el resto son bloqueos.
export enum TipoDisponibilidad {
  DISPONIBLE = 'DISPONIBLE',
  VACACIONES = 'VACACIONES',
  AUSENCIA = 'AUSENCIA',
  CAPACITACION = 'CAPACITACION',
  REUNION = 'REUNION',
  BLOQUEADO = 'BLOQUEADO',
}

// Gastos administrativos (E2-M8)
export enum CategoriaGasto {
  INSUMOS = 'INSUMOS',
  SUELDOS = 'SUELDOS',
  ALQUILER = 'ALQUILER',
  SERVICIOS = 'SERVICIOS',
  IMPUESTOS = 'IMPUESTOS',
  OTROS = 'OTROS',
}

// De donde sale el dinero: solo CAJA_EFECTIVO impacta el arqueo
export enum CuentaGasto {
  CAJA_EFECTIVO = 'CAJA_EFECTIVO',
  BANCO = 'BANCO',
  OTRO = 'OTRO',
}

// Cola de mensajes pendientes (E3 item 41a, canal manual asistido):
// el sistema encola, el staff envia con wa.me y marca el resultado
export enum TipoMensaje {
  RECORDATORIO = 'RECORDATORIO',
  DEUDA = 'DEUDA',
}

export enum EstadoMensaje {
  PENDIENTE = 'PENDIENTE',
  ENVIADO = 'ENVIADO',
  OMITIDO = 'OMITIDO',
}

export enum AccionLog {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  STATE_CHANGE = 'STATE_CHANGE',
  PAYMENT = 'PAYMENT',
}

// Colores de agenda por estado — fuente unica de verdad
export const COLORES_ESTADO: Record<EstadoCita, string> = {
  [EstadoCita.PENDIENTE]: '#94A3B8',    // slate-400
  [EstadoCita.CONFIRMADA]: '#60A5FA',   // blue-400
  [EstadoCita.LLEGO]: '#34D399',        // emerald-400
  [EstadoCita.EN_ATENCION]: '#FBBF24',  // amber-400
  [EstadoCita.ATENDIDA]: '#A78BFA',     // violet-400
  [EstadoCita.COBRADO]: '#4ADE80',      // green-400
  [EstadoCita.CON_DEUDA]: '#F87171',    // red-400
  [EstadoCita.CANCELADA]: '#9CA3AF',    // gray-400
  [EstadoCita.NO_ASISTIO]: '#6B7280',   // gray-500
  [EstadoCita.REPROGRAMADA]: '#C084FC', // purple-400
}

// Maquina de estados: transiciones validas por estado
export const TRANSICIONES_VALIDAS: Record<EstadoCita, EstadoCita[]> = {
  [EstadoCita.PENDIENTE]: [EstadoCita.CONFIRMADA, EstadoCita.CANCELADA, EstadoCita.NO_ASISTIO],
  [EstadoCita.CONFIRMADA]: [EstadoCita.LLEGO, EstadoCita.CANCELADA, EstadoCita.NO_ASISTIO],
  [EstadoCita.LLEGO]: [EstadoCita.EN_ATENCION, EstadoCita.CANCELADA],
  [EstadoCita.EN_ATENCION]: [EstadoCita.ATENDIDA],
  [EstadoCita.ATENDIDA]: [EstadoCita.COBRADO, EstadoCita.CON_DEUDA],
  [EstadoCita.COBRADO]: [],
  [EstadoCita.CON_DEUDA]: [EstadoCita.COBRADO],
  [EstadoCita.CANCELADA]: [EstadoCita.PENDIENTE],
  [EstadoCita.NO_ASISTIO]: [EstadoCita.PENDIENTE],
  [EstadoCita.REPROGRAMADA]: [EstadoCita.PENDIENTE],
}

export function transicionValida(desde: string, hacia: string): boolean {
  const transiciones = TRANSICIONES_VALIDAS[desde as EstadoCita]
  if (!transiciones) return false
  return transiciones.includes(hacia as EstadoCita)
}
