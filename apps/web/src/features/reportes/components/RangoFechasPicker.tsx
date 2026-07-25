import { useEffect, useMemo, useRef, useState } from 'react'
import { DayPicker, type DateRange } from 'react-day-picker'
import { es } from 'react-day-picker/locale'
import { CalendarDays, ChevronDown } from 'lucide-react'
import { cn, formatDia } from '../../../lib/utils'
import { inputUI } from '../../../lib/ui'

// Selector de rango de fechas para Reportes: boton con el rango aplicado que
// abre un popover con presets (columna en desktop, chips en celular), el
// calendario (2 meses en desktop, 1 en celular) y los inputs nativos
// Desde/Hasta como via exacta (el picker nativo del celular es el mejor ahi).

function aISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function deISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function sumarDias(base: Date, dias: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + dias)
  return d
}

// lunes de la semana de `base` (getDay: 0=domingo)
function lunesDe(base: Date): Date {
  return sumarDias(base, -((base.getDay() + 6) % 7))
}

interface Preset {
  label: string
  rango: () => { desde: string; hasta: string }
}

const PRESETS: Preset[] = [
  { label: 'Hoy', rango: () => ({ desde: aISO(new Date()), hasta: aISO(new Date()) }) },
  { label: 'Ayer', rango: () => ({ desde: aISO(sumarDias(new Date(), -1)), hasta: aISO(sumarDias(new Date(), -1)) }) },
  { label: 'Esta semana', rango: () => ({ desde: aISO(lunesDe(new Date())), hasta: aISO(new Date()) }) },
  {
    label: 'Semana pasada',
    rango: () => {
      const lunes = sumarDias(lunesDe(new Date()), -7)
      return { desde: aISO(lunes), hasta: aISO(sumarDias(lunes, 6)) }
    },
  },
  { label: '7 días', rango: () => ({ desde: aISO(sumarDias(new Date(), -7)), hasta: aISO(new Date()) }) },
  { label: '30 días', rango: () => ({ desde: aISO(sumarDias(new Date(), -30)), hasta: aISO(new Date()) }) },
  { label: '90 días', rango: () => ({ desde: aISO(sumarDias(new Date(), -90)), hasta: aISO(new Date()) }) },
  {
    label: 'Este mes',
    rango: () => {
      const hoy = new Date()
      return { desde: aISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: aISO(hoy) }
    },
  },
  {
    label: 'Mes pasado',
    rango: () => {
      const hoy = new Date()
      return {
        desde: aISO(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)),
        hasta: aISO(new Date(hoy.getFullYear(), hoy.getMonth(), 0)),
      }
    },
  },
]

function useEsDesktop(): boolean {
  const [ok, setOk] = useState(() => window.matchMedia('(min-width: 640px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)')
    const fn = (e: MediaQueryListEvent) => setOk(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])
  return ok
}

interface Props {
  desde: string
  hasta: string
  onChange: (desde: string, hasta: string) => void
}

