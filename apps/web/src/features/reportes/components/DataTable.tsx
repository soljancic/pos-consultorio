import { ChevronUp, ChevronDown, ChevronsUpDown, Search, FileX } from 'lucide-react'
import { cardUI, inputUI } from '../../../lib/ui'
import { cn } from '../../../lib/utils'
import { TableSkeleton } from '../../../components/shared/Skeleton'
import { EmptyState } from '../../../components/shared/EmptyState'
import { ErrorState } from '../../../components/shared/ErrorState'

export interface Column<T> {
  key: string
  label: string
  align?: 'left' | 'right'
  sortable?: boolean
  render: (row: T) => React.ReactNode
}

interface Props<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  onSort: (key: string) => void
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
  search: string
  onSearch: (q: string) => void
  searchPlaceholder?: string
}

export function DataTable<T>(p: Props<T>) {
  const totalPaginas = Math.max(1, Math.ceil(p.total / p.pageSize))
  return (
    <div className="space-y-3">
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" aria-hidden="true" />
        <input value={p.search} onChange={(e) => p.onSearch(e.target.value)}
          placeholder={p.searchPlaceholder ?? 'Buscar...'} aria-label="Búsqueda rápida"
          className={cn(inputUI, 'pl-9')} />
      </div>
      {p.isLoading ? (
        <TableSkeleton cols={p.columns.length} />
      ) : p.isError ? (
        <ErrorState onRetry={p.onRetry} />
      ) : p.rows.length === 0 ? (
        <div className={cardUI}><EmptyState icon={FileX} title="Sin resultados" description="Probá con otro rango o filtros." /></div>
      ) : (
        <div className={cn(cardUI, 'overflow-x-auto')}>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                {p.columns.map((c) => {
                  const active = p.sortBy === c.key
                  return (
                    <th key={c.key}
                      aria-sort={active ? (p.sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                      className={cn('px-4 py-3 font-medium text-muted-foreground', c.align === 'right' ? 'text-right' : 'text-left')}>
                      {c.sortable ? (
                        <button onClick={() => p.onSort(c.key)}
                          className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded">
                          {c.label}
                          {active ? (p.sortDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />) : <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />}
                        </button>
                      ) : c.label}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {p.rows.map((row) => (
                <tr key={p.rowKey(row)} className="border-b last:border-0 hover:bg-muted/40 transition-colors duration-150">
                  {p.columns.map((c) => (
                    <td key={c.key} className={cn('px-4 py-3', c.align === 'right' ? 'text-right tabular-nums' : 'text-foreground')}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!p.isLoading && !p.isError && p.total > p.pageSize && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="tabular-nums">{p.total} resultados</span>
          <span className="flex items-center gap-3">
            <button disabled={p.page <= 1} onClick={() => p.onPage(p.page - 1)} className="disabled:opacity-40 hover:text-foreground cursor-pointer disabled:cursor-not-allowed">Anterior</button>
            <span className="tabular-nums">{p.page} / {totalPaginas}</span>
            <button disabled={p.page >= totalPaginas} onClick={() => p.onPage(p.page + 1)} className="disabled:opacity-40 hover:text-foreground cursor-pointer disabled:cursor-not-allowed">Siguiente</button>
          </span>
        </div>
      )}
    </div>
  )
}
