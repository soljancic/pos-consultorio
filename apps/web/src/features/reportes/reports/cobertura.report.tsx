import type { CoberturaReportRow } from '@pos/types'
import type { Column } from '../components/DataTable'

export const coberturaColumns: Column<CoberturaReportRow>[] = [
  { key: 'aseguradora', label: 'Aseguradora', sortable: true, render: (r) => r.aseguradora },
  { key: 'pacientes', label: 'Pacientes', align: 'right', sortable: true, render: (r) => <span className="tabular-nums">{r.pacientes}</span> },
]

export const coberturaExport = (rows: CoberturaReportRow[]) => ({
  headers: ['Aseguradora', 'Pacientes'],
  rows: rows.map((r) => [r.aseguradora, r.pacientes]),
})
