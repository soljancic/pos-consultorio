import { EstadoCita, EstadoCobro, FormaPago, Rol } from '../enums'

export interface Consultorio {
  id: string
  nombre: string
  logoUrl?: string
  moneda: string
  timezone: string
  plan: string
  activo: boolean
  createdAt: Date
  updatedAt: Date
}

export interface Usuario {
  id: string
  consultorioId: string
  nombre: string
  email: string
  rol: Rol
  activo: boolean
  createdAt: Date
}

export interface Servicio {
  id: string
  consultorioId: string
  nombre: string
  descripcion?: string
  duracionMin: number
  precioBase: number
  activo: boolean
}

export interface Doctor {
  id: string
  consultorioId: string
  usuarioId?: string
  nombre: string
  especialidad?: string
  colorAgenda: string
  activo: boolean
}

export interface HorarioAtencion {
  id: string
  doctorId: string
  diaSemana: number
  horaInicio: string
  horaFin: string
  activo: boolean
}

export interface Paciente {
  id: string
  consultorioId: string
  nombre: string
  apellido: string
  dni?: string
  telefono?: string
  whatsapp?: string
  email?: string
  fechaNacimiento?: Date
  notas?: string
  deudaTotal: number
  createdAt: Date
}

export interface Cita {
  id: string
  consultorioId: string
  pacienteId: string
  doctorId: string
  servicioId: string
  fechaHora: Date
  duracionMin: number
  estado: EstadoCita
  notasSecretaria?: string
  createdById: string
  createdAt: Date
  // Relations (populated when requested)
  paciente?: Pick<Paciente, 'id' | 'nombre' | 'apellido' | 'whatsapp' | 'deudaTotal'>
  doctor?: Pick<Doctor, 'id' | 'nombre' | 'colorAgenda'>
  servicio?: Pick<Servicio, 'id' | 'nombre' | 'precioBase' | 'duracionMin'>
  cobro?: Pick<Cobro, 'id' | 'total' | 'saldoPendiente' | 'estado'>
}

export interface Cobro {
  id: string
  citaId: string
  consultorioId: string
  total: number
  saldoPendiente: number
  estado: EstadoCobro
  createdAt: Date
  pagos?: Pago[]
}

export interface Pago {
  id: string
  cobroId: string
  formaPago: FormaPago
  monto: number
  referencia?: string
  createdById: string
  createdAt: Date
}

export interface CajaDiaria {
  id: string
  consultorioId: string
  fecha: Date
  totalEfectivo: number
  totalQr: number
  totalTransferencia: number
  totalTarjeta: number
  totalGeneral: number
  cerrada: boolean
  cierreAt?: Date
}
