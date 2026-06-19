import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Layers2, ShieldCheck, ChevronLeft, Check } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn } from '../../lib/utils'
import { btnPrimaryUI, btnIconUI, btnOutlineUI, cardUI } from '../../lib/ui'
import { AseguradoraModal } from './AseguradoraModal'
import { CategoriaSeguroModal } from './CategoriaSeguroModal'
import { TarifarioPanel } from './TarifarioPanel'
import { ConfirmarModal } from '../../components/shared/ConfirmarModal'
import { EmptyState } from '../../components/shared/EmptyState'
import { ErrorState } from '../../components/shared/ErrorState'

interface Aseguradora {
  id: number
  nombre: string
  contacto?: string | null
  telefono?: string | null
  email?: string | null
  observaciones?: string | null
  activo: boolean
}

interface CategoriaSeguro {
  id: number
  nombre: string
  porcentajeCobertura: string | number
  activo: boolean
  aseguradoraId: number
}

export function AseguradorasPanel() {
  const qc = useQueryClient()

  // ── Estado de la lista de aseguradoras ─────────────────────────────────────
  const [modalEdit, setModalEdit] = useState<Aseguradora | null | undefined>(undefined)
  const [modalOpen, setModalOpen] = useState(false)
  const [borrar, setBorrar] = useState<Aseguradora | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // ── Drill-in: aseguradora seleccionada ─────────────────────────────────────
  const [gestion, setGestion] = useState<Aseguradora | null>(null)

  // ── Estado dentro del drill-in ─────────────────────────────────────────────
  const [catModalEdit, setCatModalEdit] = useState<CategoriaSeguro | null | undefined>(undefined)
  const [catModalOpen, setCatModalOpen] = useState(false)
  const [catBorrar, setCatBorrar] = useState<CategoriaSeguro | null>(null)
  const [catAviso, setCatAviso] = useState<string | null>(null)
  const [catSelId, setCatSelId] = useState<number | null>(null)
  const [catSelNombre, setCatSelNombre] = useState<string | undefined>(undefined)

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: aseguradoras = [], isError, isLoading, refetch } = useQuery<Aseguradora[]>({
    queryKey: ['aseguradoras', 'todos'],
    queryFn: () => api.get('/aseguradoras?todos=true').then((r) => r.data),
  })

  const { data: categorias = [], isLoading: cargandoCats } = useQuery<CategoriaSeguro[]>({
    queryKey: ['categorias-seguro', gestion?.id],
    queryFn: () =>
      api.get(`/categorias-seguro?aseguradoraId=${gestion!.id}`).then((r) => r.data),
    enabled: gestion !== null,
  })

  // ── Mutaciones ─────────────────────────────────────────────────────────────
  const borrarMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/aseguradoras/${id}`).then((r) => r.data),
    onSuccess: (res: { eliminado: boolean }) => {
      qc.invalidateQueries({ queryKey: ['aseguradoras'] })
      setBorrar(null)
      if (res?.eliminado === false) {
        setAviso(
          'Esta aseguradora ya tiene categorías registradas, así que no se pudo eliminar. Se marcó como inactiva para que no aparezca en nuevos registros.',
        )
      }
    },
  })

  const borrarCatMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/categorias-seguro/${id}`).then((r) => r.data),
    onSuccess: (res: { eliminado: boolean }) => {
      qc.invalidateQueries({ queryKey: ['categorias-seguro', gestion?.id] })
      setCatBorrar(null)
      // Si la categoria eliminada era la seleccionada para tarifario, limpiar
      if (catBorrar && catSelId === catBorrar.id) {
        setCatSelId(null)
        setCatSelNombre(undefined)
      }
      if (res?.eliminado === false) {
        setCatAviso(
          'Esta categoría ya tiene tarifas registradas, así que no se pudo eliminar. Se marcó como inactiva para que no aparezca en nuevos registros.',
        )
      }
    },
  })

  // ── Handlers ───────────────────────────────────────────────────────────────
  function onGestionar(aseguradora: Aseguradora) {
    setGestion(aseguradora)
    setCatSelId(null)
    setCatSelNombre(undefined)
  }

  function onVolver() {
    setGestion(null)
    setCatSelId(null)
    setCatSelNombre(undefined)
    setCatModalOpen(false)
    setCatBorrar(null)
    setCatAviso(null)
  }

  function onSeleccionarCategoria(cat: CategoriaSeguro) {
    if (catSelId === cat.id) {
      setCatSelId(null)
      setCatSelNombre(undefined)
    } else {
      setCatSelId(cat.id)
      setCatSelNombre(cat.nombre)
    }
  }

  // ── Error global ───────────────────────────────────────────────────────────
  if (isError) return <ErrorState onRetry={() => refetch()} />

  // ══════════════════════════════════════════════════════════════════════════
  // DRILL-IN: gestión de categorías y tarifario de una aseguradora
  // ══════════════════════════════════════════════════════════════════════════
  if (gestion) {
    return (
      <div className="space-y-6">
        {/* Cabecera del drill-in */}
        <div className="flex items-center gap-3">
          <button
            onClick={onVolver}
            className={cn(btnOutlineUI, 'h-9 px-3 text-sm gap-1.5')}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Volver
          </button>
          <div>
            <h2 className="text-base font-semibold text-foreground leading-tight">
              {gestion.nombre}
            </h2>
            <p className="text-xs text-muted-foreground">Categorías y tarifario</p>
          </div>
        </div>

        {/* ── Sección: Categorías ───────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Categorías
            </h3>
            <button
              onClick={() => { setCatModalEdit(null); setCatModalOpen(true) }}
              className={cn(btnPrimaryUI, 'h-9 px-3')}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Nueva categoría
            </button>
          </div>

          <div className={cn(cardUI, 'overflow-x-auto')}>
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nombre</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground tabular-nums">
                    % Cobertura
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {cargandoCats && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">
                      Cargando...
                    </td>
                  </tr>
                )}
                {!cargandoCats && categorias.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-2">
                      <EmptyState
                        icon={Layers2}
                        title="Sin categorías"
                        description="Agregá la primera categoría con «Nueva categoría»."
                        className="py-8"
                      />
                    </td>
                  </tr>
                )}
                {categorias.map((cat) => {
                  const seleccionada = catSelId === cat.id
                  return (
                    <tr
                      key={cat.id}
                      className={cn(
                        'border-b last:border-0 transition-colors duration-150',
                        seleccionada
                          ? 'bg-primary/5 hover:bg-primary/8'
                          : 'hover:bg-muted/40',
                      )}
                    >
                      <td className="px-4 py-3 font-medium">{cat.nombre}</td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {cat.porcentajeCobertura != null
                          ? `${Number(cat.porcentajeCobertura)}%`
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            cat.activo
                              ? 'bg-accent/10 text-accent'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {cat.activo ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center gap-1.5">
                          {/* Seleccionar para tarifario */}
                          <button
                            onClick={() => onSeleccionarCategoria(cat)}
                            aria-label={
                              seleccionada
                                ? `Deseleccionar ${cat.nombre}`
                                : `Seleccionar ${cat.nombre} para tarifario`
                            }
                            aria-pressed={seleccionada}
                            className={cn(
                              btnOutlineUI,
                              'h-8 px-2 text-xs gap-1 transition-colors duration-150',
                              seleccionada
                                ? 'border-primary/40 text-primary bg-primary/5 hover:bg-primary/10'
                                : 'border-muted-foreground/25 text-muted-foreground hover:text-foreground',
                            )}
                          >
                            {seleccionada ? (
                              <>
                                <Check className="h-3 w-3" aria-hidden="true" />
                                Seleccionada
                              </>
                            ) : (
                              'Tarifario'
                            )}
                          </button>
                          {/* Editar */}
                          <button
                            onClick={() => { setCatModalEdit(cat); setCatModalOpen(true) }}
                            aria-label={`Editar categoría ${cat.nombre}`}
                            className={cn(
                              btnIconUI,
                              'text-muted-foreground/70 hover:text-foreground hover:bg-muted',
                            )}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </button>
                          {/* Eliminar */}
                          <button
                            onClick={() => setCatBorrar(cat)}
                            aria-label={`Eliminar categoría ${cat.nombre}`}
                            className={cn(
                              btnIconUI,
                              'text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10',
                            )}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Sección: Tarifario ────────────────────────────────────────── */}
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Tarifario
          </h3>
          <TarifarioPanel
            categoriaSeguroId={catSelId}
            categoriaNombre={catSelNombre}
          />
        </section>

        {/* ── Modales del drill-in ───────────────────────────────────────── */}
        {catModalOpen && (
          <CategoriaSeguroModal
            categoria={catModalEdit}
            aseguradoraId={gestion.id}
            onClose={() => { setCatModalOpen(false); setCatModalEdit(undefined) }}
          />
        )}

        {catBorrar && (
          <ConfirmarModal
            titulo="Eliminar categoría"
            mensaje={`Se elimina "${catBorrar.nombre}". Si ya tiene tarifas registradas no se puede borrar: en ese caso se marca como inactiva y deja de aparecer en nuevos registros.`}
            confirmLabel="Eliminar"
            pendiente={borrarCatMutation.isPending}
            onConfirm={() => borrarCatMutation.mutate(catBorrar.id)}
            onClose={() => setCatBorrar(null)}
          />
        )}

        {catAviso && (
          <ConfirmarModal
            titulo="No se pudo eliminar"
            mensaje={catAviso}
            confirmLabel="Entendido"
            onConfirm={() => setCatAviso(null)}
            onClose={() => setCatAviso(null)}
          />
        )}
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LISTA DE ASEGURADORAS
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Aseguradoras
        </h2>
        <button
          onClick={() => { setModalEdit(null); setModalOpen(true) }}
          className={cn(btnPrimaryUI, 'h-9 px-3')}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Nueva aseguradora
        </button>
      </div>

      <div className={cn(cardUI, 'overflow-x-auto')}>
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nombre</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contacto</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Teléfono</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Cargando...
                </td>
              </tr>
            )}
            {!isLoading && aseguradoras.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-2">
                  <EmptyState
                    icon={ShieldCheck}
                    title="Sin aseguradoras"
                    description="Agregá tu primera aseguradora con «Nueva aseguradora»."
                    className="py-8"
                  />
                </td>
              </tr>
            )}
            {aseguradoras.map((a) => (
              <tr
                key={a.id}
                className="border-b last:border-0 hover:bg-muted/40 transition-colors duration-150"
              >
                <td className="px-4 py-3 font-medium">{a.nombre}</td>
                <td className="px-4 py-3 text-muted-foreground">{a.contacto ?? '—'}</td>
                <td className="px-4 py-3 text-muted-foreground tabular-nums">
                  {a.telefono ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      a.activo
                        ? 'bg-accent/10 text-accent'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {a.activo ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="inline-flex items-center gap-1.5">
                    <button
                      onClick={() => onGestionar(a)}
                      aria-label={`Categorías y tarifario de ${a.nombre}`}
                      className={cn(
                        btnOutlineUI,
                        'h-9 px-3 text-xs gap-1.5 border-muted-foreground/25 text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <Layers2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Categorías y tarifario
                    </button>
                    <button
                      onClick={() => { setModalEdit(a); setModalOpen(true) }}
                      aria-label={`Editar ${a.nombre}`}
                      className={cn(
                        btnIconUI,
                        'text-muted-foreground/70 hover:text-foreground hover:bg-muted',
                      )}
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => setBorrar(a)}
                      aria-label={`Eliminar ${a.nombre}`}
                      className={cn(
                        btnIconUI,
                        'text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10',
                      )}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <AseguradoraModal
          aseguradora={modalEdit}
          onClose={() => { setModalOpen(false); setModalEdit(undefined) }}
        />
      )}

      {borrar && (
        <ConfirmarModal
          titulo="Eliminar aseguradora"
          mensaje={`Se elimina "${borrar.nombre}". Si ya tiene categorías registradas no se puede borrar: en ese caso se marca como inactiva y deja de aparecer en nuevos registros.`}
          confirmLabel="Eliminar"
          pendiente={borrarMutation.isPending}
          onConfirm={() => borrarMutation.mutate(borrar.id)}
          onClose={() => setBorrar(null)}
        />
      )}

      {aviso && (
        <ConfirmarModal
          titulo="No se pudo eliminar"
          mensaje={aviso}
          confirmLabel="Entendido"
          onConfirm={() => setAviso(null)}
          onClose={() => setAviso(null)}
        />
      )}
    </div>
  )
}
