import { useQuery } from '@tanstack/react-query'
import { api } from '../../../lib/api-client'
import { inputUI } from '../../../lib/ui'
import { cn } from '../../../lib/utils'
import type { Filtros, Preset } from '../hooks/useReportFilters'
import type { ReportTab } from '@pos/types'

const PRESETS: Array<{ id: Preset; label: string }> = [
  { id: 'hoy', label: 'Hoy' }, { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mes' }, { id: 'mesPasado', label: 'Mes pasado' },
]
const ESTADOS = ['SOLICITADA','PENDIENTE','CONFIRMADA','LLEGO','EN_ATENCION','ATENDIDA','COBRADO','CON_DEUDA','CANCELADA','NO_ASISTIO']

interface Props {
  tab: ReportTab; filtros: Filtros; esAdmin: boolean
  onPreset: (p: Preset) => void
  onPatch: (p: Partial<Filtros>) => void
}

export function ReportFilters({ tab, filtros, esAdmin, onPreset, onPatch }: Props) {
  const { data: doctores = [] } = useQuery<any[]>({ queryKey: ['doctores'], queryFn: () => api.get('/doctores').then((r) => r.data) })
  const { data: servicios = [] } = useQuery<any[]>({ queryKey: ['servicios','todos'], queryFn: () => api.get('/servicios?todos=true').then((r) => r.data) })
  const { data: cuentas = [] } = useQuery<any[]>({ queryKey: ['tipos-cuenta','todos'], queryFn: () => api.get('/tipos-cuenta').then((r) => r.data), enabled: tab === 'cobranzas' || tab === 'gastos' })

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-md border overflow-hidden">
        {PRESETS.map((p) => (
          <button key={p.id} onClick={() => onPreset(p.id)}
            className="px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset transition-colors duration-150">
            {p.label}
          </button>
        ))}
      </div>
      <input type="date" value={filtros.desde} onChange={(e) => onPatch({ desde: e.target.value })} aria-label="Desde" className={cn(inputUI, 'w-auto')} />
      <span className="text-muted-foreground/70">a</span>
      <input type="date" value={filtros.hasta} onChange={(e) => onPatch({ hasta: e.target.value })} aria-label="Hasta" className={cn(inputUI, 'w-auto')} />
      {esAdmin && (
        <select value={filtros.doctorId ?? ''} onChange={(e) => onPatch({ doctorId: e.target.value ? Number(e.target.value) : undefined })} aria-label="Doctor" className={cn(inputUI, 'w-auto')}>
          <option value="">Todos los doctores</option>
          {doctores.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </select>
      )}
      <select value={filtros.servicioId ?? ''} onChange={(e) => onPatch({ servicioId: e.target.value ? Number(e.target.value) : undefined })} aria-label="Servicio" className={cn(inputUI, 'w-auto')}>
        <option value="">Todos los servicios</option>
        {servicios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
      </select>
      {tab === 'citas' && (
        <select value={filtros.estado ?? ''} onChange={(e) => onPatch({ estado: e.target.value || undefined })} aria-label="Estado" className={cn(inputUI, 'w-auto')}>
          <option value="">Todos los estados</option>
          {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      {(tab === 'cobranzas' || tab === 'gastos') && (
        <select value={filtros.tipoCuentaId ?? ''} onChange={(e) => onPatch({ tipoCuentaId: e.target.value ? Number(e.target.value) : undefined })} aria-label="Forma de pago" className={cn(inputUI, 'w-auto')}>
          <option value="">Todas las formas de pago</option>
          {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      )}
    </div>
  )
}
