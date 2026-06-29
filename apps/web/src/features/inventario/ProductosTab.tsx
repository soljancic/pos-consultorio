import { useState, useEffect, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Search, Plus, Package, AlertTriangle, Eye, EyeOff } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatMoneda, cn } from '../../lib/utils'
import { inputUI, btnPrimaryUI, cardUI } from '../../lib/ui'
import { EmptyState } from '../../components/shared/EmptyState'
import { ErrorState } from '../../components/shared/ErrorState'
import { TableSkeleton } from '../../components/shared/Skeleton'
import { ProductoModal, type Producto } from './ProductoModal'

const LIMIT = 50

export function ProductosTab() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [todos, setTodos] = useState(false)
  const [modalNuevo, setModalNuevo] = useState(false)
  const [editar, setEditar] = useState<Producto | null>(null)
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
  } = useInfiniteQuery<{ items: Producto[]; total: number }>({
    queryKey: ['productos', { search: debouncedSearch, todos }],
    queryFn: ({ pageParam }) =>
      api
        .get(
          `/productos?page=${pageParam}&limit=${LIMIT}${todos ? '&todos=true' : ''}${
            debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : ''
          }`,
        )
        .then((r) => r.data),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const cargados = allPages.reduce((n, p) => n + p.items.length, 0)
      return cargados < lastPage.total ? allPages.length + 1 : undefined
    },
  })

  const productos = data?.pages.flatMap((p) => p.items) ?? []
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
      {/* Barra de herramientas: buscar + archivados + nuevo */}
      <div className="flex flex-row items-center gap-2 sm:gap-3">
        <div className="relative flex-1 min-w-0 sm:max-w-md">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70"
            aria-hidden="true"
          />
          <input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Buscar por nombre o código..."
            aria-label="Buscar productos"
            className={cn(inputUI, 'pl-9')}
          />
        </div>
        {/* Mostrar archivados (toggle). En celular: solo el ojito (Eye cuando
            estan visibles, EyeOff cuando no). En sm+: el switch con texto. */}
        <button
          type="button"
          role="switch"
          aria-checked={todos}
          onClick={() => setTodos((v) => !v)}
          aria-label="Mostrar archivados"
          title={todos ? 'Ocultar archivados' : 'Mostrar archivados'}
          className={cn(
            'sm:hidden inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border cursor-pointer transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60',
            todos ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15' : 'border-input bg-card text-muted-foreground hover:bg-muted/40',
          )}
        >
          {todos ? <Eye className="h-4 w-4" aria-hidden="true" /> : <EyeOff className="h-4 w-4" aria-hidden="true" />}
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={todos}
          onClick={() => setTodos((v) => !v)}
          className={cn(
            'max-sm:hidden inline-flex h-11 items-center gap-2.5 rounded-lg border px-4 text-sm font-medium cursor-pointer transition-colors duration-150 focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60',
            todos ? 'border-input bg-muted/60 text-foreground' : 'border-input bg-card text-muted-foreground hover:bg-muted/40',
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200',
              todos ? 'bg-primary' : 'bg-muted-foreground/30',
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 rounded-full bg-white shadow-xs transition-transform duration-200',
                todos ? 'translate-x-[18px]' : 'translate-x-0.5',
              )}
            />
          </span>
          Mostrar archivados
        </button>
        <button onClick={() => setModalNuevo(true)} className={cn(btnPrimaryUI, 'shrink-0')} aria-label="Nuevo producto">
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Nuevo producto</span>
        </button>
      </div>

      {isLoading ? (
        <TableSkeleton cols={4} />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <div className={cn(cardUI, 'overflow-x-auto')}>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Producto</th>
                <th className="hidden sm:table-cell text-left px-4 py-3 font-medium text-muted-foreground">
                  Categoría
                </th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Precio</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Stock</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((p) => {
                const stockBajo = p.controlaStock && p.stockActual <= 0
                return (
                  <tr
                    key={p.id}
                    tabIndex={0}
                    role="button"
                    aria-label={`Editar ${p.nombre}`}
                    onClick={() => setEditar(p)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setEditar(p)
                      }
                    }}
                    className="border-b last:border-0 hover:bg-muted/60 focus-visible:outline-hidden focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 cursor-pointer transition-colors duration-150"
                  >
                    <td className="px-4 py-3">
                      <span className={cn('font-medium', !p.activo ? 'text-muted-foreground' : 'text-foreground')}>
                        {p.nombre}
                      </span>
                      <span className="sm:hidden block text-xs text-muted-foreground">
                        {p.categoria || 'Sin categoría'}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        {!p.habilitadoVenta && (
                          <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                            <EyeOff className="h-3 w-3" aria-hidden="true" /> No vendible
                          </span>
                        )}
                        {!p.activo && (
                          <span className="inline-flex items-center text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                            Archivado
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-muted-foreground">
                      {p.categoria || '-'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMoneda(Number(p.precioVenta))}</td>
                    <td className="px-4 py-3 text-right">
                      {p.controlaStock ? (
                        stockBajo ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold tabular-nums">
                            <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Sin stock
                          </span>
                        ) : (
                          <span className="tabular-nums text-foreground">{p.stockActual}</span>
                        )
                      ) : (
                        <span className="text-muted-foreground/70">-</span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {productos.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-2">
                    {debouncedSearch ? (
                      <EmptyState
                        icon={Search}
                        title="No se encontraron productos"
                        description="Probá con otro nombre o código."
                        className="py-8"
                      />
                    ) : (
                      <EmptyState
                        icon={Package}
                        title="No hay productos en el catálogo"
                        description="Cargá tu primer producto con «Nuevo producto»."
                        className="py-8"
                      />
                    )}
                  </td>
                </tr>
              )}
              {hasNextPage && (
                <tr ref={sentinelRef}>
                  <td colSpan={4} className="px-4 py-4 text-center text-sm text-muted-foreground">
                    {isFetchingNextPage ? 'Cargando más...' : ''}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && !isError && total > 0 && (
        <p className="text-xs text-muted-foreground tabular-nums">
          {productos.length} de {total} {total === 1 ? 'producto' : 'productos'}
        </p>
      )}

      {modalNuevo && <ProductoModal onClose={() => setModalNuevo(false)} />}
      {editar && <ProductoModal producto={editar} onClose={() => setEditar(null)} />}
    </div>
  )
}
