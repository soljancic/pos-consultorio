import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatMoneda, formatFecha, cn } from '../../lib/utils'
import { cardUI, chipIconUI, btnOutlineUI } from '../../lib/ui'
import { FloatingSelect } from '../../components/shared/FloatingSelect'
import { FloatingInput } from '../../components/shared/FloatingInput'
import { EmptyState } from '../../components/shared/EmptyState'
import { ErrorState } from '../../components/shared/ErrorState'
import { ExportButtons } from '../reportes/components/ExportButtons'
import { CampanaHeader } from '../notificaciones/CampanaHeader'
import { ConfirmarModal } from '../../components/shared/ConfirmarModal'
import { RechazarLiquidacionModal } from './RechazarLiquidacionModal'
import { toast } from '../../stores/toast.store'

// ─── Tipos locales ────────────────────────────────────────────────────────────

type EstadoLiquidacion = 'PENDIENTE' | 'FACTURADO' | 'PAGADO' | 'RECHAZADO'

interface FilaLiquidacion {
  id: number
  fecha: string
  estado: EstadoLiquidacion
  montoAseguradora: string
  codigoSeguro: string | null
  aseguradora: { id: number; nombre: string }
  paciente: { id: number; nombre: string; apellido: string }
  servicio: { id: number; nombre: string }
  categoriaSeguro: { id: number; nombre: string }
}

interface TotalesLiquidacion {
  pendiente: string
  facturado: string
  pagado: string
  rechazado: string
  cantidad: number
}

interface RespuestaLiquidaciones {
  rows: FilaLiquidacion[]
  total: number
  page: number
  pageSize: number
  totales: TotalesLiquidacion
}

interface AseguradoraActiva {
  id: number
  nombre: string
}

// ─── Badge de estado ──────────────────────────────────────────────────────────

const ESTADO_BADGE: Record<EstadoLiquidacion, { label: string; cls: string }> = {
  PENDIENTE:  { label: 'Pendiente',  cls: 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-400' },
  FACTURADO:  { label: 'Facturado',  cls: 'bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-400' },
  PAGADO:     { label: 'Pagado',     cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-400' },
  RECHAZADO:  { label: 'Rechazado',  cls: 'bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-400' },
}

const ESTADO_DOT: Record<EstadoLiquidacion, string> = {
  PENDIENTE:  'bg-amber-400',
  FACTURADO:  'bg-blue-400',
  PAGADO:     'bg-emerald-400',
  RECHAZADO:  'bg-red-400',
}

function EstadoBadge({ estado }: { estado: EstadoLiquidacion }) {
  const cfg = ESTADO_BADGE[estado] ?? { label: estado, cls: 'bg-muted text-muted-foreground' }
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium', cfg.cls)}>
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', ESTADO_DOT[estado])} aria-hidden="true" />
      {cfg.label}
    </span>
  )
}

// ─── Panel de totales ─────────────────────────────────────────────────────────

const TOTALES_CFG: Array<{ key: keyof TotalesLiquidacion; label: string; estado: EstadoLiquidacion }> = [
  { key: 'pendiente',  label: 'Pendiente',  estado: 'PENDIENTE'  },
  { key: 'facturado',  label: 'Facturado',  estado: 'FACTURADO'  },
  { key: 'pagado',     label: 'Pagado',     estado: 'PAGADO'     },
  { key: 'rechazado',  label: 'Rechazado',  estado: 'RECHAZADO'  },
]

function TotalesPanel({ totales }: { totales: TotalesLiquidacion | undefined }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {TOTALES_CFG.map(({ key, label, estado }) => (
        <div key={key} className={cn(cardUI, 'p-4')}>
          <div className="flex items-center gap-2 mb-1.5">
            <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', ESTADO_DOT[estado])} aria-hidden="true" />
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
          </div>
          <p className="text-lg font-semibold tabular-nums text-foreground">
            {totales ? formatMoneda(Number(totales[key])) : '—'}
          </p>
        </div>
      ))}
    </div>
  )
}

