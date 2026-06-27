import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Plus, Minus, Trash2, AlertTriangle, Package } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatMoneda, cn } from '../../lib/utils'
import { inputUI } from '../../lib/ui'

// Una linea de venta de producto, en la forma que la UI necesita para
// pintarse (nombre + precio congelado + stock para la alerta). El editor es
// CONTROLADO: el padre es dueno del array `lineas` y recibe los cambios por
// `onChange`. No conoce cobros ni citas: Task 10 (cobro de cita) y Task 11
// (venta directa) lo reusan pasando/recibiendo este mismo shape.
export interface LineaUI {
  productoId: number
  nombre: string
  precioVenta: number
  cantidad: number
  stockActual: number
  controlaStock: boolean
}

interface Props {
  lineas: LineaUI[]
  onChange: (lineas: LineaUI[]) => void
  // true cuando la venta ya esta confirmada: oculta buscador y controles de
  // cantidad y deja la grilla en modo solo-lectura.
  disabled?: boolean
}

// Producto vendible tal cual lo devuelve GET /productos/vendibles (Decimal de
// Prisma llega como string; se convierte con Number() al agregar la linea).
interface ProductoVendible {
  id: number
  nombre: string
  precioVenta: string | number
  stockActual: number
  controlaStock: boolean
}

export function LineasProductoEditor({ lineas, onChange, disabled = false }: Props) {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [abierto, setAbierto] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function handleSearch(value: string) {
    setSearch(value)
    setAbierto(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setDebounced(value.trim()), 300)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  // El buscador solo consulta cuando el editor esta activo. queryKey jerarquica
  // ['productos','vendibles',search] para no pisar la cache del catalogo paginado.
  const { data: resultados = [], isFetching } = useQuery<ProductoVendible[]>({
    queryKey: ['productos', 'vendibles', debounced],
    queryFn: () =>
      api
        .get(`/productos/vendibles${debounced ? `?search=${encodeURIComponent(debounced)}` : ''}`)
        .then((r) => r.data),
    enabled: !disabled && abierto,
    staleTime: 30_000,
  })

  function agregar(p: ProductoVendible) {
    const existente = lineas.find((l) => l.productoId === p.id)
    if (existente) {
      onChange(
        lineas.map((l) =>
          l.productoId === p.id ? { ...l, cantidad: l.cantidad + 1 } : l,
        ),
      )
    } else {
      onChange([
        ...lineas,
        {
          productoId: p.id,
          nombre: p.nombre,
          precioVenta: Number(p.precioVenta),
          cantidad: 1,
          stockActual: p.stockActual,
          controlaStock: p.controlaStock,
        },
      ])
    }
    // Foco queda en el buscador para seguir agregando en pocos clics.
    setSearch('')
    setDebounced('')
    setAbierto(false)
  }

  function setCantidad(productoId: number, cantidad: number) {
    if (cantidad <= 0) {
      onChange(lineas.filter((l) => l.productoId !== productoId))
      return
    }
    onChange(lineas.map((l) => (l.productoId === productoId ? { ...l, cantidad } : l)))
  }

  function quitar(productoId: number) {
    onChange(lineas.filter((l) => l.productoId !== productoId))
  }

  const subtotalProductos = lineas.reduce((s, l) => s + l.precioVenta * l.cantidad, 0)

  return (
    <div className="space-y-3">
      {/* Buscador de vendibles: solo en modo edicion */}
      {!disabled && (
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70"
            aria-hidden="true"
          />
          <input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => setAbierto(true)}
            placeholder="Agregar producto..."
            aria-label="Buscar producto para agregar"
            className={cn(inputUI, 'pl-9')}
          />

          {/* Resultados: panel inline (no absolute) para no recortarse dentro
              del modal con overflow. Se ve cuando hay foco/busqueda activa. */}
          {abierto && (search.length > 0 || isFetching) && (
            <div className="mt-1.5 rounded-lg border bg-card shadow-xs overflow-hidden">
              {isFetching && resultados.length === 0 ? (
                <p className="px-3 py-3 text-sm text-muted-foreground">Buscando...</p>
              ) : resultados.length === 0 ? (
                <p className="px-3 py-3 text-sm text-muted-foreground">
                  No se encontraron productos vendibles.
                </p>
              ) : (
                <ul className="max-h-56 overflow-y-auto divide-y" role="listbox" aria-label="Productos vendibles">
                  {resultados.map((p) => {
                    const sinStock = p.controlaStock && p.stockActual <= 0
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => agregar(p)}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60 focus-visible:outline-hidden focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 cursor-pointer transition-colors duration-150"
                        >
                          <Plus className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                          <span className="flex-1 min-w-0">
                            <span className="block truncate text-sm font-medium text-foreground">
                              {p.nombre}
                            </span>
                            {p.controlaStock && (
                              <span
                                className={cn(
                                  'text-xs tabular-nums',
                                  sinStock ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground',
                                )}
                              >
                                Stock: {p.stockActual}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-sm font-semibold text-foreground tabular-nums">
                            {formatMoneda(Number(p.precioVenta))}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Grilla de lineas */}
      {lineas.length === 0 ? (
        !disabled && (
          <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">
            <Package className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Sin productos. Buscá arriba para agregar.</span>
          </div>
        )
      ) : (
        <ul className="space-y-2">
          {lineas.map((l) => {
            const subtotal = l.precioVenta * l.cantidad
            const stockBajo = l.controlaStock && l.cantidad > l.stockActual
            return (
              <li
                key={l.productoId}
                className="rounded-lg border bg-card px-3 py-2.5 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{l.nombre}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatMoneda(l.precioVenta)} c/u
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-foreground tabular-nums">
                    {formatMoneda(subtotal)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  {disabled ? (
                    // Solo-lectura: la cantidad como texto, sin controles.
                    <span className="text-sm text-muted-foreground tabular-nums">
                      Cantidad: <span className="font-medium text-foreground">{l.cantidad}</span>
                    </span>
                  ) : (
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setCantidad(l.productoId, l.cantidad - 1)}
                        aria-label={`Quitar una unidad de ${l.nombre}`}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-input bg-card text-foreground hover:bg-muted/60 focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60 cursor-pointer transition-colors duration-150"
                      >
                        <Minus className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <span
                        className="min-w-10 text-center text-sm font-semibold text-foreground tabular-nums"
                        aria-live="polite"
                        aria-label={`Cantidad de ${l.nombre}`}
                      >
                        {l.cantidad}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCantidad(l.productoId, l.cantidad + 1)}
                        aria-label={`Agregar una unidad de ${l.nombre}`}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-input bg-card text-foreground hover:bg-muted/60 focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60 cursor-pointer transition-colors duration-150"
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  )}

                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => quitar(l.productoId)}
                      aria-label={`Quitar ${l.nombre}`}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10 focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60 cursor-pointer transition-colors duration-150"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>

                {/* Alerta de stock: color + icono + texto (no solo color). */}
                {stockBajo && (
                  <p
                    className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold tabular-nums"
                    role="status"
                  >
                    <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                    Stock: {l.stockActual}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Pie: subtotal de productos */}
      {lineas.length > 0 && (
        <div className="flex items-center justify-between border-t pt-2 text-sm">
          <span className="text-muted-foreground">Subtotal productos</span>
          <span className="font-semibold text-foreground tabular-nums">
            {formatMoneda(subtotalProductos)}
          </span>
        </div>
      )}
    </div>
  )
}
