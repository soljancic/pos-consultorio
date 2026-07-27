import { useState } from 'react'
import { format } from 'date-fns'

const f = (d: Date) => format(d, 'yyyy-MM-dd')

export interface Filtros {
  desde: string; hasta: string
  doctorId?: number; servicioId?: number; pacienteId?: number
  estado?: string; tipoCuentaId?: number; q?: string
}

// Los presets de rango (Hoy, Ayer, 7/30/90 dias, etc.) viven en
// components/RangoFechasPicker.tsx; aca solo el estado inicial (hoy).
export function useReportFilters() {
  const [filtros, setFiltros] = useState<Filtros>(() => {
    const hoy = f(new Date())
    return { desde: hoy, hasta: hoy }
  })
  const patch = (p: Partial<Filtros>) => setFiltros((prev) => ({ ...prev, ...p }))
  return { filtros, setFiltros, patch }
}
