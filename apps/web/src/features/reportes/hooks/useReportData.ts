import { useQuery, keepPreviousData } from '@tanstack/react-query'
import type { ReportPage, ReportTab } from '@pos/types'
import { fetchReporte, type ReportQuery } from '../api/reportes.api'

export function useReportData<T>(tab: ReportTab, query: ReportQuery) {
  return useQuery<ReportPage<T>>({
    queryKey: ['reportes', tab, query],
    queryFn: () => fetchReporte<T>(tab, query),
    placeholderData: keepPreviousData,
  })
}
