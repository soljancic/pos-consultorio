import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Pencil, Check, Undo2 } from 'lucide-react'
import { FormaPago, type Cita } from '@pos/types'
import { api } from '../../lib/api-client'
import { formatMoneda, formatFecha, cn } from '../../lib/utils'
import { inputUI, btnPrimaryUI, btnOutlineUI, btnIconUI } from '../../lib/ui'
import { useAuthStore } from '../../stores/auth.store'
import { AnularPagoModal, type PagoAnulable } from '../caja/AnularPagoModal'

interface CobroModalProps {
  cita: Cita
  onClose: () => void
}

const FORMAS_PAGO = [
  { value: FormaPago.EFECTIVO, label: 'Efectivo' },
  { value: FormaPago.QR, label: 'QR / Transferencia' },
  { value: FormaPago.TARJETA, label: 'Tarjeta' },
  { value: FormaPago.VALES, label: 'Vales' },
]

export function CobroModal({ cita, onClose }: CobroModalProps) {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const esAdmin = user?.rol === 'ADMIN'
  const [pagoAnular, setPagoAnular] = useState<PagoAnulable | null>(null)
  const [monto, setMonto] = useState('')
  const [formaPago, setFormaPago] = useState<FormaPago>(FormaPago.EFECTIVO)
  const [referencia, setReferencia] = useState('')
  const [editandoPrecio, setEditandoPrecio] = useState(false)
  const [nuevoPrecio, setNuevoPrecio] = useState('')
  const [motivoAjuste, setMotivoAjuste] = useState('')
  const [errorAjuste, setErrorAjuste] = useState('')

  const { data: cobro, isLoading } = useQuery({
    queryKey: ['cobro-cita', cita.id],
    queryFn: () => api.get(`/cobros/cita/${cita.id}`).then((r) => r.data),
  })

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
    ]) {
      qc.invalidateQueries({ queryKey: [key] })
    }
  }

  const registrarPago = useMutation({
    mutationFn: (data: { monto: number; formaPago: FormaPago; referencia?: string }) =>
      api.post(`/cobros/${cobro.id}/pagos`, data),
    onSuccess: () => {
      invalidarFinanzas()
      onClose()
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
      const msg = err.response?.data?.message
      setErrorAjuste(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al ajustar el precio')
    },
  })

  const saldo = cobro ? Number(cobro.saldoPendiente) : 0
  const pagado = cobro ? Number(cobro.total) - saldo : 0

  function confirmarAjuste() {
    setErrorAjuste('')
    const precio = parseFloat(nuevoPrecio)
    if (isNaN(precio) || precio < 0) {
      setErrorAjuste('Ingrese un precio valido')
      return
    }
    ajustarTotal.mutate({ nuevoTotal: precio, motivo: motivoAjuste || undefined })
  }
  const montoNum = parseFloat(monto) || 0
  const vuelto = montoNum > saldo ? montoNum - saldo : 0
  const quedaDeuda = saldo - Math.min(montoNum, saldo)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (montoNum <= 0 || montoNum > saldo) return
    registrarPago.mutate({
      monto: montoNum,
      formaPago,
      referencia: referencia || undefined,
    })
  }

  return (
    <div className="fixed inset-0 bg-slate-950/55 backdrop-blur-sm modal-fade flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="font-semibold text-foreground">Registrar Cobro</h2>
            <p className="text-sm text-muted-foreground">
              {cita.paciente?.apellido}, {cita.paciente?.nombre} &bull; {cita.servicio?.nombre}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className={cn(btnIconUI, 'text-muted-foreground hover:bg-muted hover:text-foreground')}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {isLoading ? (
          <div className="p-6 text-center text-muted-foreground">Cargando cobro...</div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-muted-foreground">Total servicio</div>
                  <div className="font-semibold inline-flex items-center gap-1.5 tabular-nums">
                    {formatMoneda(Number(cobro?.total))}
                    {!editandoPrecio && (
                      <button
                        type="button"
                        onClick={() => {
                          setNuevoPrecio(String(Number(cobro?.total ?? 0)))
                          setEditandoPrecio(true)
                        }}
                        title="Cambiar precio"
                        aria-label="Cambiar precio del servicio"
                        className="inline-flex items-center justify-center h-7 w-7 rounded text-muted-foreground/70 hover:text-primary hover:bg-primary/10 cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150"
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
                        {formatFecha(p.createdAt, 'dd/MM HH:mm')} &bull; {p.formaPago}
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
                              setPagoAnular({ id: p.id, monto: Number(p.monto), formaPago: p.formaPago })
                            }
                            title="Anular pago"
                            aria-label={`Anular pago de ${formatMoneda(Number(p.monto))}`}
                            className="inline-flex items-center justify-center h-7 w-7 rounded text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10 cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150"
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
              <label htmlFor="cobro-monto" className="block text-sm font-medium text-foreground mb-1.5">
                Monto que paga
              </label>
              <input
                id="cobro-monto"
                type="number"
                inputMode="decimal"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className={inputUI}
                placeholder={saldo.toString()}
                min="1"
                max={saldo}
                step="0.01"
                required
              />
              <button
                type="button"
                onClick={() => setMonto(saldo.toString())}
                className="text-xs font-medium text-primary hover:underline mt-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 rounded transition-colors duration-150 tabular-nums"
              >
                Pagar total ({formatMoneda(saldo)})
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Forma de pago
              </label>
              <div className="grid grid-cols-2 gap-2">
                {FORMAS_PAGO.map((fp) => (
                  <button
                    key={fp.value}
                    type="button"
                    onClick={() => setFormaPago(fp.value)}
                    aria-pressed={formaPago === fp.value}
                    className={cn(
                      'h-10 px-3 rounded-md text-sm font-medium border cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150',
                      formaPago === fp.value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card text-foreground border-input hover:border-primary/60',
                    )}
                  >
                    {fp.label}
                  </button>
                ))}
              </div>
            </div>

            {(formaPago === FormaPago.QR || formaPago === FormaPago.VALES) && (
              <div>
                <label htmlFor="cobro-referencia" className="block text-sm font-medium text-foreground mb-1.5">
                  Referencia (opcional)
                </label>
                <input
                  id="cobro-referencia"
                  type="text"
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  className={inputUI}
                  placeholder="Número de comprobante"
                />
              </div>
            )}

            {montoNum > 0 && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                {vuelto > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Vuelto</span>
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

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={onClose} className={cn(btnOutlineUI, 'flex-1')}>
                Cancelar
              </button>
              <button
                type="submit"
                disabled={registrarPago.isPending || montoNum <= 0}
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
