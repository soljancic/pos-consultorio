import { EstadoCita, EstadoCobro, OrigenCita, Rol } from '../enums'

export interface Consultorio {
  id: number
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
  id: number
  consultorioId: number
  nombre: string
  email: string
  rol: Rol
  activo: boolean
  createdAt: Date
}

export interface Servicio {
  id: number
  consultorioId: number
  nombre: string
  descripcion?: string
  duracionMin: number
  precioBase: number
  activo: boolean
}

export interface Doctor {
  id: number
  consultorioId: number
  usuarioId?: number
  nombre: string
  especialidad?: string
  colorAgenda: string
  fotoUrl?: string | null
  activo: boolean
}

export interface HorarioAtencion {
  id: number
  doctorId: number
  diaSemana: number
  horaInicio: string
  horaFin: string
  activo: boolean
}

export interface Paciente {
  id: number
  consultorioId: number
  nombre: string
  apellido: string
  dni?: string
  telefono?: string
  // ISO 3166-1 alfa-2; prefijo internacional para WhatsApp (default BO)
  pais?: string
  email?: string
  fechaNacimiento?: Date
  sexo?: string | null
  direccion?: string | null
  notas?: string
  deudaTotal: number
  // E3 item 11: alerta de prepago por inasistencias (no bloquea)
  requierePrepago?: boolean
  // Archivar: activo:false sale del grid por defecto pero se conserva/reactiva
  activo?: boolean
  // Seguro (F2)
  tieneSeguro?: boolean
  aseguradoraId?: number | null
  categoriaSeguroId?: number | null
  codigoSeguro?: string | null
  aseguradora?: { id: number; nombre: string } | null
  categoriaSeguro?: { id: number; nombre: string; aseguradoraId: number } | null
  createdAt: Date
}

export interface Cita {
  id: number
  consultorioId: number
  pacienteId: number
  doctorId: number
  servicioId: number
  fechaHora: Date
  duracionMin: number
  estado: EstadoCita
  origen?: OrigenCita
  notasSecretaria?: string
  createdById: number
  createdAt: Date
  // Relations (populated when requested)
  paciente?: Pick<Paciente, 'id' | 'nombre' | 'apellido' | 'telefono' | 'pais' | 'deudaTotal'>
  doctor?: Pick<Doctor, 'id' | 'nombre' | 'colorAgenda'>
  servicio?: Pick<Servicio, 'id' | 'nombre' | 'precioBase' | 'duracionMin'>
  cobro?: Pick<Cobro, 'id' | 'total' | 'saldoPendiente' | 'estado'>
}

export interface Cobro {
  id: number
  citaId: number
  consultorioId: number
  total: number
  saldoPendiente: number
  estado: EstadoCobro
  createdAt: Date
  pagos?: Pago[]
}

export interface Pago {
  id: number
  cobroId: number
  tipoCuentaId: number
  // relacion poblada al incluirla (nombre de la cuenta / forma de pago)
  tipoCuenta?: { id: number; nombre: string; esEfectivo: boolean }
  monto: number
  referencia?: string
  createdById: number
  createdAt: Date
}

export interface CajaDiaria {
  id: number
  consultorioId: number
  fecha: Date
  totalEfectivo: number
  totalGeneral: number
  cerrada: boolean
  cierreAt?: Date
}
