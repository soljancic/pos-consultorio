import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { cn } from '../../lib/utils'
import { PAISES, paisDe, banderaDe } from '../../lib/paises'

interface Props {
  value: string
  onChange: (codigo: string) => void
  disabled?: boolean
  // Override del estilo del boton (alto/bordes) para alinear con distintos inputs
  buttonClassName?: string
}

// Selector compacto de pais para acompanar un input de telefono: boton con
// la bandera + dropdown con buscador (patron intl-tel-input, sin dependencias).
export function SelectorPais({ value, onChange, disabled, buttonClassName }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const contenedorRef = useRef<HTMLDivElement>(null)
  const busquedaRef = useRef<HTMLInputElement>(null)
  const seleccionado = paisDe(value)

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return PAISES
    return PAISES.filter((p) => p.nombre.toLowerCase().includes(q) || p.dial.includes(q.replace('+', '')))
  }, [busqueda])

  useEffect(() => {
    if (!abierto) return
    busquedaRef.current?.focus()
    function onMouseDown(e: MouseEvent) {
      if (!contenedorRef.current?.contains(e.target as Node)) setAbierto(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [abierto])

  function elegir(codigo: string) {
    onChange(codigo)
    setAbierto(false)
    setBusqueda('')
  }

  return (
    <div ref={contenedorRef} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setAbierto((a) => !a)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label={`País: ${seleccionado.nombre} +${seleccionado.dial}`}
        title={`${seleccionado.nombre} +${seleccionado.dial}`}
        className={cn(
          'inline-flex items-center gap-1 px-2.5 border border-input bg-card text-base cursor-pointer hover:bg-muted/60 focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:border-ring disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-150',
          buttonClassName ?? 'h-10 rounded-md',
        )}
      >
        <span aria-hidden="true">{banderaDe(seleccionado.codigo)}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      </button>

      {abierto && (
        <div className="absolute z-50 mt-1 left-0 w-64 bg-card rounded-md border shadow-lg overflow-hidden">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <input
                ref={busquedaRef}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar..."
                aria-label="Buscar país"
                className="w-full h-8 border border-input bg-card rounded-md pl-8 pr-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:border-ring"
              />
            </div>
          </div>
          <ul role="listbox" aria-label="País" className="max-h-56 overflow-y-auto py-1">
            {filtrados.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</li>
            )}
            {filtrados.map((p) => (
              <li key={p.codigo} role="option" aria-selected={p.codigo === seleccionado.codigo}>
                <button
                  type="button"
                  onClick={() => elegir(p.codigo)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left cursor-pointer hover:bg-muted/60 transition-colors duration-150',
                    p.codigo === seleccionado.codigo && 'bg-primary/10 font-medium',
                  )}
                >
                  <span aria-hidden="true">{banderaDe(p.codigo)}</span>
                  <span className="flex-1 text-foreground">{p.nombre}</span>
                  <span className="text-muted-foreground tabular-nums">+{p.dial}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
