import type { ProductoReportRow } from '@pos/types'
import type { Column } from '../components/DataTable'
import { formatMoneda } from '../../../lib/utils'

export const productosColumns: Column<ProductoReportRow>[] = [
  { key: 'producto', label: 'Producto', sortable: true, render: (r) => r.producto },
  {
    key: 'categoria', label: 'Categoría',
    render: (r) => r.categoria || <span className="text-muted-foreground/60">—</span>,
  },
  {
    key: 'cantidad', label: 'Cantidad', align: 'right', sortable: true,
    render: (r) => <span className="tabular-nums">{r.cantidad}</span>,
  },
  {
    key: 'totalVendido', label: 'Total vendido', align: 'right', sortable: true,
    render: (r) => <span className="tabular-nums font-medium">{formatMoneda(r.totalVendido)}</span>,
  },
  {
    key: 'descuento', label: 'Descuento', align: 'right', sortable: true,
    render: (r) => r.descuento > 0.005
      ? <span className="tabular-nums text-destructive">-{formatMoneda(r.descuento)}</span>
      : <span className="text-muted-foreground/60">—</span>,
  },
  {
    key: 'costo', label: 'Costo', align: 'right', sortable: true,
    render: (r) => <span className="tabular-nums text-muted-foreground">{formatMoneda(r.costo)}</span>,
  },
  {
    key: 'margen', label: 'Margen', align: 'right', sortable: true,
    render: (r) => <span className="tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">{formatMoneda(r.margen)}</span>,
  },
]

export const productosExport = (rows: ProductoReportRow[]) => ({
  headers: ['Producto', 'Categoría', 'Cantidad', 'Total vendido', 'Descuento', 'Costo', 'Margen'],
  rows: rows.map((r) => [r.producto, r.categoria ?? '', r.cantidad, r.totalVendido, r.descuento, r.costo, r.margen]),
})
