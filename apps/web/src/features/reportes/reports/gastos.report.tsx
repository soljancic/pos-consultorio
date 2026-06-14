import type { GastoReportRow } from '@pos/types'
import type { Column } from '../components/DataTable'
import { formatFecha, formatMoneda } from '../../../lib/utils'

export const gastosColumns: Column<GastoReportRow>[] = [
  {
    key: 'fecha', label: 'Fecha', sortable: true,
    render: (r) => <span className="tabular-nums">{formatFecha(r.fecha)}</span>,
  },
  { key: 'categoria', label: 'Categoría', render: (r) => r.categoria },
  { key: 'descripcion', label: 'Descripción', render: (r) => r.descripcion },
  { key: 'proveedor', label: 'Proveedor', render: (r) => r.proveedor ?? '-' },
  { key: 'formaPago', label: 'Forma de pago', render: (r) => r.formaPago },
  { key: 'monto', label: 'Monto', align: 'right', sortable: true, render: (r) => formatMoneda(r.monto) },
  { key: 'usuario', label: 'Usuario', render: (r) => r.usuario },
]

export const gastosExport = (rows: GastoReportRow[]) => ({
  headers: ['Fecha', 'Categoría', 'Descripción', 'Proveedor', 'Forma de pago', 'Monto', 'Usuario'],
  rows: rows.map((r) => [
    formatFecha(r.fecha), r.categoria, r.descripcion,
    r.proveedor ?? '', r.formaPago, r.monto, r.usuario,
  ]),
})