// ─── Tipos de estado de confirmación ─────────────────────────────────────────

type AccionConfirmar = 'FACTURADO' | 'PAGADO' | 'PENDIENTE'

interface ConfirmPendiente {
  id: number
  accion: AccionConfirmar
  descripcion: string
}

interface RechazoPendiente {
  id: number
  descripcion: string
}

// ─── Botones de acción por fila ───────────────────────────────────────────────

const BTN_SM_OUTLINE =
  'inline-flex items-center justify-center h-8 px-2.5 rounded-md border border-input bg-card text-xs font-medium text-foreground cursor-pointer hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150'

const BTN_SM_DESTRUCTIVE =
  'inline-flex items-center justify-center h-8 px-2.5 rounded-md border border-destructive/40 bg-destructive/5 text-xs font-medium text-destructive cursor-pointer hover:bg-destructive/15 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-destructive/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150'

interface AccionesCellProps {
  row: FilaLiquidacion
  mutando: boolean
  onConfirmar: (accion: AccionConfirmar, descripcion: string) => void
  onRechazar: (descripcion: string) => void
}

function AccionesCell({ row, mutando, onConfirmar, onRechazar }: AccionesCellProps) {
  const desc = `${row.paciente.nombre} ${row.paciente.apellido} — ${row.aseguradora.nombre}`

  if (row.estado === 'PAGADO') {
    return <span className="text-muted-foreground/40 text-xs select-none">—</span>
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {row.estado === 'PENDIENTE' && (
        <button
          type="button"
          disabled={mutando}
          className={BTN_SM_OUTLINE}
          onClick={() => onConfirmar('FACTURADO', desc)}
        >
          Facturar
        </button>
      )}

      {row.estado === 'FACTURADO' && (
        <button
          type="button"
          disabled={mutando}
          className={BTN_SM_OUTLINE}
          onClick={() => onConfirmar('PAGADO', desc)}
        >
          Marcar pagado
        </button>
      )}

      {row.estado === 'RECHAZADO' && (
        <button
          type="button"
          disabled={mutando}
          className={BTN_SM_OUTLINE}
          onClick={() => onConfirmar('PENDIENTE', desc)}
        >
          Reabrir
        </button>
      )}

      {(row.estado === 'PENDIENTE' || row.estado === 'FACTURADO') && (
        <button
          type="button"
          disabled={mutando}
          className={BTN_SM_DESTRUCTIVE}
          onClick={() => onRechazar(desc)}
        >
          Rechazar
        </button>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

const PAGE_SIZE = 25

export function LiquidacionesPage() {
  const [aseguradoraId, setAseguradoraId] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [estado, setEstado] = useState('')
  const [page, setPage] = useState(1)

  // Estado de modales de acción
  const [confirmPendiente, setConfirmPendiente] = useState<ConfirmPendiente | null>(null)
  const [rechazoPendiente, setRechazoPendiente] = useState<RechazoPendiente | null>(null)
  const qc = useQueryClient()

  const cambiarEstado = useMutation({
    mutationFn: ({ id, estado: nuevoEstado, motivo }: { id: number; estado: EstadoLiquidacion; motivo?: string }) =>
      api.patch(`/liquidaciones/${id}/estado`, { estado: nuevoEstado, ...(motivo ? { motivo } : {}) }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['liquidaciones'] })
      setConfirmPendiente(null)
      setRechazoPendiente(null)
    },
    onError: (err: any) => {
      toast.fromError(err, 'Error al cambiar el estado. Intenta de nuevo.')
    },
  })

  // Aseguradoras para el filtro
  const { data: aseguradoras = [] } = useQuery<AseguradoraActiva[]>({
    queryKey: ['aseguradoras', 'activas'],
    queryFn: () => api.get('/aseguradoras/activas').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })

  // Query principal
  const params: Record<string, string | number> = { page, pageSize: PAGE_SIZE }
  if (aseguradoraId) params.aseguradoraId = aseguradoraId
  if (desde) params.desde = desde
  if (hasta) params.hasta = hasta
  if (estado) params.estado = estado

  const { data, isLoading, isError, refetch } = useQuery<RespuestaLiquidaciones>({
    queryKey: ['liquidaciones', { aseguradoraId, desde, hasta, estado, page }],
    queryFn: () => api.get('/liquidaciones', { params }).then((r) => r.data),
  })

  // loadAll para ExportButtons
  const loadAll = async () => {
    const exportParams: Record<string, string | number> = { export: 1 }
    if (aseguradoraId) exportParams.aseguradoraId = aseguradoraId
    if (desde) exportParams.desde = desde
    if (hasta) exportParams.hasta = hasta
    if (estado) exportParams.estado = estado

    const res: RespuestaLiquidaciones = await api
      .get('/liquidaciones', { params: exportParams })
      .then((r) => r.data)

    return {
      headers: ['Fecha', 'Aseguradora', 'Paciente', 'Servicio', 'Código', 'Monto', 'Estado'],
      rows: res.rows.map((row) => [
        formatFecha(row.fecha),
        row.aseguradora.nombre,
        `${row.paciente.nombre} ${row.paciente.apellido}`,
        row.servicio.nombre,
        row.codigoSeguro ?? '',
        Number(row.montoAseguradora),
        row.estado,
      ]) as Array<Array<string | number>>,
    }
  }

  // Paginación
  const total = data?.total ?? 0
  const pageActual = data?.page ?? 1
  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function patchFiltros(patch: Partial<{ aseguradoraId: string; desde: string; hasta: string; estado: string }>) {
    if ('aseguradoraId' in patch) setAseguradoraId(patch.aseguradoraId ?? '')
    if ('desde' in patch) setDesde(patch.desde ?? '')
    if ('hasta' in patch) setHasta(patch.hasta ?? '')
    if ('estado' in patch) setEstado(patch.estado ?? '')
    setPage(1)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b bg-card print:hidden">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <span className={chipIconUI}>
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          </span>
          Liquidaciones
        </h1>
        <div className="flex items-center gap-2">
          <ExportButtons filename="liquidaciones" loadAll={loadAll} />
          <CampanaHeader />
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-5 max-w-7xl mx-auto w-full">

        {/* Filtros */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 print:hidden">
          <FloatingSelect
            label="Aseguradora"
            value={aseguradoraId}
            onChange={(e) => patchFiltros({ aseguradoraId: e.target.value })}
          >
            <option value="">Todas</option>
            {aseguradoras.map((a) => (
              <option key={a.id} value={String(a.id)}>{a.nombre}</option>
            ))}
          </FloatingSelect>

          <FloatingSelect
            label="Estado"
            value={estado}
            onChange={(e) => patchFiltros({ estado: e.target.value })}
          >
            <option value="">Todos</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="FACTURADO">Facturado</option>
            <option value="PAGADO">Pagado</option>
            <option value="RECHAZADO">Rechazado</option>
          </FloatingSelect>

          <FloatingInput
            label="Desde"
            type="date"
            alwaysFloat
            value={desde}
            onChange={(e) => patchFiltros({ desde: e.target.value })}
          />

          <FloatingInput
            label="Hasta"
            type="date"
            alwaysFloat
            value={hasta}
            onChange={(e) => patchFiltros({ hasta: e.target.value })}
          />
        </div>

        {/* Totales */}
        <TotalesPanel totales={data?.totales} />

        {/* Tabla */}
        {isError ? (
          <ErrorState onRetry={refetch} />
        ) : (
          <div className={cn(cardUI, 'overflow-x-auto')}>
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Fecha</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Aseguradora</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Paciente</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Servicio</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Código</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Monto</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b last:border-0">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 rounded bg-muted animate-pulse" style={{ width: j === 5 ? '5rem' : '8rem' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (data?.rows ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-2">
                      <EmptyState
                        icon={ShieldCheck}
                        title="Sin liquidaciones"
                        description="No hay liquidaciones que coincidan con los filtros seleccionados."
                        className="py-12"
                      />
                    </td>
                  </tr>
                ) : (
                  (data?.rows ?? []).map((row) => (
                    <tr key={row.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors duration-150">
                      <td className="px-4 py-3 tabular-nums text-muted-foreground whitespace-nowrap">
                        {formatFecha(row.fecha)}
                      </td>
                      <td className="px-4 py-3 font-medium">{row.aseguradora.nombre}</td>
                      <td className="px-4 py-3">{row.paciente.nombre} {row.paciente.apellido}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.servicio.nombre}</td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {row.codigoSeguro ?? <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium whitespace-nowrap">
                        {formatMoneda(Number(row.montoAseguradora))}
                      </td>
                      <td className="px-4 py-3">
                        <EstadoBadge estado={row.estado} />
                      </td>
                      <td className="px-4 py-3">
                        <AccionesCell
                          row={row}
                          mutando={cambiarEstado.isPending && cambiarEstado.variables?.id === row.id}
                          onConfirmar={(accion, descripcion) =>
                            setConfirmPendiente({ id: row.id, accion, descripcion })
                          }
                          onRechazar={(descripcion) =>
                            setRechazoPendiente({ id: row.id, descripcion })
                          }
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {!isError && total > 0 && (
          <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground print:hidden">
            <span>
              {total} liquidación{total !== 1 ? 'es' : ''}
              {totalPaginas > 1 && (
                <span className="tabular-nums"> · Página {pageActual} de {totalPaginas}</span>
              )}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pageActual <= 1}
                className={cn(btnOutlineUI, 'h-9 px-3 text-sm disabled:opacity-40')}
              >
                ← Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPaginas, p + 1))}
                disabled={pageActual >= totalPaginas}
                className={cn(btnOutlineUI, 'h-9 px-3 text-sm disabled:opacity-40')}
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal confirmar acción (Facturar / Marcar pagado / Reabrir) */}
      {confirmPendiente && (
        <ConfirmarModal
          titulo={
            confirmPendiente.accion === 'FACTURADO'
              ? 'Facturar liquidación'
              : confirmPendiente.accion === 'PAGADO'
                ? 'Marcar como pagado'
                : 'Reabrir liquidación'
          }
          mensaje={
            confirmPendiente.accion === 'FACTURADO'
              ? `¿Confirmas que se facturó esta liquidación?\n${confirmPendiente.descripcion}`
              : confirmPendiente.accion === 'PAGADO'
                ? `¿Confirmas que la aseguradora realizó el pago?\n${confirmPendiente.descripcion}`
                : `¿Reabrir esta liquidación y devolverla a estado Pendiente?\n${confirmPendiente.descripcion}`
          }
          confirmLabel={
            confirmPendiente.accion === 'FACTURADO'
              ? 'Facturar'
              : confirmPendiente.accion === 'PAGADO'
                ? 'Marcar pagado'
                : 'Reabrir'
          }
          pendiente={cambiarEstado.isPending}
          onConfirm={() =>
            cambiarEstado.mutate({ id: confirmPendiente.id, estado: confirmPendiente.accion })
          }
          onClose={() => setConfirmPendiente(null)}
        />
      )}

      {/* Modal rechazar (requiere motivo) */}
      {rechazoPendiente && (
        <RechazarLiquidacionModal
          descripcion={rechazoPendiente.descripcion}
          pendiente={cambiarEstado.isPending}
          onConfirm={(motivo) =>
            cambiarEstado.mutate({ id: rechazoPendiente.id, estado: 'RECHAZADO', motivo })
          }
          onClose={() => setRechazoPendiente(null)}
        />
      )}
    </div>
  )
}
