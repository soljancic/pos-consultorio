import { citasColumns, citasExport } from './citas.report'
import { cobranzasColumns, cobranzasExport } from './cobranzas.report'
import { gastosColumns, gastosExport } from './gastos.report'
import { pacientesColumns, pacientesExport } from './pacientes.report'
import { serviciosColumns, serviciosExport } from './servicios.report'
import { aseguradorasColumns, aseguradorasExport } from './aseguradoras.report'
import { coberturaColumns, coberturaExport } from './cobertura.report'
import type { ReportTab } from '@pos/types'

export const REPORTS: Record<ReportTab, {
  label: string
  columns: any
  toExport: (rows: any[]) => { headers: string[]; rows: any[][] }
  searchPlaceholder: string
  soloAdmin?: boolean
  requiereAseguradoras?: boolean
  rowKey: (r: any) => string | number
}> = {
  citas: {
    label: 'Citas',
    columns: citasColumns,
    toExport: citasExport,
    searchPlaceholder: 'Buscar paciente...',
    rowKey: (r) => r.id,
  },
  cobranzas: {
    label: 'Cobranzas',
    columns: cobranzasColumns,
    toExport: cobranzasExport,
    searchPlaceholder: 'Buscar paciente...',
    rowKey: (r) => r.id,
  },
  gastos: {
    label: 'Gastos',
    columns: gastosColumns,
    toExport: gastosExport,
    searchPlaceholder: 'Buscar descripción...',
    soloAdmin: true,
    rowKey: (r) => r.id,
  },
  pacientes: {
    label: 'Pacientes',
    columns: pacientesColumns,
    toExport: pacientesExport,
    searchPlaceholder: 'Buscar paciente...',
    rowKey: (r) => r.id,
  },
  servicios: {
    label: 'Servicios',
    columns: serviciosColumns,
    toExport: serviciosExport,
    searchPlaceholder: 'Buscar servicio...',
    rowKey: (r) => `${r.servicioId}-${r.doctorId}`,
  },
  aseguradoras: {
    label: 'Aseguradoras',
    columns: aseguradorasColumns,
    toExport: aseguradorasExport,
    searchPlaceholder: 'Buscar aseguradora...',
    soloAdmin: true,
    requiereAseguradoras: true,
    rowKey: (r) => r.aseguradoraId,
  },
  cobertura: {
    label: 'Cobertura',
    columns: coberturaColumns,
    toExport: coberturaExport,
    searchPlaceholder: 'Buscar aseguradora...',
    soloAdmin: true,
    requiereAseguradoras: true,
    rowKey: (r) => r.aseguradoraId,
  },
}
