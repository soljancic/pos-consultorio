import type { CitaReportRow } from '@pos/types'
import type { Column } from '../components/DataTable'
import { formatFecha, formatHora, formatMoneda } from '../../../lib/utils'

const LABEL: Record<string, string> = {
  SOLICITADA: 'Solicitada', PENDIENTE: 'Pendiente', CONFIRMADA: 'Confirmada',
  LLEGO: 'Llegó', EN_ATENCION: 'En atención', ATENDIDA: 'Atendida',
  COBRADO: 'Cobrado', CON_DEUDA: 'Con deuda', CANCELADA: 'Cancelada',
  NO_ASISTIO: 'No asistió', REPROGRAMADA: 'Reprogramada',
}

export const citasColumns: Column<CitaReportRow>[] = [
  {
    key: 'fechaHora', label: 'Fecha', sortable: true,
    render: (r) => <span className="tabular-nums">{formatFecha(r.fechaHora)} {formatHora(r.fechaHora)}</span>,
  },
  { key: 'paciente', label: 'Paciente', sortable: true, render: (r) => r.paciente },
  { key: 'doctor', label: 'Doctor', render: (r) => r.doctor },
  { key: 'servicio', label: 'Servicio', render: (r) => r.servicio },
  { key: 'estado', label: 'Estado', render: (r) => LABEL[r.estado] ?? r.estado },
  {
    key: 'monto', label: 'Total', align: 'right', sortable: true,
    render: (r) => <span className="tabular-nums">{formatMoneda(r.monto)}</span>,
  },
  {
    key: 'descuento', label: 'Descuento', align: 'right', sortable: true,
    render: (r) => r.descuento > 0
      ? <span className="tabular-nums text-destructive">-{formatMoneda(r.descuento)}</span>
      : <span className="text-muted-foreground/60">—</span>,
  },
  {
    key: 'pagado', label: 'Pagado', align: 'right', sortable: true,
    render: (r) => <span className="tabular-nums font-medium">{formatMoneda(r.pagado)}</span>,
  },
  { key: 'observaciones', label: 'Observaciones', render: (r) => r.observaciones ?? '-' },
]

export const citasExport = (rows: CitaReportRow[]) => ({
  headers: ['Fecha', 'Hora', 'Paciente', 'Doctor', 'Servicio', 'Estado', 'Total', 'Descuento', 'Pagado', 'Observaciones'],
  rows: rows.map((r) => [
    formatFecha(r.fechaHora), formatHora(r.fechaHora),
    r.paciente, r.doctor, r.servicio,
    LABEL[r.estado] ?? r.estado,
    r.monto, r.descuento, r.pagado,
    r.observaciones ?? '',
  ]),
})
