import type { ServicioReportRow } from '@pos/types'
import type { Column } from '../components/DataTable'
import { formatMoneda } from '../../../lib/utils'

export const serviciosColumns: Column<ServicioReportRow>[] = [
  { key: 'servicio', label: 'Servicio', sortable: true, render: (r) => r.servicio },
  { key: 'doctor', label: 'Doctor', render: (r) => r.doctor },
  {
    key: 'cantidadRealizada', label: 'Cantidad', align: 'right', sortable: true,
    render: (r) => <span className="tabular-nums">{r.cantidadRealizada}</span>,
  },
  {
    key: 'totalCobrado', label: 'Total cobrado', align: 'right', sortable: true,
    render: (r) => formatMoneda(r.totalCobrado),
  },
  {
    key: 'promedioCobrado', label: 'Promedio', align: 'right',
    render: (r) => formatMoneda(r.promedioCobrado),
  },
]

export const serviciosExport = (rows: ServicioReportRow[]) => ({
  headers: ['Servicio', 'Doctor', 'Cantidad', 'Total cobrado', 'Promedio'],
  rows: rows.map((r) => [r.servicio, r.doctor, r.cantidadRealizada, r.totalCobrado, r.promedioCobrado]),
})
