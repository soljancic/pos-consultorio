export type ReportTab = 'citas' | 'cobranzas' | 'gastos' | 'pacientes' | 'servicios' | 'aseguradoras' | 'cobertura'

export type KpiFormat = 'money' | 'number' | 'percent'
export type KpiTone = 'default' | 'success' | 'warning' | 'danger'

export interface ReportKpi {
  key: string
  label: string
  value: number
  format: KpiFormat
  tone?: KpiTone
  hint?: string
}

export interface ReportPage<T> {
  kpis: ReportKpi[]
  rows: T[]
  page: number
  pageSize: number
  total: number
  meta?: Record<string, unknown>
}

export type SortDir = 'asc' | 'desc'

export interface CitaReportRow {
  id: number
  fechaHora: string
  paciente: string
  doctor: string
  servicio: string
  estado: string // EstadoCita
  monto: number
  observaciones: string | null
}
export interface CobranzaReportRow {
  id: number
  fechaPago: string
  paciente: string
  concepto: string
  formaPago: string
  monto: number
  usuario: string
}
export interface GastoReportRow {
  id: number
  fecha: string
  categoria: string
  descripcion: string
  proveedor: string | null
  formaPago: string
  monto: number
  usuario: string
}
export interface PacienteReportRow {
  id: number
  paciente: string
  telefono: string | null
  fechaRegistro: string
  ultimaCita: string | null
  cantidadCitas: number
  totalPagado: number
  deudaPendiente: number
}
export interface ServicioReportRow {
  servicioId: number
  servicio: string
  doctorId: number
  doctor: string
  cantidadRealizada: number
  totalCobrado: number
  promedioCobrado: number
}
export interface AseguradoraReportRow {
  aseguradoraId: number
  aseguradora: string
  atenciones: number
  pacientes: number
  montoTotal: number
  pendiente: number
  facturado: number
  pagado: number
  rechazado: number
}
export interface CoberturaReportRow {
  aseguradoraId: number
  aseguradora: string
  pacientes: number
}
