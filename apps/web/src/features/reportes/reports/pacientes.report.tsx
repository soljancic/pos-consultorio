import type { PacienteReportRow } from '@pos/types'
import type { Column } from '../components/DataTable'
import { formatFecha, formatMoneda, cn } from '../../../lib/utils'

export const pacientesColumns: Column<PacienteReportRow>[] = [
  { key: 'paciente', label: 'Paciente', sortable: true, render: (r) => r.paciente },
  { key: 'telefono', label: 'Teléfono', render: (r) => r.telefono ?? '-' },
  {
    key: 'fechaRegistro', label: 'Fecha registro',
    render: (r) => <span className="tabular-nums">{formatFecha(r.fechaRegistro)}</span>,
  },
  {
    key: 'ultimaCita', label: 'Última cita',
    render: (r) => r.ultimaCita ? <span className="tabular-nums">{formatFecha(r.ultimaCita)}</span> : '-',
  },
  {
    key: 'cantidadCitas', label: 'N° citas', align: 'right', sortable: true,
    render: (r) => <span className="tabular-nums">{r.cantidadCitas}</span>,
  },
  {
    key: 'totalPagado', label: 'Total pagado', align: 'right', sortable: true,
    render: (r) => formatMoneda(r.totalPagado),
  },
  {
    key: 'deudaPendiente', label: 'Deuda', align: 'right',
    render: (r) => (
      <span className={cn('tabular-nums', r.deudaPendiente > 0 ? 'text-destructive font-medium' : '')}>
        {formatMoneda(r.deudaPendiente)}
      </span>
    ),
  },
]

export const pacientesExport = (rows: PacienteReportRow[]) => ({
  headers: ['Paciente', 'Teléfono', 'Fecha registro', 'Última cita', 'N° citas', 'Total pagado', 'Deuda'],
  rows: rows.map((r) => [
    r.paciente, r.telefono ?? '', formatFecha(r.fechaRegistro),
    r.ultimaCita ? formatFecha(r.ultimaCita) : '',
    r.cantidadCitas, r.totalPagado, r.deudaPendiente,
  ]),
})
