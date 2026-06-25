import { useState, useEffect, useRef, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ShoppingCart,
  Search,
  UserPlus,
  X,
  Plus,
  Trash2,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Wallet,
} from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn, formatMoneda, simboloMoneda } from '../../lib/utils'
import { inputUI, btnPrimaryUI, btnOutlineUI, errorUI } from '../../lib/ui'
import { ModalHeader } from '../../components/shared/ModalHeader'
import { PacienteModal } from '../pacientes/PacienteModal'
import { LineasProductoEditor, type LineaUI } from './LineasProductoEditor'

interface Props {
  onClose: () => void
}

interface TipoCuenta {
  id: number
  nombre: string
  esEfectivo: boolean
}

type PacienteBusqueda = {
  id: number
  nombre: string
  apellido: string
}

// Una fila de cobro inline: forma de pago + monto (string mientras se edita) +
// referencia opcional (solo cuentas no-efectivo). id local para keys de React.
interface FilaPago {
  id: number
  tipoCuentaId: number
  monto: string
  referencia: string
}

let filaSeq = 1

export function VentaDirectaModal({ onClose }: Props) {
  const qc = useQueryClient()

  // --- Estado: lineas de producto, cobro, paciente ---
  const [lineas, setLineas] = useState<LineaUI[]>([])
  const [filas, setFilas] = useState<FilaPago[]>([])
  const [advertencias, setAdvertencias] = useState<string[]>([])
  const [error, setError] = useState('')

  // Paciente OPCIONAL (mismo buscador que NuevaCitaModal)
  const [pacienteQuery, setPacienteQuery] = useState('')
  const [paciente, setPaciente] = useState<PacienteBusqueda | null>(null)
  const [showPacienteList, setShowPacienteList] = useState(false)
  const [modalNuevoPaciente, setModalNuevoPaciente] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // Notice de exito del design system: se queda en el modal tras registrar
  const [exito, setExito] = useState<{ saldo: number } | null>(null)

  // Total de la venta = suma de lineas
  const total = useMemo(
    () => lineas.reduce((s, l) => s + l.precioVenta * l.cantidad, 0),
    [lineas],
  )

  // --- Formas de pago: cuentas activas del catalogo (mismo queryKey que CobroModal) ---
  const { data: tiposCuenta = [] } = useQuery<TipoCuenta[]>({
    queryKey: ['tipos-cuenta', 'activos'],
    queryFn: () => api.get('/tipos-cuenta').then((r) => r.data),
  })

  // La cuenta por defecto: la de efectivo, si no la primera del catalogo.
  const cuentaDefault = useMemo(
    () => tiposCuenta.find((c) => c.esEfectivo) ?? tiposCuenta[0],
    [tiposCuenta],
  )

  // Una unica fila de pago, autogestionada al contado, hasta que el usuario la
  // toque. Mientras no la haya tocado (no editó monto, ni agregó/quitó/cambió la
  // forma de pago), su monto sigue al total: caso comun = contado completo en
  // efectivo sin tipear nada. Apenas el usuario interviene, pagoTocado corta el
  // auto-sync y manda el control manual (pago dividido, parcial, etc.).
  const pagoTocado = useRef(false)
  useEffect(() => {
    if (!cuentaDefault || pagoTocado.current) return
    if (total > 0) {
      // Mantener exactamente una fila, en efectivo, con el monto = total.
      setFilas([{ id: filaSeq++, tipoCuentaId: cuentaDefault.id, monto: total.toFixed(2), referencia: '' }])
    } else {
      setFilas([])
    }
    // total cambia → re-sembrar; sin total, vaciar.
  }, [cuentaDefault, total])

  // --- Buscador de pacientes (mismo patron que NuevaCitaModal) ---
  const { data: pacientesResultado = [] } = useQuery<PacienteBusqueda[]>({
    queryKey: ['pacientes-search', pacienteQuery],
    queryFn: () =>
      api
        .get(`/pacientes?limit=50${pacienteQuery ? `&search=${encodeURIComponent(pacienteQuery)}` : ''}`)
        .then((r) => r.data.items),
    enabled: pacienteQuery.length >= 2 || showPacienteList,
  })

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowPacienteList(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function seleccionarPaciente(p: PacienteBusqueda) {
    setPaciente(p)
    setPacienteQuery(`${p.nombre} ${p.apellido}`)
    setShowPacienteList(false)
  }

  function quitarPaciente() {
    setPaciente(null)
    setPacienteQuery('')
  }

  // --- Derivados del cobro inline ---
  const pagado = useMemo(
    () => filas.reduce((s, f) => s + (parseFloat(f.monto) || 0), 0),
    [filas],
  )
  const saldo = total - pagado
  const haySaldo = saldo > 0.001
  const sobrepago = pagado - total > 0.001

  // Hint dinamico contado/deuda: el backend es la autoridad, esto solo guia.
  const faltaPaciente = haySaldo && !paciente

  // --- Mutation ---
  const crear = useMutation({
    mutationFn: () =>
      api
        .post('/cobros/venta-directa', {
          pacienteId: paciente?.id, // undefined si no se eligio (no '')
          lineas: lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad })),
          pagos: filas
            .filter((f) => (parseFloat(f.monto) || 0) > 0)
            .map((f) => ({
              tipoCuentaId: f.tipoCuentaId,
              monto: Number(f.monto),
              ...(f.referencia.trim() ? { referencia: f.referencia.trim() } : {}),
            })),
        })
        .then((r) => r.data),
    onSuccess: (data: any) => {
      // El stock cambio y nacio un cobro: refrescar todo lo financiero + catalogo.
      for (const key of ['citas', 'deudores', 'deudores-resumen', 'caja-hoy', 'pacientes', 'productos']) {
        qc.invalidateQueries({ queryKey: [key] })
      }
      setAdvertencias(Array.isArray(data?.advertencias) ? data.advertencias : [])
      setExito({ saldo: Number(data?.saldoPendiente ?? 0) })
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'No se pudo registrar la venta')
    },
  })

  // --- Acciones de filas de pago (cualquiera marca el pago como tocado y corta
  // el auto-sync con el total) ---
  function setFila(id: number, patch: Partial<FilaPago>) {
    pagoTocado.current = true
    setFilas((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }
  function agregarFila() {
    if (!cuentaDefault) return
    pagoTocado.current = true
    // Sembrar el monto con el saldo restante (pago dividido en pocos toques).
    const restante = Math.max(saldo, 0)
    setFilas((fs) => [
      ...fs,
      { id: filaSeq++, tipoCuentaId: cuentaDefault.id, monto: restante > 0 ? restante.toFixed(2) : '', referencia: '' },
    ])
  }
  function quitarFila(id: number) {
    pagoTocado.current = true
    setFilas((fs) => fs.filter((f) => f.id !== id))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (lineas.length === 0) return
    crear.mutate()
  }

  const sinLineas = lineas.length === 0

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm modal-fade p-4">
        <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-md max-h-[90vh] overflow-y-auto">
          <ModalHeader
            icon={ShoppingCart}
            title="Venta directa"
            subtitle="Venta de mostrador, sin cita"
            onClose={onClose}
          />

          {/* Notice de exito: pantalla de confirmacion dentro del mismo modal. */}
          {exito ? (
            <div className="p-6 sm:p-7 space-y-5 text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
              </span>
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-foreground">Venta registrada</h3>
                <p className="text-sm text-muted-foreground">
                  {exito.saldo > 0.001 ? (
                    <>
                      Queda un saldo de{' '}
                      <span className="font-semibold text-destructive tabular-nums">
                        {formatMoneda(exito.saldo)}
                      </span>{' '}
                      en la deuda del paciente.
                    </>
                  ) : (
                    'El cobro quedó completo.'
                  )}
                </p>
              </div>

              {/* Advertencias de stock (informativas, no bloquean) */}
              {advertencias.length > 0 && (
                <div
                  className="rounded-md bg-amber-500/15 px-3 py-2 text-left text-sm text-amber-700 dark:text-amber-300 space-y-1"
                  role="status"
                >
                  {advertencias.map((a, i) => (
                    <p key={i} className="flex items-start gap-1.5">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{a}</span>
                    </p>
                  ))}
                </div>
              )}

              <button type="button" onClick={onClose} className={cn(btnPrimaryUI, 'w-full')}>
                Listo
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
              {/* 1. Paciente (opcional) — primero, para identificar al comprador */}
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-foreground">Paciente <span className="font-normal text-muted-foreground">(opcional)</span></h3>
                </div>
                <div ref={searchRef}>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70"
                        aria-hidden="true"
                      />
                      <input
                        value={pacienteQuery}
                        onChange={(e) => {
                          setPacienteQuery(e.target.value)
                          setPaciente(null)
                          setShowPacienteList(true)
                        }}
                        onFocus={() => setShowPacienteList(true)}
                        placeholder="Buscar paciente..."
                        aria-label="Buscar paciente"
                        className={cn(inputUI, 'pl-9', paciente && 'pr-9')}
                      />
                      {paciente && (
                        <button
                          type="button"
                          onClick={quitarPaciente}
                          aria-label="Quitar paciente"
                          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground/70 hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 cursor-pointer transition-colors duration-150"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                      {showPacienteList && pacientesResultado.length > 0 && (
                        <div className="absolute z-20 top-full w-full mt-1.5 bg-card border rounded-lg shadow-lg max-h-48 overflow-auto">
                          {pacientesResultado.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => seleccionarPaciente(p)}
                              className="w-full text-left px-3 py-2.5 text-sm cursor-pointer hover:bg-primary/10 focus-visible:outline-none focus-visible:bg-primary/10 transition-colors duration-150"
                            >
                              {p.nombre} {p.apellido}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Alta rapida de paciente sin salir del modal */}
                    <button
                      type="button"
                      onClick={() => setModalNuevoPaciente(true)}
                      aria-label="Nuevo paciente"
                      title="Nuevo paciente"
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border bg-card text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150"
                    >
                      <UserPlus className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* Hint contado/deuda: ambar cuando queda saldo sin paciente */}
                {faltaPaciente && (
                  <p
                    role="status"
                    className="flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2"
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                    Queda saldo: elegí un paciente para la deuda.
                  </p>
                )}
              </section>

              {/* 2. Productos */}
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-foreground">Productos</h3>
                </div>
                <LineasProductoEditor
                  lineas={lineas}
                  onChange={(nuevas) => {
                    setLineas(nuevas)
                    setError('')
                  }}
                />
              </section>

              {/* 3. Cobro inline */}
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-foreground">Cobro</h3>
                </div>

                <div className="space-y-2">
                  {filas.map((f) => {
                    const cuenta = tiposCuenta.find((c) => c.id === f.tipoCuentaId)
                    const noEfectivo = cuenta && !cuenta.esEfectivo
                    return (
                      <div key={f.id} className="rounded-lg border bg-card px-3 py-2.5 space-y-2">
                        <div className="flex items-center gap-2">
                          {/* Forma de pago */}
                          <select
                            value={f.tipoCuentaId}
                            onChange={(e) => setFila(f.id, { tipoCuentaId: Number(e.target.value) })}
                            aria-label="Forma de pago"
                            className={cn(inputUI, 'flex-1')}
                          >
                            {tiposCuenta.map((tc) => (
                              <option key={tc.id} value={tc.id}>
                                {tc.nombre}
                              </option>
                            ))}
                          </select>

                          {/* Monto */}
                          <div className="relative w-32 shrink-0">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-primary/70">
                              {simboloMoneda()}
                            </span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              value={f.monto}
                              onChange={(e) => setFila(f.id, { monto: e.target.value })}
                              aria-label="Monto del pago"
                              className={cn(inputUI, 'pl-9 tabular-nums text-right')}
                            />
                          </div>

                          {/* Quitar fila: solo cuando hay mas de una */}
                          {filas.length > 1 && (
                            <button
                              type="button"
                              onClick={() => quitarFila(f.id)}
                              aria-label="Quitar esta forma de pago"
                              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 cursor-pointer transition-colors duration-150"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          )}
                        </div>

                        {/* Referencia: solo para cuentas no-efectivo (transferencia, etc.) */}
                        {noEfectivo && (
                          <input
                            type="text"
                            value={f.referencia}
                            onChange={(e) => setFila(f.id, { referencia: e.target.value })}
                            placeholder="Referencia (opcional)"
                            aria-label="Referencia del pago"
                            className={cn(inputUI, 'h-9')}
                          />
                        )}
                      </div>
                    )
                  })}

                  {/* Agregar forma de pago (pago dividido) */}
                  <button
                    type="button"
                    onClick={agregarFila}
                    disabled={!cuentaDefault}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline disabled:opacity-50 disabled:no-underline cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 rounded px-1 py-1 transition-colors duration-150"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Agregar forma de pago
                  </button>
                </div>

                {/* Resumen en vivo: Total / Pagado / Saldo */}
                <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-semibold text-foreground tabular-nums">{formatMoneda(total)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Pagado</span>
                    <span className="font-medium text-foreground tabular-nums">{formatMoneda(pagado)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t pt-1.5">
                    <span className="text-muted-foreground">{sobrepago ? 'Cambio' : 'Saldo'}</span>
                    <span
                      className={cn(
                        'font-semibold tabular-nums',
                        sobrepago
                          ? 'text-accent'
                          : haySaldo
                            ? 'text-destructive'
                            : 'text-emerald-600 dark:text-emerald-400',
                      )}
                    >
                      {formatMoneda(sobrepago ? pagado - total : Math.max(saldo, 0))}
                    </span>
                  </div>
                </div>
              </section>

              {/* Error del backend (saldo sin paciente / sobrepago / caja cerrada) */}
              {error && (
                <div className={errorUI} role="alert" aria-live="assertive">
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              {/* Acciones */}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={onClose} className={cn(btnOutlineUI, 'flex-1')}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={crear.isPending || sinLineas}
                  title={sinLineas ? 'Agregá al menos un producto' : undefined}
                  className={cn(btnPrimaryUI, 'flex-1')}
                >
                  {crear.isPending ? 'Registrando...' : 'Registrar venta'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {modalNuevoPaciente && (
        <PacienteModal
          onClose={() => setModalNuevoPaciente(false)}
          onCreated={(p) => seleccionarPaciente(p)}
        />
      )}
    </>
  )
}