export function RangoFechasPicker({ desde, hasta, onChange }: Props) {
  const [abierto, setAbierto] = useState(false)
  // Seleccion en curso del calendario (permite un rango a medio elegir sin
  // disparar el reporte hasta tener los dos extremos)
  const [sel, setSel] = useState<DateRange | undefined>(undefined)
  const raiz = useRef<HTMLDivElement>(null)
  const esDesktop = useEsDesktop()

  useEffect(() => {
    if (!abierto) return
    function onClickFuera(e: MouseEvent) {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false)
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('mousedown', onClickFuera)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onClickFuera)
      document.removeEventListener('keydown', onEscape)
    }
  }, [abierto])

  // Al abrir, el calendario arranca en el rango aplicado
  useEffect(() => {
    if (abierto) setSel({ from: deISO(desde), to: deISO(hasta) })
  }, [abierto, desde, hasta])

  const presetActivo = useMemo(() => {
    return PRESETS.find((p) => {
      const r = p.rango()
      return r.desde === desde && r.hasta === hasta
    })?.label
  }, [desde, hasta])

  function aplicarPreset(p: Preset) {
    const r = p.rango()
    onChange(r.desde, r.hasta)
    setAbierto(false)
  }

  function onSelectCalendario(r: DateRange | undefined) {
    setSel(r)
    if (r?.from && r?.to) onChange(aISO(r.from), aISO(r.to))
  }

  const labelRango =
    desde === hasta ? formatDia(desde, 'd MMM yyyy') : `${formatDia(desde, 'd MMM yyyy')} – ${formatDia(hasta, 'd MMM yyyy')}`

  const chipPreset = (p: Preset) => (
    <button
      key={p.label}
      type="button"
      aria-pressed={presetActivo === p.label}
      onClick={() => aplicarPreset(p)}
      className={cn(
        'h-11 sm:h-9 px-3 rounded-full text-sm font-medium whitespace-nowrap cursor-pointer text-left transition-colors duration-150',
        'focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60',
        presetActivo === p.label
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted/60 text-foreground hover:bg-muted',
      )}
    >
      {p.label}
    </button>
  )

  return (
    <div ref={raiz} className="relative">
      <button
        id="rango-fechas"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className={cn(
          'inline-flex items-center gap-2 h-11 px-3 border border-input bg-card text-foreground rounded-lg text-sm font-medium cursor-pointer',
          'hover:bg-muted/60 focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150',
        )}
      >
        <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="tabular-nums">{labelRango}</span>
        <ChevronDown
          className={cn('h-4 w-4 text-muted-foreground transition-transform duration-150', abierto && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {abierto && (
        <div
          role="dialog"
          aria-label="Elegir rango de fechas"
          className={cn(
            'absolute left-0 top-full mt-2 z-50 max-w-[calc(100vw-2rem)]',
            'bg-card border border-input rounded-xl shadow-lg p-3',
            'flex flex-col sm:flex-row gap-3',
          )}
        >
          {/* Presets: columna en desktop, chips scrolleables en celular */}
          <div className="flex sm:flex-col gap-1.5 overflow-x-auto sm:overflow-visible sm:w-40 shrink-0 pb-1 sm:pb-0">
            {PRESETS.map(chipPreset)}
          </div>

          <div className="flex flex-col gap-3 sm:border-l sm:border-input sm:pl-3">
            <DayPicker
              mode="range"
              locale={es}
              weekStartsOn={1}
              numberOfMonths={esDesktop ? 2 : 1}
              defaultMonth={deISO(desde)}
              selected={sel}
              onSelect={onSelectCalendario}
              classNames={{
                months: 'flex gap-4',
                month: 'flex flex-col gap-2',
                month_caption: 'flex justify-center items-center h-9',
                caption_label: 'text-sm font-semibold text-foreground capitalize',
                nav: 'absolute inset-x-3 top-3 flex justify-between z-10',
                button_previous:
                  'h-9 w-9 inline-flex items-center justify-center rounded-lg text-muted-foreground cursor-pointer hover:bg-muted/60 focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150',
                button_next:
                  'h-9 w-9 inline-flex items-center justify-center rounded-lg text-muted-foreground cursor-pointer hover:bg-muted/60 focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150',
                chevron: 'h-4 w-4 fill-current',
                month_grid: 'border-collapse',
                weekdays: '',
                weekday: 'h-8 w-10 sm:w-9 text-[11px] font-medium text-muted-foreground uppercase',
                week: '',
                day: 'p-0 text-center',
                day_button:
                  'h-10 w-10 sm:h-9 sm:w-9 inline-flex items-center justify-center text-sm tabular-nums cursor-pointer rounded-lg hover:bg-muted/60 focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150',
                today: 'font-bold text-primary',
                outside: 'text-muted-foreground/40',
                range_start:
                  'bg-primary/15 rounded-l-lg [&>button]:bg-primary [&>button]:hover:bg-primary [&>button]:text-primary-foreground [&>button]:font-semibold',
                range_middle: 'bg-primary/15 [&>button]:rounded-none',
                range_end:
                  'bg-primary/15 rounded-r-lg [&>button]:bg-primary [&>button]:hover:bg-primary [&>button]:text-primary-foreground [&>button]:font-semibold',
                hidden: 'invisible',
              }}
              className="relative"
            />

            {/* Via exacta: inputs nativos (en celular abren el picker nativo) */}
            <div className="flex gap-3 sm:justify-end">
              <div className="flex flex-col gap-1 flex-1 sm:flex-none sm:w-40">
                <label htmlFor="rango-desde" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Desde
                </label>
                <input
                  id="rango-desde"
                  type="date"
                  value={desde}
                  max={hasta}
                  onChange={(e) => e.target.value && onChange(e.target.value, hasta)}
                  className={inputUI}
                />
              </div>
              <div className="flex flex-col gap-1 flex-1 sm:flex-none sm:w-40">
                <label htmlFor="rango-hasta" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Hasta
                </label>
                <input
                  id="rango-hasta"
                  type="date"
                  value={hasta}
                  min={desde}
                  onChange={(e) => e.target.value && onChange(desde, e.target.value)}
                  className={inputUI}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
