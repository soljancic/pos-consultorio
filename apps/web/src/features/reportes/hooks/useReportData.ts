import { useQuery } from '@tanstack/react-query'
import type { ReportPage, ReportTab } from '@pos/types'
import { fetchReporte, type ReportQuery } from '../api/reportes.api'

export function useReportData<T>(tab: ReportTab, query: ReportQuery) {
  return useQuery<ReportPage<T>>({
    queryKey: ['reportes', tab, query],
    queryFn: () => fetchReporte<T>(tab, query),
    // Mantener datos previos solo DENTRO del mismo tab (paginacion/filtros
    // fluidos). Al cambiar de tab se descarta el placeholder: si no, las
    // columnas del tab nuevo renderizan contra filas del tab viejo y
    // formatFecha(undefined) lanza RangeError -> pantalla blanca.
    placeholderData: (prev, prevQuery) =>
      prevQuery && (prevQuery.queryKey as [string, ReportTab, unknown])[1] === tab
        ? prev
        : undefined,
  })
}
