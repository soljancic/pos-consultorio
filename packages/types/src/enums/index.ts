export enum Rol {
  ADMIN = 'ADMIN',
  SECRETARIA = 'SECRETARIA',
  DOCTOR = 'DOCTOR',
  CAJA = 'CAJA',
}

export enum EstadoCita {
  // Reserva del portal sin revisar: la secretaria valida los datos y la
  // pasa a PENDIENTE (o la cancela). Las citas manuales nacen PENDIENTE.
  SOLICITADA = 'SOLICITADA',
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

// Centro de notificaciones: tipo de evento que genero la notificacion.
export enum TipoNotificacion {
  NUEVA_CITA = 'NUEVA_CITA',
  CITA_CANCELADA = 'CITA_CANCELADA',
  CITA_REPROGRAMADA = 'CITA_REPROGRAMADA',
  PACIENTE_EN_ESPERA = 'PACIENTE_EN_ESPERA',
}

export enum AccionLog {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  STATE_CHANGE = 'STATE_CHANGE',
  PAYMENT = 'PAYMENT',
}

// Aseguradoras (F2): estado del item de liquidacion a cobrar a la aseguradora
export enum EstadoLiquidacion {
  PENDIENTE = 'PENDIENTE',
  FACTURADO = 'FACTURADO',
  PAGADO = 'PAGADO',
  RECHAZADO = 'RECHAZADO',
}

// Colores de agenda por estado — fuente unica de verdad
export const COLORES_ESTADO: Record<EstadoCita, string> = {
  [EstadoCita.SOLICITADA]: '#FB923C',   // naranja
  [EstadoCita.PENDIENTE]: '#94A3B8',    // gris
  [EstadoCita.CONFIRMADA]: '#60A5FA',   // azul
  [EstadoCita.LLEGO]: '#2DD4BF',        // teal
  [EstadoCita.EN_ATENCION]: '#FBBF24',  // amarillo
  [EstadoCita.ATENDIDA]: '#A78BFA',     // violeta
  [EstadoCita.COBRADO]: '#22C55E',      // verde fuerte
  [EstadoCita.CON_DEUDA]: '#EF4444',    // rojo
  [EstadoCita.CANCELADA]: '#9CA3AF',    // gris claro
  [EstadoCita.NO_ASISTIO]: '#4B5563',   // gris oscuro
  [EstadoCita.REPROGRAMADA]: '#D946EF', // fucsia
}

// Maquina de estados: transiciones validas por estado
export const TRANSICIONES_VALIDAS: Record<EstadoCita, EstadoCita[]> = {
  // La solicitud del portal se acepta (PENDIENTE) o se rechaza (CANCELADA)
  [EstadoCita.SOLICITADA]: [EstadoCita.PENDIENTE, EstadoCita.CANCELADA],
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
