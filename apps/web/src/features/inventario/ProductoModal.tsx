import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Archive, Package } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn } from '../../lib/utils'
import { btnPrimaryUI, btnOutlineUI, btnDestructiveUI, errorUI } from '../../lib/ui'
import { ModalHeader } from '../../components/shared/ModalHeader'
import { FloatingInput } from '../../components/shared/FloatingInput'
import { ConfirmarModal } from '../../components/shared/ConfirmarModal'

export interface Producto {
  id: number
  nombre: string
  categoria: string | null
  codigoBarras: string | null
  precioVenta: string | number
  precioCosto: string | number
  stockActual: number
  controlaStock: boolean
  habilitadoVenta: boolean
  activo: boolean
}

interface Props {
  producto?: Producto | null
  onClose: () => void
}

interface Errores {
  nombre?: string
  precioVenta?: string
  precioCosto?: string
  stockActual?: string
}

// Tarjeta-switch reutilizable (patron DoctorModal): toda la fila es el control,
// touch target comodo, color + texto para el estado (no solo color).
function ToggleCard({
  checked,
  onToggle,
  title,
  on,
  off,
}: {
  checked: boolean
  onToggle: () => void
  title: string
  on: string
  off: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60',
        checked ? 'border-input bg-card hover:bg-muted/40' : 'border-input bg-muted/40 hover:bg-muted/60',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          <span
            aria-hidden="true"
            className={cn('h-2 w-2 shrink-0 rounded-full', checked ? 'bg-emerald-500' : 'bg-muted-foreground/50')}
          />
          {title}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{checked ? on : off}</span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200',
          checked ? 'bg-primary' : 'bg-muted-foreground/30',
        )}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  )
}

