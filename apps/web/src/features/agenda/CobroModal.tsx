import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Pencil, Check } from 'lucide-react'
import { FormaPago, type Cita } from '@pos/types'
import { api } from '../../lib/api-client'
import { formatMoneda } from '../../lib/utils'

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="font-semibold text-foreground">Registrar Cobro</h2>
            <p className="text-sm text-muted-foreground">
              {cita.paciente?.apellido}, {cita.paciente?.nombre} &bull; {cita.servicio?.nombre}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-5 w-5" />
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
                  <div className="font-semibold inline-flex items-center gap-1.5">
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
                        className="p-1 rounded text-muted-foreground/70 hover:text-primary hover:bg-primary/10 cursor-pointer"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Saldo pendiente</div>
                  <div className="font-semibold text-destructive">{formatMoneda(saldo)}</div>
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
                      className="flex-1 border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button
                      type="button"
                      onClick={confirmarAjuste}
                      disabled={ajustarTotal.isPending}
                      title="Confirmar precio"
                      className="p-1.5 rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
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
                      className="p-1.5 rounded-md border text-muted-foreground hover:bg-muted cursor-pointer"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={motivoAjuste}
                    onChange={(e) => setMotivoAjuste(e.target.value)}
                    placeholder="Motivo (ej: descuento obra social)"
                    className="w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Monto que paga
              </label>
              <input
                type="number"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder={saldo.toString()}
                min="1"
                max={saldo}
                step="0.01"
                required
              />
              <button
                type="button"
                onClick={() => setMonto(saldo.toString())}
                className="text-xs text-primary hover:underline mt-1"
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
                    className={`py-2 px-3 rounded-md text-sm border transition-colors ${
                      formaPago === fp.value
                        ? 'bg-primary text-white border-primary'
                        : 'bg-card text-foreground border-input hover:border-primary/60'
                    }`}
                  >
                    {fp.label}
                  </button>
                ))}
              </div>
            </div>

            {(formaPago === FormaPago.QR || formaPago === FormaPago.VALES) && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Referencia (opcional)
                </label>
                <input
                  type="text"
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Numero de comprobante"
                />
              </div>
            )}

            {montoNum > 0 && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                {vuelto > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Vuelto</span>
                    <span className="font-semibold text-accent">{formatMoneda(vuelto)}</span>
                  </div>
                )}
                {quedaDeuda > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Queda de deuda</span>
                    <span className="font-semibold text-destructive">{formatMoneda(quedaDeuda)}</span>
                  </div>
                )}
                {quedaDeuda === 0 && montoNum > 0 && (
                  <div className="text-accent font-medium text-center">Cobro completo</div>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 border rounded-md text-sm text-foreground hover:bg-muted/60"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={registrarPago.isPending || montoNum <= 0}
                className="flex-1 py-2 bg-primary text-white rounded-md text-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {registrarPago.isPending ? 'Guardando...' : 'Registrar pago'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
