import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Pencil, Check, Undo2, Wallet, AlertCircle, AlertTriangle, ShoppingCart, Save, QrCode, Copy, MessageCircle } from 'lucide-react'
import type { Cita } from '@pos/types'
import { EstadoCita } from '@pos/types'
import { api } from '../../lib/api-client'
import { formatMoneda, formatFecha, simboloMoneda, abrirWhatsApp, cn } from '../../lib/utils'
import { usePlantillasWhatsApp, renderDeuda } from '../../lib/whatsapp'
import { inputUI, btnPrimaryUI, btnOutlineUI, btnIconUI, errorUI } from '../../lib/ui'
import { useAuthStore } from '../../stores/auth.store'
import { toast } from '../../stores/toast.store'
import { AnularPagoModal, type PagoAnulable } from '../caja/AnularPagoModal'
import { ModalHeader } from '../../components/shared/ModalHeader'
import { FloatingInput } from '../../components/shared/FloatingInput'
import { LineasProductoEditor, type LineaUI } from '../inventario/LineasProductoEditor'

interface CobroModalProps {
  cita?: Cita
  /** Cobro sin cita (venta directa con deuda): se cobra por id de cobro. */
  cobroSinCita?: { id: number; pacienteNombre: string }
  onClose: () => void
}

interface TipoCuenta { id: number; nombre: string; esEfectivo: boolean }

