import { api } from '../../../lib/api-client'
import type { ReportPage, ReportTab } from '@pos/types'

export interface ReportQuery {
  desde: string; hasta: string
  doctorId?: number; servicioId?: number; pacienteId?: number
  estado?: string; tipoCuentaId?: number; q?: string
  page?: number; pageSize?: number; sortBy?: string; sortDir?: 'asc' | 'desc'
  export?: string
}

export function fetchReporte<T>(tab: ReportTab, query: ReportQuery): Promise<ReportPage<T>> {
  return api.get(`/reportes/${tab}`, { params: query }).then((r) => r.data)
}
