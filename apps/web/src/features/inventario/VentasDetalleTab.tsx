import { useState, useEffect, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Search, RotateCcw, ShoppingCart } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatMoneda, formatFecha, cn } from '../../lib/utils'
import { inputUI, cardUI } from '../../lib/ui'
import { EmptyState } from '../../components/shared/EmptyState'
import { ErrorState } from '../../components/shared/ErrorState'
import { TableSkeleton } from '../../components/shared/Skeleton'
import { DevolverItemModal, type VentaDetalleRow } from './DevolverItemModal'

const LIMIT = 50

export function VentasDetalleTab() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [aDevolver, setADevolver] = useState<VentaDetalleRow | null>(null)
  const sentinelRef = useRef<HTMLTableRowElement | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function handleSearch(value: string) {
    setSearch(value)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setDebouncedSearch(value), 300)
  }

  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<{ items: VentaDetalleRow[]; total: number }>({
    queryKey: ['ventas-detalle', { search: debouncedSearch }],
    queryFn: ({ pageParam }) =>
      api
        .get(
          `/cobros/ventas-detalle?page=${pageParam}&limit=${LIMIT}${
            debouncedSearch ? `&q=${encodeURIComponent(debouncedSearch)}` : ''
          }`,
        )
        .then((r) => r.data),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const cargados = allPages.reduce((n, p) => n + p.items.length, 0)
      return cargados < lastPage.total ? allPages.length + 1 : undefined
    },
  })

  const filas = data?.pages.flatMap((p) => p.items) ?? []
  const total = data?.pages[0]?.total ?? 0

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasNextPage) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) fetchNextPage()
      },
      { rootMargin: '200px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <div className="space-y-4">
      {/* Búsqueda */}
      <div className="relative sm:max-w-md">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70"
          aria-hidden="true"
        />
        <input
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Buscar por producto o paciente..."
          aria-label="Buscar ventas"
          className={cn(inputUI, 'pl-9')}
        />
      </div>

      {/* Contenido principal — aria-live para anunciar cambios de resultados */}
      <div aria-live="polite" aria-atomic="false">
        {isLoading ? (
          <TableSkeleton cols={6} />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : filas.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="No hay ventas de productos"
            description={
              debouncedSearch
                ? 'Probá con otro término.'
                : 'Las ventas confirmadas aparecerán acá.'
            }
            className="py-12"
          />
        ) : (
          <div className={cn(cardUI, 'overflow-x-auto')}>
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Fecha
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Producto
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Paciente
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                    Cant.
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                    Subtotal
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr
                    key={f.detalleId}
                    className={cn(
                      'border-b last:border-0 hover:bg-muted/40 transition-colors duration-150',
                      // Filas ya devueltas receden visualmente; las activas destacan.
                      f.devueltoAt && 'opacity-60',
                    )}
                  >
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums text-muted-foreground">
                      {formatFecha(f.fecha)}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground max-w-[200px] truncate">
                      {f.producto}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[180px] truncate">
                      {f.paciente ?? 'Mostrador'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{f.cantidad}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatMoneda(Number(f.subtotal))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {f.devueltoAt ? (
                        // Badge color + forma: ícono RotateCcw + texto (no solo color).
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                          <RotateCcw className="h-3 w-3" aria-hidden="true" />
                          Devuelto
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setADevolver(f)}
                          // aria-label descriptivo por fila para lectores de pantalla.
                          aria-label={`Deshacer venta de ${f.producto}`}
                          className={cn(
                            // h-11 = 44px, toque minimo accesible.
                            'inline-flex h-11 items-center gap-1.5 rounded-lg border border-input px-3',
                            'text-sm font-medium text-foreground cursor-pointer',
                            'hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60',
                            'transition-colors duration-150',
                          )}
                        >
                          <RotateCcw className="h-4 w-4" aria-hidden="true" />
                          Deshacer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {hasNextPage && (
                  <tr ref={sentinelRef}>
                    <td
                      colSpan={6}
                      className="px-4 py-4 text-center text-sm text-muted-foreground"
                    >
                      {isFetchingNextPage ? 'Cargando más...' : ''}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Conteo de resultados */}
      {!isLoading && !isError && total > 0 && (
        <p className="text-xs text-muted-foreground tabular-nums">
          {filas.length} de {total} {total === 1 ? 'venta' : 'ventas'}
        </p>
      )}

      {/* Modal de confirmación de devolución */}
      {aDevolver && (
        <DevolverItemModal venta={aDevolver} onClose={() => setADevolver(null)} />
      )}
    </div>
  )
}