export function CobroModal({ cita, cobroSinCita, onClose }: CobroModalProps) {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const esAdmin = user?.rol === 'ADMIN'
  const vendeProductos = user?.vendeProductos ?? false
  const [pagoAnular, setPagoAnular] = useState<PagoAnulable | null>(null)
  const [monto, setMonto] = useState('')
  const [tipoCuentaId, setTipoCuentaId] = useState(0)
  const [referencia, setReferencia] = useState('')
  const [editandoPrecio, setEditandoPrecio] = useState(false)
  const [nuevoPrecio, setNuevoPrecio] = useState('')
  const [motivoAjuste, setMotivoAjuste] = useState('')
  const [errorAjuste, setErrorAjuste] = useState('')
  const [errorPago, setErrorPago] = useState('')
  const [linkCopiado, setLinkCopiado] = useState(false)
  const { plantillas, consultorioNombre, linkQRBase } = usePlantillasWhatsApp()
  // Venta mixta: lineas de producto editables (solo con la cita en ATENDIDA).
  const [lineas, setLineas] = useState<LineaUI[]>([])
  const [errorLineas, setErrorLineas] = useState('')
  const [advertenciasLineas, setAdvertenciasLineas] = useState<string[]>([])
  // Productos colapsados por defecto: se abren con el boton "Agregar productos"
  // (o ya vienen abiertos si el cobro trae productos).
  const [productosAbierto, setProductosAbierto] = useState(false)

  // El cobro se ubica por cita (flujo normal) o por id de cobro (venta directa
  // con deuda, que no tiene cita: se cobra desde Deudores).
  const cobroQueryKey = cita ? ['cobro-cita', cita.id] : ['cobro', cobroSinCita!.id]
  const { data: cobro, isLoading } = useQuery({
    queryKey: cobroQueryKey,
    queryFn: () =>
      api
        .get(cita ? `/cobros/cita/${cita.id}` : `/cobros/${cobroSinCita!.id}`)
        .then((r) => r.data),
    // Sin refetch al volver el foco: un alt-tab durante la edicion de lineas
    // dispararia un refetch que (via el useEffect de abajo) pisaria las lineas
    // sin guardar con la verdad del servidor. La invalidacion post-pago/Guardar
    // (invalidarFinanzas + setQueryData) sigue funcionando: esto solo corta el
    // refetch NO solicitado por foco.
    refetchOnWindowFocus: false,
  })

  // Solo se editan productos mientras la cita esta ATENDIDA (antes de confirmar
  // el cobro); luego la grilla queda en solo-lectura. Una venta directa ya esta
  // confirmada al crearse: sus lineas nunca son editables aca.
  const lineasEditables = vendeProductos && cita?.estado === EstadoCita.ATENDIDA

  // Derivar las lineas de PRODUCTO desde los detalles del cobro (las de servicio
  // tienen productoId null). El snapshot no trae stock vivo, asi que no se
  // dispara alerta local sobre lineas ya guardadas: el backend devuelve las
  // advertencias autoritativas en cada PUT. Las lineas nuevas (agregadas por el
  // buscador) si traen stock real desde /vendibles.
  useEffect(() => {
    if (!cobro?.detalles) return
    setLineas(
      cobro.detalles
        .filter((d: any) => d.productoId != null)
        .map((d: any) => ({
          productoId: d.productoId,
          nombre: d.descripcion,
          precioVenta: Number(d.precioVenta),
          cantidad: d.cantidad,
          stockActual: 0,
          controlaStock: false,
        })),
    )
    // Resetear el feedback al recargar el cobro fresco
    setErrorLineas('')
  }, [cobro])

  // Formas de pago = cuentas del catalogo (tipos de cuenta activos)
  const { data: tiposCuenta = [] } = useQuery<TipoCuenta[]>({
    queryKey: ['tipos-cuenta', 'activos'],
    queryFn: () => api.get('/tipos-cuenta/activos').then((r) => r.data),
  })
  // Default: la cuenta de efectivo, si no la primera
  useEffect(() => {
    if (tipoCuentaId === 0 && tiposCuenta.length > 0) {
      setTipoCuentaId((tiposCuenta.find((c) => c.esEfectivo) ?? tiposCuenta[0]).id)
    }
  }, [tiposCuenta, tipoCuentaId])
  const cuentaSel = tiposCuenta.find((c) => c.id === tipoCuentaId)

  // Un pago toca citas, deudores, caja, dashboard y la ficha del paciente:
  // se invalida todo aca para que cualquier pantalla quede fresca.
  function invalidarFinanzas() {
    for (const key of [
      'citas',
      'deudores',
      'deudores-resumen',
      'caja-hoy',
      'caja-historial',
      'pacientes',
      'paciente',
      'cobro-cita',
      'cobro',
    ]) {
      qc.invalidateQueries({ queryKey: [key] })
    }
  }

  const registrarPago = useMutation({
    mutationFn: (data: { monto: number; tipoCuentaId: number; referencia?: string }) =>
      api.post(`/cobros/${cobro.id}/pagos`, data),
    onSuccess: () => {
      invalidarFinanzas()
      onClose()
    },
    onError: (err: any) => {
      toast.fromError(err, 'No se pudo registrar el pago')
    },
  })

  const ajustarTotal = useMutation({
    mutationFn: (data: { nuevoTotal: number; motivo?: string }) =>
      api.put(`/cobros/${cobro.id}/total`, data),
    onSuccess: () => {
      invalidarFinanzas()
      setEditandoPrecio(false)
      setNuevoPrecio('')
      setMotivoAjuste('')
    },
    onError: (err: any) => {
      toast.fromError(err, 'Error al ajustar el precio')
    },
  })

  // Venta mixta: guarda las lineas de producto del cobro ANTES de cobrar.
  // Devuelve el cobro fresco (con total/saldo recomputados) + advertencias de
  // stock bajo (informativas, no bloquean). Se actualiza el cobro en cache y se
  // invalida finanzas para que el resto de la app quede al dia.
  const setLineasMut = useMutation({
    mutationFn: () =>
      api
        .put(`/cobros/${cobro.id}/lineas`, {
          lineas: lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad })),
        })
        .then((r) => r.data),
    onSuccess: (data: any) => {
      const { advertencias, ...cobroFresco } = data
      qc.setQueryData(cobroQueryKey, cobroFresco)
      invalidarFinanzas()
      setAdvertenciasLineas(Array.isArray(advertencias) ? advertencias : [])
      setErrorLineas('')
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      setErrorLineas(Array.isArray(msg) ? msg.join(', ') : msg ?? 'No se pudieron guardar los productos')
    },
  })

  const saldo = cobro ? Number(cobro.saldoPendiente) : 0
  const pagado = cobro ? Number(cobro.total) - saldo : 0

  // Cobro con QR: cuando el paciente paga a distancia (p.ej. cobro anticipado),
  // se le manda el link de pago por WhatsApp o se copia. Solo si el consultorio
  // tiene el QR configurado (linkQRBase) y queda saldo por cobrar.
  const nombrePaciente = cita
    ? `${cita.paciente?.nombre ?? ''} ${cita.paciente?.apellido ?? ''}`.trim()
    : (cobroSinCita?.pacienteNombre ?? '')
  const linkPago = linkQRBase
    ? `${linkQRBase}?cliente=${encodeURIComponent(nombrePaciente)}`
    : ''
  function enviarLinkPagoWa() {
    const msg = renderDeuda(
      plantillas.deuda,
      { nombre: nombrePaciente, monto: formatMoneda(saldo), consultorio: consultorioNombre },
      linkQRBase,
    )
    abrirWhatsApp(cita?.paciente?.telefono ?? '', msg, cita?.paciente?.pais)
  }
  function copiarLinkPago() {
    if (!linkPago) return
    navigator.clipboard?.writeText(linkPago).then(() => {
      setLinkCopiado(true)
      window.setTimeout(() => setLinkCopiado(false), 2000)
    })
  }

  // Desglose: bruto (SUM detalles = servicio + productos) - descuento = total.
  // Invariante bruto = total + descuento, robusto tambien para cobros viejos
  // (descuento 0). El servicio = bruto - productos (sirva o no la linea de servicio).
  const descuentoCobro = cobro ? Number(cobro.descuento ?? 0) : 0
  const brutoCobro = cobro ? Number(cobro.total) + descuentoCobro : 0
  const subtotalProductosGuardado = cobro?.detalles
    ? cobro.detalles
        .filter((d: any) => d.productoId != null)
        .reduce((s: number, d: any) => s + Number(d.subtotal), 0)
    : 0
  const subtotalServicio = brutoCobro - subtotalProductosGuardado
  // Cambios sin guardar: si las lineas locales difieren de lo persistido (por
  // monto o por cantidad de items). Solo importa cuando se pueden editar.
  const subtotalLineasLocal = lineas.reduce((s, l) => s + l.precioVenta * l.cantidad, 0)
  const cantGuardadas = cobro?.detalles?.filter((d: any) => d.productoId != null).length ?? 0
  const hayCambiosLineas =
    lineasEditables &&
    (Math.abs(subtotalLineasLocal - subtotalProductosGuardado) > 0.001 ||
      lineas.length !== cantGuardadas)

  // La seccion de productos queda visible si: la abriste con el boton, hay
  // productos cargados, o hay cambios sin guardar (p.ej. borraste el ultimo
  // producto: NO se debe colapsar hasta poder guardar la baja).
  const mostrarProductos = productosAbierto || lineas.length > 0 || hayCambiosLineas

  function confirmarAjuste() {
    setErrorAjuste('')
    // El descuento se da sobre el total YA con los productos guardados: con
    // lineas sin guardar el total recalcularia y se perderia el descuento.
    if (hayCambiosLineas) {
      setErrorAjuste('Guardá los productos antes de cambiar el precio')
      return
    }
    const precio = parseFloat(nuevoPrecio)
    if (isNaN(precio) || precio < 0) {
      setErrorAjuste('Ingrese un precio valido')
      return
    }
    // El descuento puede aplicar al servicio y/o a los productos; el unico piso
    // es lo ya pagado.
    if (precio < pagado) {
      setErrorAjuste(`El total no puede ser menor a lo ya pagado (${formatMoneda(pagado)})`)
      return
    }
    ajustarTotal.mutate({ nuevoTotal: precio, motivo: motivoAjuste || undefined })
  }
  const montoNum = parseFloat(monto) || 0
  const vuelto = montoNum > saldo ? montoNum - saldo : 0
  const quedaDeuda = saldo - Math.min(montoNum, saldo)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorPago('')
    // Hay que guardar los productos antes de cobrar: el total/saldo se
    // recomputan en el backend al guardar las lineas.
    if (hayCambiosLineas) {
      setErrorPago('Guardá los productos antes de registrar el pago')
      return
    }
    if (montoNum <= 0 || montoNum > saldo) return
    registrarPago.mutate({
      monto: montoNum,
      tipoCuentaId,
      referencia: referencia || undefined,
    })
  }

  return (
    <div className="fixed inset-0 bg-slate-950/55 backdrop-blur-xs modal-fade flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        <ModalHeader
          icon={Wallet}
          title="Registrar Cobro"
          subtitle={
            cita ? (
              <>{cita.paciente?.nombre} {cita.paciente?.apellido} &bull; {cita.servicio?.nombre}</>
            ) : (
              <>{cobroSinCita?.pacienteNombre} &bull; Venta de productos</>
            )
          }
          onClose={onClose}
        />

        {isLoading ? (
          <div className="p-6 text-center text-muted-foreground">Cargando cobro...</div>
        ) : (
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            {/* Cuerpo scrolleable: con muchas lineas de producto el modal no
                crece mas alla del viewport; header y botones quedan visibles. */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
            {/* Productos arriba de todo. Oculto por defecto: solo el boton
                "Agregar productos"; al abrirlo aparece la grilla. Si el cobro ya
                trae productos, se muestra abierto. */}
            {vendeProductos && (lineasEditables || lineas.length > 0) && (
              mostrarProductos ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <h3 className="text-sm font-semibold text-foreground">Productos</h3>
                  </div>

                  <LineasProductoEditor
                    lineas={lineas}
                    onChange={(nuevas) => {
                      setLineas(nuevas)
                      setAdvertenciasLineas([])
                    }}
                    disabled={!lineasEditables}
                  />

                  {/* Advertencias de stock bajo (informativas; no bloquean): bloque
                      ambar, nunca errorUI (que es para errores duros). */}
                  {advertenciasLineas.length > 0 && (
                    <div
                      className="rounded-md bg-amber-500/15 px-3 py-2 text-sm text-amber-700 dark:text-amber-300 space-y-1"
                      role="status"
                    >
                      {advertenciasLineas.map((a, i) => (
                        <p key={i} className="flex items-start gap-1.5">
                          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                          <span>{a}</span>
                        </p>
                      ))}
                    </div>
                  )}

                  {errorLineas && (
                    <div className={errorUI} role="alert" aria-live="assertive">
                      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{errorLineas}</span>
                    </div>
                  )}

                  {/* Guardar lineas: aparece solo con cambios sin guardar. El pago
                      se registra despues, sobre el total ya recomputado. */}
                  {hayCambiosLineas && (
                    <button
                      type="button"
                      onClick={() => setLineasMut.mutate()}
                      disabled={setLineasMut.isPending}
                      className={cn(btnOutlineUI, 'w-full')}
                    >
                      <Save className="h-4 w-4" aria-hidden="true" />
                      {setLineasMut.isPending ? 'Guardando productos...' : 'Guardar productos'}
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setProductosAbierto(true)}
                  className={cn(btnOutlineUI, 'w-full')}
                >
                  <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                  Agregar productos
                </button>
              )
            )}

            <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-muted-foreground">
                    {(subtotalProductosGuardado > 0 || descuentoCobro > 0) ? 'Total' : 'Total servicio'}
                  </div>
                  <div className="font-semibold inline-flex items-center gap-1.5 tabular-nums">
                    {formatMoneda(Number(cobro?.total))}
                    {!editandoPrecio && (
                      <button
                        type="button"
                        onClick={() => {
                          setNuevoPrecio(String(Number(cobro?.total ?? 0)))
                          setEditandoPrecio(true)
                        }}
                        disabled={hayCambiosLineas}
                        title={hayCambiosLineas ? 'Guardá los productos antes de cambiar el precio' : 'Cambiar precio'}
                        aria-label="Cambiar precio del total"
                        className="inline-flex items-center justify-center h-7 w-7 rounded text-muted-foreground/70 hover:text-primary hover:bg-primary/10 cursor-pointer focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground/70 transition-colors duration-150"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Saldo pendiente</div>
                  <div className="font-semibold text-destructive tabular-nums">{formatMoneda(saldo)}</div>
                </div>
              </div>

              {/* Desglose: servicio + productos - descuento = total */}
              {(subtotalProductosGuardado > 0 || descuentoCobro > 0) && (
                <div className="border-t pt-2 space-y-1 text-xs">
                  {subtotalServicio > 0.001 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Servicio</span>
                      <span className="tabular-nums text-foreground">{formatMoneda(subtotalServicio)}</span>
                    </div>
                  )}
                  {subtotalProductosGuardado > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Productos</span>
                      <span className="tabular-nums text-foreground">{formatMoneda(subtotalProductosGuardado)}</span>
                    </div>
                  )}
                  {descuentoCobro > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Descuento</span>
                      <span className="tabular-nums text-destructive">-{formatMoneda(descuentoCobro)}</span>
                    </div>
                  )}
                </div>
              )}

              {editandoPrecio && (
                <div className="border-t pt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={pagado}
                      step="0.01"
                      value={nuevoPrecio}
                      onChange={(e) => setNuevoPrecio(e.target.value)}
                      autoFocus
                      aria-label="Nuevo precio"
                      className={cn(inputUI, 'flex-1 h-9')}
                    />
                    <button
                      type="button"
                      onClick={confirmarAjuste}
                      disabled={ajustarTotal.isPending}
                      title="Confirmar precio"
                      aria-label="Confirmar precio"
                      className={cn(btnIconUI, 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50')}
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditandoPrecio(false)
                        setErrorAjuste('')
                      }}
                      title="Cancelar"
                      aria-label="Cancelar edición de precio"
                      className={cn(btnIconUI, 'border border-input text-muted-foreground hover:bg-muted')}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={motivoAjuste}
                    onChange={(e) => setMotivoAjuste(e.target.value)}
                    placeholder="Motivo (ej: descuento obra social)"
                    aria-label="Motivo del ajuste"
                    className={cn(inputUI, 'h-9')}
                  />
                  {pagado > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Ya pagado: {formatMoneda(pagado)} — el precio no puede ser menor
                    </p>
                  )}
                  {errorAjuste && <p className="text-xs text-destructive">{errorAjuste}</p>}
                </div>
              )}
            </div>

            {/* Pagos ya registrados (anulables por ADMIN via reversa) */}
            {cobro?.pagos?.length > 0 && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Pagos registrados
                </p>
                {cobro.pagos.map((p: any) => {
                  const esReversa = Number(p.monto) < 0
                  return (
                    <div key={p.id} className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground tabular-nums">
                        {formatFecha(p.createdAt, 'dd/MM HH:mm')} &bull; {p.tipoCuenta?.nombre}
                        {esReversa && (
                          <span className="ml-1.5 text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded font-medium" title={p.motivoAnulacion ?? undefined}>Reversa</span>
                        )}
                        {p.anuladoAt && (
                          <span className="ml-1.5 text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium" title={p.motivoAnulacion ?? undefined}>Anulado</span>
                        )}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className={cn('font-medium tabular-nums', esReversa ? 'text-destructive' : 'text-foreground', p.anuladoAt && 'line-through opacity-60')}>
                          {formatMoneda(Number(p.monto))}
                        </span>
                        {esAdmin && !esReversa && !p.anuladoAt && (
                          <button
                            type="button"
                            onClick={() =>
                              setPagoAnular({ id: p.id, monto: Number(p.monto), cuenta: p.tipoCuenta?.nombre ?? '' })
                            }
                            title="Anular pago"
                            aria-label={`Anular pago de ${formatMoneda(Number(p.monto))}`}
                            className="inline-flex items-center justify-center h-7 w-7 rounded text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10 cursor-pointer focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150"
                          >
                            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            <div>
              <FloatingInput
                id="cobro-monto"
                label="Monto que paga"
                type="number"
                inputMode="decimal"
                leftSlot={
                  <span className="text-sm font-semibold text-primary/70 leading-none">
                    {simboloMoneda()}
                  </span>
                }
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                min="0.01"
                max={saldo}
                step="0.01"
                required
                className="tabular-nums"
              />
              <button
                type="button"
                onClick={() => setMonto(saldo.toString())}
                className="text-xs font-medium text-primary hover:underline mt-1.5 cursor-pointer focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60 rounded transition-colors duration-150 tabular-nums"
              >
                Pagar total ({formatMoneda(saldo)})
              </button>
            </div>

            {/* Cobrar con QR: mandar/copiar el link de pago (cobro anticipado o
                a distancia). Solo con QR configurado y saldo pendiente. */}
            {linkQRBase && saldo > 0 && (
              <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <QrCode className="h-4 w-4 text-primary" aria-hidden="true" />
                  Cobrar con QR
                </div>
                <p className="text-xs text-muted-foreground">
                  Enviale el link de pago al paciente para que abone por QR.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={enviarLinkPagoWa}
                    disabled={hayCambiosLineas}
                    title={hayCambiosLineas ? 'Guardá los productos antes de enviar el link (el monto cambia)' : undefined}
                    className={cn(btnOutlineUI, 'flex-1')}
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={copiarLinkPago}
                    aria-live="polite"
                    className={cn(btnOutlineUI, 'flex-1')}
                  >
                    {linkCopiado ? (
                      <>
                        <Check className="h-4 w-4" aria-hidden="true" />
                        Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" aria-hidden="true" />
                        Copiar link
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Forma de pago
              </label>
              <div className="grid grid-cols-2 gap-2">
                {tiposCuenta.map((tc) => (
                  <button
                    key={tc.id}
                    type="button"
                    onClick={() => setTipoCuentaId(tc.id)}
                    aria-pressed={tipoCuentaId === tc.id}
                    className={cn(
                      'h-11 px-3 rounded-lg text-sm font-medium border cursor-pointer focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150',
                      tipoCuentaId === tc.id
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card text-foreground border-input hover:border-primary/60',
                    )}
                  >
                    {tc.nombre}
                  </button>
                ))}
              </div>
            </div>

            {cuentaSel && !cuentaSel.esEfectivo && (
              <FloatingInput
                id="cobro-referencia"
                label="Referencia (opcional)"
                type="text"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
              />
            )}

            {montoNum > 0 && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                {vuelto > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cambio</span>
                    <span className="font-semibold text-accent tabular-nums">{formatMoneda(vuelto)}</span>
                  </div>
                )}
                {quedaDeuda > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Queda de deuda</span>
                    <span className="font-semibold text-destructive tabular-nums">{formatMoneda(quedaDeuda)}</span>
                  </div>
                )}
                {quedaDeuda === 0 && montoNum > 0 && (
                  <div className="text-accent font-medium text-center">Cobro completo</div>
                )}
              </div>
            )}

            {errorPago && (
              <div className={errorUI} role="alert" aria-live="assertive">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{errorPago}</span>
              </div>
            )}

            </div>

            {/* Footer fijo: las acciones quedan siempre a la vista aunque el
                cuerpo scrollee. */}
            <div className="flex gap-2 shrink-0 border-t bg-card p-4">
              <button type="button" onClick={onClose} className={cn(btnOutlineUI, 'flex-1')}>
                Cancelar
              </button>
              <button
                type="submit"
                disabled={registrarPago.isPending || montoNum <= 0 || hayCambiosLineas}
                title={hayCambiosLineas ? 'Guardá los productos antes de cobrar' : undefined}
                className={cn(btnPrimaryUI, 'flex-1')}
              >
                {registrarPago.isPending ? 'Guardando...' : 'Registrar pago'}
              </button>
            </div>
          </form>
        )}
      </div>

      {pagoAnular && (
        <AnularPagoModal pago={pagoAnular} onClose={() => setPagoAnular(null)} />
      )}
    </div>
  )
}
