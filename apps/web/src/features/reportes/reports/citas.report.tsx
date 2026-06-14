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
  { key: 'monto', label: 'Monto', align: 'right', sortable: true, render: (r) => formatMoneda(r.monto) },
  { key: 'observaciones', label: 'Observaciones', render: (r) => r.observaciones ?? '-' },
]

export const citasExport = (rows: CitaReportRow[]) => ({
  headers: ['Fecha', 'Hora', 'Paciente', 'Doctor', 'Servicio', 'Estado', 'Monto', 'Observaciones'],
  rows: rows.map((r) => [
    formatFecha(r.fechaHora), formatHora(r.fechaHora),
    r.paciente, r.doctor, r.servicio,
    LABEL[r.estado] ?? r.estado,
    r.monto,
    r.observaciones ?? '',
  ]),
})
