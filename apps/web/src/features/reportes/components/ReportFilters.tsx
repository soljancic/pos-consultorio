import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { api } from '../../../lib/api-client'
import { inputUI, btnIconUI } from '../../../lib/ui'
import { cn } from '../../../lib/utils'
import type { Filtros } from '../hooks/useReportFilters'
import type { ReportTab } from '@pos/types'
import { RangoFechasPicker } from './RangoFechasPicker'

const ESTADOS = ['SOLICITADA','PENDIENTE','CONFIRMADA','LLEGO','EN_ATENCION','ATENDIDA','COBRADO','CON_DEUDA','CANCELADA','NO_ASISTIO']

interface PacienteMatch { id: number; nombre: string; apellido: string }

interface Props {
  tab: ReportTab; filtros: Filtros; esAdmin: boolean
  onPatch: (p: Partial<Filtros>) => void
}

export function ReportFilters({ tab, filtros, esAdmin, onPatch }: Props) {
  const { data: doctores = [] } = useQuery<any[]>({ queryKey: ['doctores'], queryFn: () => api.get('/doctores').then((r) => r.data) })
  const { data: servicios = [] } = useQuery<any[]>({ queryKey: ['servicios','todos'], queryFn: () => api.get('/servicios?todos=true').then((r) => r.data) })
  const { data: cuentas = [] } = useQuery<any[]>({ queryKey: ['tipos-cuenta','todos'], queryFn: () => api.get('/tipos-cuenta').then((r) => r.data), enabled: tab === 'cobranzas' || tab === 'gastos' })

  // Patient typeahead state
  const [pacienteSearch, setPacienteSearch] = useState('')
  const [pacienteLabel, setPacienteLabel] = useState<string | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showTypeahead = tab === 'citas' || tab === 'cobranzas'

  const { data: pacienteMatches = [] } = useQuery<PacienteMatch[]>({
    queryKey: ['pacientes-search', debouncedSearch],
    queryFn: () => api.get(`/pacientes?limit=50&search=${encodeURIComponent(debouncedSearch)}`).then((r) => r.data.items),
    enabled: showTypeahead && debouncedSearch.length >= 2,
  })

  function handlePacienteInput(value: string) {
    setPacienteSearch(value)
    setShowDropdown(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDebouncedSearch(value), 300)
  }

  function selectPaciente(p: PacienteMatch) {
    setPacienteLabel(`${p.nombre} ${p.apellido}`)
    setPacienteSearch('')
    setDebouncedSearch('')
    setShowDropdown(false)
    onPatch({ pacienteId: p.id })
  }

  function clearPaciente() {
    setPacienteLabel(null)
    setPacienteSearch('')
    setDebouncedSearch('')
    setShowDropdown(false)
    onPatch({ pacienteId: undefined })
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      {/* Rango de fechas: boton unico con popover (presets + calendario +
          inputs nativos Desde/Hasta como via exacta) */}
      <RangoFechasPicker
        desde={filtros.desde}
        hasta={filtros.hasta}
        onChange={(desde, hasta) => onPatch({ desde, hasta })}
      />

      {/* Filtros de seleccion: 2 por linea en celular (grid), inline en desktop.
          Labels cortos para que entren en la celda angosta. */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
        {esAdmin && (
          <select value={filtros.doctorId ?? ''} onChange={(e) => onPatch({ doctorId: e.target.value ? Number(e.target.value) : undefined })} aria-label="Doctor" className={cn(inputUI, 'sm:w-auto')}>
            <option value="">Doctores</option>
            {doctores.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
        )}
        <select value={filtros.servicioId ?? ''} onChange={(e) => onPatch({ servicioId: e.target.value ? Number(e.target.value) : undefined })} aria-label="Servicio" className={cn(inputUI, 'sm:w-auto')}>
          <option value="">Servicios</option>
          {servicios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        {tab === 'citas' && (
          <select value={filtros.estado ?? ''} onChange={(e) => onPatch({ estado: e.target.value || undefined })} aria-label="Estado" className={cn(inputUI, 'sm:w-auto')}>
            <option value="">Estados</option>
            {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {(tab === 'cobranzas' || tab === 'gastos') && (
          <select value={filtros.tipoCuentaId ?? ''} onChange={(e) => onPatch({ tipoCuentaId: e.target.value ? Number(e.target.value) : undefined })} aria-label="Forma de pago" className={cn(inputUI, 'sm:w-auto')}>
            <option value="">Forma de pago</option>
            {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        )}
        {showTypeahead && (
          <div className="relative w-full sm:w-auto">
            {pacienteLabel ? (
              <div className={cn(inputUI, 'w-full sm:w-auto flex items-center gap-1.5 pr-2')}>
                <span className="text-sm text-foreground truncate max-w-[160px]">{pacienteLabel}</span>
                <button
                  onClick={clearPaciente}
                  aria-label="Quitar filtro de paciente"
                  className={cn(btnIconUI, 'h-5 w-5 text-muted-foreground hover:text-foreground')}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <input
                type="text"
                value={pacienteSearch}
                onChange={(e) => handlePacienteInput(e.target.value)}
                onFocus={() => pacienteSearch.length >= 2 && setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                placeholder="Pacientes"
                aria-label="Paciente"
                className={cn(inputUI, 'w-full sm:w-44')}
              />
            )}
            {showDropdown && !pacienteLabel && pacienteMatches.length > 0 && (
              <ul
                role="listbox"
                aria-label="Resultados de pacientes"
                className="absolute z-20 top-full mt-1 left-0 min-w-full bg-card border rounded-md shadow-md py-1 max-h-48 overflow-y-auto"
              >
                {pacienteMatches.map((p) => (
                  <li key={p.id}>
                    <button
                      role="option"
                      aria-selected={false}
                      onMouseDown={() => selectPaciente(p)}
                      className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted focus-visible:outline-hidden focus-visible:bg-muted cursor-pointer"
                    >
                      {p.nombre} {p.apellido}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
