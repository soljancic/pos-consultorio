import { useState } from 'react'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths } from 'date-fns'

export type Preset = 'hoy' | 'semana' | 'mes' | 'mesPasado' | 'custom'
const f = (d: Date) => format(d, 'yyyy-MM-dd')

export function rangoPreset(p: Preset): { desde: string; hasta: string } {
  const hoy = new Date()
  switch (p) {
    case 'semana': return { desde: f(startOfWeek(hoy, { weekStartsOn: 1 })), hasta: f(endOfWeek(hoy, { weekStartsOn: 1 })) }
    case 'mes': return { desde: f(startOfMonth(hoy)), hasta: f(endOfMonth(hoy)) }
    case 'mesPasado': { const m = subMonths(hoy, 1); return { desde: f(startOfMonth(m)), hasta: f(endOfMonth(m)) } }
    case 'hoy': default: return { desde: f(hoy), hasta: f(hoy) }
  }
}

export interface Filtros {
  desde: string; hasta: string
  doctorId?: number; servicioId?: number; pacienteId?: number
  estado?: string; tipoCuentaId?: number; q?: string
}

export function useReportFilters() {
  const [filtros, setFiltros] = useState<Filtros>(() => ({ ...rangoPreset('hoy') }))
  const setPreset = (p: Preset) => setFiltros((prev) => ({ ...prev, ...rangoPreset(p) }))
  const patch = (p: Partial<Filtros>) => setFiltros((prev) => ({ ...prev, ...p }))
  return { filtros, setFiltros, setPreset, patch }
}
