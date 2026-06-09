// Wrappers de respuesta estandar de la API

export interface ApiResponse<T> {
  data: T
  meta?: PaginationMeta
}

export interface ApiError {
  statusCode: number
  message: string | string[]
  error: string
  timestamp: string
  path: string
}

export interface PaginationMeta {
  total: number
  page: number
  limit: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

export interface PaginationQuery {
  page?: number
  limit?: number
  search?: string
}

// Auth
export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  consultorioNombre: string
  adminNombre: string
  email: string
  password: string
  moneda?: string
  timezone?: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface AuthUser {
  id: string
  nombre: string
  email: string
  rol: string
  consultorioId: string
  consultorioNombre: string
}

// Citas
export interface CrearCitaRequest {
  pacienteId: string
  doctorId: string
  servicioId: string
  fechaHora: string
  notasSecretaria?: string
}

export interface CambiarEstadoCitaRequest {
  estado: string
  motivo?: string
}

// Cobros
export interface RegistrarPagoRequest {
  monto: number
  formaPago: string
  referencia?: string
}
