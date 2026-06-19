import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Layers2, ShieldCheck } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn } from '../../lib/utils'
import { btnPrimaryUI, btnIconUI, btnOutlineUI, cardUI } from '../../lib/ui'
import { AseguradoraModal } from './AseguradoraModal'
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

export function AseguradorasPanel() {
  const qc = useQueryClient()

  const [modalEdit, setModalEdit] = useState<Aseguradora | null | undefined>(undefined)
  const [modalOpen, setModalOpen] = useState(false)
  const [borrar, setBorrar] = useState<Aseguradora | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  // gestion: Task 9 consumirá este estado para el drill-in de categorías y tarifario
  const [_gestion, setGestion] = useState<Aseguradora | null>(null)

  const { data: aseguradoras = [], isError, isLoading, refetch } = useQuery<Aseguradora[]>({
    queryKey: ['aseguradoras', 'todos'],
    queryFn: () => api.get('/aseguradoras?todos=true').then((r) => r.data),
  })

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

  function onGestionar(aseguradora: Aseguradora) {
    setGestion(aseguradora)
    // Task 9: aquí se renderizará el drill-in de categorías y tarifario
  }

  if (isError) return <ErrorState onRetry={() => refetch()} />

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
