import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Plus, Pencil, Trash2, Receipt } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatMoneda, formatDia, cn } from '../../lib/utils'
import { inputUI, btnPrimaryUI, btnIconUI, cardUI, chipIconUI } from '../../lib/ui'
import { useAuthStore } from '../../stores/auth.store'
import { ConfirmarModal } from '../../components/shared/ConfirmarModal'
import { GastoModal, type GastoEditable } from './GastoModal'

interface TipoGasto { id: number; nombre: string }

export function GastosPage() {
  const user = useAuthStore((s) => s.user)
  const esAdmin = user?.rol === 'ADMIN'
  const qc = useQueryClient()

  // Default: los gastos de HOY (decision owner 2026-06-12); el rango se
  // amplia con los filtros de fecha
  const [desde, setDesde] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [hasta, setHasta] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [tipoGastoId, setTipoGastoId] = useState('')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [gastoEdit, setGastoEdit] = useState<GastoEditable | null>(null)
  const [gastoBorrar, setGastoBorrar] = useState<any | null>(null)

  const { data: tiposGasto = [] } = useQuery<TipoGasto[]>({
    queryKey: ['tipos-gasto', 'activos'],
    queryFn: () => api.get('/tipos-gasto/activos').then((r) => r.data),
  })

  const { data: gastos = [], isLoading } = useQuery<any[]>({
    queryKey: ['gastos', desde, hasta, tipoGastoId],
    queryFn: () =>
      api
        .get(`/gastos?desde=${desde}&hasta=${hasta}${tipoGastoId ? `&tipoGastoId=${tipoGastoId}` : ''}`)
        .then((r) => r.data),
  })

  const borrar = useMutation({
    mutationFn: (id: number) => api.delete(`/gastos/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gastos'] })
      qc.invalidateQueries({ queryKey: ['gastos-resumen'] })
      qc.invalidateQueries({ queryKey: ['caja-hoy'] })
      setGastoBorrar(null)
    },
  })

  const total = gastos.reduce((acc, g) => acc + Number(g.monto), 0)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b bg-card">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <span className={chipIconUI}>
            <Receipt className="h-4 w-4" aria-hidden="true" />
          </span>
          Gastos
        </h1>
        <button onClick={() => { setGastoEdit(null); setModalAbierto(true) }} className={btnPrimaryUI}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nuevo gasto
        </button>
      </div>

      <div className="p-4 sm:p-6 flex-1 overflow-auto space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="gastos-desde" className="sr-only">Desde</label>
          <input id="gastos-desde" type="date" value={desde}
            onChange={(e) => setDesde(e.target.value)} className={cn(inputUI, 'w-auto')} />
          <span className="text-muted-foreground/70">a</span>
          <label htmlFor="gastos-hasta" className="sr-only">Hasta</label>
          <input id="gastos-hasta" type="date" value={hasta}
            onChange={(e) => setHasta(e.target.value)} className={cn(inputUI, 'w-auto')} />
          <select value={tipoGastoId} onChange={(e) => setTipoGastoId(e.target.value)}
            aria-label="Filtrar por tipo de gasto" className={cn(inputUI, 'w-auto')}>
            <option value="">Todos los tipos</option>
            {tiposGasto.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <div className="text-center text-muted-foreground py-8">Cargando...</div>
        ) : (
          <div className={cn(cardUI, 'overflow-x-auto')}>
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Fecha</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Categoría</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Descripción</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Personal</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Cuenta</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Monto</th>
                  {esAdmin && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {gastos.map((g) => (
                  <tr key={g.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors duration-150">
                    <td className="px-4 py-3 tabular-nums">{formatDia(g.fecha)}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs bg-muted text-foreground px-2 py-0.5 rounded-full font-medium">
                        {g.tipoGasto?.nombre ?? '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground">{g.descripcion}</td>
                    <td className="px-4 py-3 text-muted-foreground">{g.personal || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{g.tipoCuenta?.nombre ?? '-'}</td>
                    <td className="px-4 py-3 text-right font-medium text-destructive tabular-nums">
                      {formatMoneda(Number(g.monto))}
                    </td>
                    {esAdmin && (
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex gap-1">
                          <button
                            onClick={() => { setGastoEdit(g); setModalAbierto(true) }}
                            aria-label={`Editar gasto ${g.descripcion}`}
                            className={cn(btnIconUI, 'h-8 w-8 text-muted-foreground/70 hover:text-foreground hover:bg-muted')}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            onClick={() => setGastoBorrar(g)}
                            aria-label={`Borrar gasto ${g.descripcion}`}
                            className={cn(btnIconUI, 'h-8 w-8 text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10')}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
                {gastos.length === 0 && (
                  <tr>
                    <td colSpan={esAdmin ? 7 : 6} className="px-4 py-8 text-center text-muted-foreground/70">
                      Sin gastos en el periodo
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-muted/50 border-t">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-sm text-muted-foreground">
                    {gastos.length} gasto{gastos.length !== 1 ? 's' : ''} en el periodo
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-destructive tabular-nums">
                    {formatMoneda(total)}
                  </td>
                  {esAdmin && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {modalAbierto && (
        <GastoModal gasto={gastoEdit} onClose={() => setModalAbierto(false)} />
      )}

      {gastoBorrar && (
        <ConfirmarModal
          titulo="Borrar gasto"
          mensaje={`Se borra el gasto "${gastoBorrar.descripcion}" de ${formatMoneda(Number(gastoBorrar.monto))}. Si era en efectivo, el arqueo del dÃ­a se corrige automÃ¡ticamente.`}
          confirmLabel="Borrar gasto"
          pendiente={borrar.isPending}
          onConfirm={() => borrar.mutate(gastoBorrar.id)}
          onClose={() => setGastoBorrar(null)}
        />
      )}
    </div>
  )
}
