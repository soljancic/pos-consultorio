import { useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { useAuthStore } from '../../stores/auth.store'
import { chipIconUI } from '../../lib/ui'
import { cn } from '../../lib/utils'
import type { ReportTab } from '@pos/types'
import { useReportFilters } from './hooks/useReportFilters'
import { useReportData } from './hooks/useReportData'
import { fetchReporte } from './api/reportes.api'
import { ReportFilters } from './components/ReportFilters'
import { KpiCards } from './components/KpiCards'
import { DataTable } from './components/DataTable'
import { ExportButtons } from './components/ExportButtons'
import { REPORTS } from './reports'

export function ReportesPage() {
  const rol = useAuthStore((s) => s.user?.rol)
  const esAdmin = rol === 'ADMIN'
  const tabs = (Object.keys(REPORTS) as ReportTab[]).filter((t) => !REPORTS[t].soloAdmin || esAdmin)
  const [tab, setTab] = useState<ReportTab>('citas')
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState<string | undefined>()
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const { filtros, setPreset, patch } = useReportFilters()
  const cfg = REPORTS[tab]

  const query = { ...filtros, page, pageSize: 25, sortBy, sortDir }
  const { data, isLoading, isError, refetch } = useReportData<any>(tab, query)

  function cambiarTab(t: ReportTab) {
    setTab(t)
    setPage(1)
    setSortBy(undefined)
  }

  function ordenar(key: string) {
    if (sortBy === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortBy(key); setSortDir('desc') }
    setPage(1)
  }

  // Export = dataset completo (sin paginar) via export='1'
  const loadAll = async () => {
    const full = await fetchReporte<any>(tab, { ...query, export: '1' })
    return cfg.toExport(full.rows)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b bg-card print:hidden">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <span className={chipIconUI}><BarChart3 className="h-4 w-4" aria-hidden="true" /></span>
          Reportes
        </h1>
        <ExportButtons filename={`reporte-${tab}-${filtros.desde}`} loadAll={loadAll} />
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-5 max-w-6xl mx-auto w-full">
        <div className="print:hidden">
          <ReportFilters
            tab={tab}
            filtros={filtros}
            esAdmin={esAdmin}
            onPreset={(p) => { setPreset(p); setPage(1) }}
            onPatch={(p) => { patch(p); setPage(1) }}
          />
        </div>

        <div className="flex flex-wrap gap-1 print:hidden" role="tablist">
          {tabs.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => cambiarTab(t)}
              className={cn(
                'px-4 py-1.5 rounded-md text-sm font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150',
                tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {REPORTS[t].label}
            </button>
          ))}
        </div>

        <KpiCards kpis={data?.kpis ?? []} />

        <DataTable
          columns={cfg.columns}
          rows={data?.rows ?? []}
          rowKey={cfg.rowKey}
          isLoading={isLoading}
          isError={isError}
          onRetry={refetch}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={ordenar}
          page={data?.page ?? 1}
          pageSize={data?.pageSize ?? 25}
          total={data?.total ?? 0}
          onPage={setPage}
          search={filtros.q ?? ''}
          onSearch={(q) => { patch({ q: q || undefined }); setPage(1) }}
          searchPlaceholder={cfg.searchPlaceholder}
        />
      </div>
    </div>
  )
}