export function ProductoModal({ producto, onClose }: Props) {
  const qc = useQueryClient()
  const editando = !!producto?.id

  // Categorias ya usadas: alimentan el combobox (datalist) del campo Categoría,
  // para reusar nombres en vez de tipear variantes ("Bebida" vs "bebidas").
  const { data: categorias = [] } = useQuery<string[]>({
    queryKey: ['productos', 'categorias'],
    queryFn: () => api.get('/productos/categorias').then((r) => r.data),
  })

  const [error, setError] = useState('')
  const [errores, setErrores] = useState<Errores>({})
  const [archivarOpen, setArchivarOpen] = useState(false)
  // Aviso cuando el backend archiva (en uso) en vez de borrar
  const [aviso, setAviso] = useState<string | null>(null)

  const [form, setForm] = useState({
    nombre: producto?.nombre ?? '',
    categoria: producto?.categoria ?? '',
    codigoBarras: producto?.codigoBarras ?? '',
    precioVenta: producto != null ? String(Number(producto.precioVenta)) : '',
    precioCosto: producto != null ? String(Number(producto.precioCosto)) : '',
    stockActual: producto != null ? String(producto.stockActual) : '0',
    controlaStock: producto?.controlaStock ?? true,
    habilitadoVenta: producto?.habilitadoVenta ?? true,
    activo: producto?.activo ?? true,
  })

  function validar(): Errores {
    const e: Errores = {}
    if (!form.nombre.trim()) e.nombre = 'Ingresá el nombre del producto.'
    const pv = Number(form.precioVenta)
    if (form.precioVenta === '' || Number.isNaN(pv) || pv < 0) e.precioVenta = 'Ingresá un precio válido.'
    const pc = Number(form.precioCosto)
    if (form.precioCosto === '' || Number.isNaN(pc) || pc < 0) e.precioCosto = 'Ingresá un costo válido.'
    if (!editando) {
      const st = Number(form.stockActual)
      if (form.stockActual === '' || !Number.isInteger(st)) e.stockActual = 'Ingresá un stock válido (entero).'
    }
    return e
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        nombre: form.nombre.trim(),
        categoria: form.categoria.trim() || undefined,
        codigoBarras: form.codigoBarras.trim() || undefined,
        precioVenta: Number(form.precioVenta),
        precioCosto: Number(form.precioCosto),
        stockActual: Number(form.stockActual),
        controlaStock: form.controlaStock,
        habilitadoVenta: form.habilitadoVenta,
        ...(editando ? { activo: form.activo } : {}),
      }
      return editando
        ? api.put(`/productos/${producto!.id}`, payload).then((r) => r.data)
        : api.post('/productos', payload).then((r) => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productos'] })
      onClose()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'No se pudo guardar el producto.')
    },
  })

  // Archivar: el backend borra si no se usó en cobros; si se usó, lo archiva y
  // responde {enUso:true} para preservar el histórico.
  const archivar = useMutation({
    mutationFn: () => api.delete(`/productos/${producto!.id}`).then((r) => r.data),
    onSuccess: (res: { eliminado: boolean; enUso?: boolean }) => {
      qc.invalidateQueries({ queryKey: ['productos'] })
      setArchivarOpen(false)
      if (res?.enUso) {
        setAviso(
          'Este producto ya se usó en ventas, así que no se elimina: se archivó para conservar el historial. Dejará de aparecer al vender.',
        )
      } else {
        onClose()
      }
    },
    onError: () => {
      setArchivarOpen(false)
      setError('No se pudo archivar el producto. Probá de nuevo.')
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const errs = validar()
    setErrores(errs)
    if (Object.keys(errs).length > 0) return
    mutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm modal-fade p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-md max-h-[90vh] overflow-y-auto">
        <ModalHeader
          icon={Package}
          title={editando ? 'Editar producto' : 'Nuevo producto'}
          onClose={onClose}
        />
        <form onSubmit={handleSubmit} className="p-6 sm:p-7 space-y-5">
          <FloatingInput
            label="Nombre"
            required
            value={form.nombre}
            error={errores.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
          />

          <div className="grid grid-cols-2 gap-4">
            <FloatingInput
              label="Categoría"
              value={form.categoria}
              list="producto-categorias"
              autoComplete="off"
              onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
            />
            <datalist id="producto-categorias">
              {categorias.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <FloatingInput
              label="Código de barras"
              value={form.codigoBarras}
              className="tabular-nums"
              onChange={(e) => setForm((f) => ({ ...f, codigoBarras: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FloatingInput
              label="Precio de venta"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              required
              value={form.precioVenta}
              error={errores.precioVenta}
              className="tabular-nums"
              leftSlot={<span className="text-sm text-muted-foreground/70">$</span>}
              onChange={(e) => setForm((f) => ({ ...f, precioVenta: e.target.value }))}
            />
            <FloatingInput
              label="Precio de costo"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              required
              value={form.precioCosto}
              error={errores.precioCosto}
              className="tabular-nums"
              leftSlot={<span className="text-sm text-muted-foreground/70">$</span>}
              onChange={(e) => setForm((f) => ({ ...f, precioCosto: e.target.value }))}
            />
          </div>

          {!editando ? (
            <FloatingInput
              label="Stock inicial"
              type="number"
              inputMode="numeric"
              step="1"
              value={form.stockActual}
              error={errores.stockActual}
              className="tabular-nums"
              hint="Cantidad con la que arranca el producto."
              onChange={(e) => setForm((f) => ({ ...f, stockActual: e.target.value }))}
            />
          ) : (
            <FloatingInput
              label="Stock actual"
              type="number"
              inputMode="numeric"
              step="1"
              value={form.stockActual}
              className="tabular-nums"
              hint="Ajuste directo. Más adelante el stock se moverá por Compras y Ajustes."
              onChange={(e) => setForm((f) => ({ ...f, stockActual: e.target.value }))}
            />
          )}

          <div className="space-y-2.5">
            <ToggleCard
              checked={form.controlaStock}
              onToggle={() => setForm((f) => ({ ...f, controlaStock: !f.controlaStock }))}
              title="Controla stock"
              on="Se descuenta del inventario al vender y avisa cuando se agota."
              off="No lleva control de existencias (servicio o insumo libre)."
            />
            <ToggleCard
              checked={form.habilitadoVenta}
              onToggle={() => setForm((f) => ({ ...f, habilitadoVenta: !f.habilitadoVenta }))}
              title="Habilitado para la venta"
              on="Aparece al cobrar una cita y en la venta directa."
              off="Solo en el catálogo; no se ofrece al vender (insumo interno)."
            />
            {editando && (
              <ToggleCard
                checked={form.activo}
                onToggle={() => setForm((f) => ({ ...f, activo: !f.activo }))}
                title={`Producto ${form.activo ? 'activo' : 'archivado'}`}
                on="Visible en el catálogo y disponible para vender."
                off="Oculto del catálogo y de la venta; sus datos se conservan."
              />
            )}
          </div>

          {error && (
            <p role="alert" className={errorUI}>
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-3 pt-1">
            {editando && (
              <button
                type="button"
                onClick={() => setArchivarOpen(true)}
                className={cn(btnDestructiveUI, 'order-last w-full sm:order-first sm:w-auto')}
              >
                <Archive className="h-4 w-4" aria-hidden="true" /> Archivar
              </button>
            )}
            <div className="flex flex-1 gap-3">
              <button type="button" onClick={onClose} className={cn(btnOutlineUI, 'flex-1')}>
                Cancelar
              </button>
              <button type="submit" disabled={mutation.isPending} className={cn(btnPrimaryUI, 'flex-1')}>
                {mutation.isPending ? 'Guardando...' : editando ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {archivarOpen && producto && (
        <ConfirmarModal
          titulo="Archivar producto"
          mensaje={`Se archiva "${producto.nombre}". Dejará de aparecer en el catálogo y al vender. Si ya se usó en ventas no se borra: se conserva para el historial.`}
          confirmLabel="Archivar"
          pendiente={archivar.isPending}
          onConfirm={() => archivar.mutate()}
          onClose={() => setArchivarOpen(false)}
        />
      )}

      {aviso && (
        <ConfirmarModal
          titulo="Producto archivado"
          mensaje={aviso}
          confirmLabel="Entendido"
          onConfirm={() => { setAviso(null); onClose() }}
          onClose={() => { setAviso(null); onClose() }}
        />
      )}
    </div>
  )
}
