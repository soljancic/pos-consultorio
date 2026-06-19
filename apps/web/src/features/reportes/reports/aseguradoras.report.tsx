import type { AseguradoraReportRow } from '@pos/types'
import type { Column } from '../components/DataTable'
import { formatMoneda } from '../../../lib/utils'

export const aseguradorasColumns: Column<AseguradoraReportRow>[] = [
  { key: 'aseguradora', label: 'Aseguradora', sortable: true, render: (r) => r.aseguradora },
  { key: 'atenciones', label: 'Atenciones', align: 'right', sortable: true, render: (r) => <span className="tabular-nums">{r.atenciones}</span> },
  { key: 'pacientes', label: 'Pacientes', align: 'right', sortable: true, render: (r) => <span className="tabular-nums">{r.pacientes}</span> },
  { key: 'montoTotal', label: 'Total', align: 'right', sortable: true, render: (r) => formatMoneda(r.montoTotal) },
  { key: 'pendiente', label: 'Pendiente', align: 'right', sortable: true, render: (r) => formatMoneda(r.pendiente) },
  { key: 'pagado', label: 'Cobrado', align: 'right', sortable: true, render: (r) => formatMoneda(r.pagado) },
  { key: 'rechazado', label: 'Rechazado', align: 'right', sortable: true, render: (r) => formatMoneda(r.rechazado) },
]

export const aseguradorasExport = (rows: AseguradoraReportRow[]) => ({
  headers: ['Aseguradora', 'Atenciones', 'Pacientes', 'Total', 'Pendiente', 'Facturado', 'Cobrado', 'Rechazado'],
  rows: rows.map((r) => [r.aseguradora, r.atenciones, r.pacientes, r.montoTotal, r.pendiente, r.facturado, r.pagado, r.rechazado]),
})
