import type { CobranzaReportRow } from '@pos/types'
import type { Column } from '../components/DataTable'
import { formatFecha, formatHora, formatMoneda } from '../../../lib/utils'

export const cobranzasColumns: Column<CobranzaReportRow>[] = [
  {
    key: 'fechaPago', label: 'Fecha pago', sortable: true,
    render: (r) => <span className="tabular-nums">{formatFecha(r.fechaPago)} {formatHora(r.fechaPago)}</span>,
  },
  { key: 'paciente', label: 'Paciente', sortable: true, render: (r) => r.paciente },
  { key: 'concepto', label: 'Concepto', render: (r) => r.concepto },
  { key: 'formaPago', label: 'Forma de pago', render: (r) => r.formaPago },
  { key: 'monto', label: 'Monto', align: 'right', sortable: true, render: (r) => formatMoneda(r.monto) },
  { key: 'usuario', label: 'Usuario', render: (r) => r.usuario },
]

export const cobranzasExport = (rows: CobranzaReportRow[]) => ({
  headers: ['Fecha', 'Hora', 'Paciente', 'Concepto', 'Forma de pago', 'Monto', 'Usuario'],
  rows: rows.map((r) => [
    formatFecha(r.fechaPago), formatHora(r.fechaPago),
    r.paciente, r.concepto, r.formaPago, r.monto, r.usuario,
  ]),
})
