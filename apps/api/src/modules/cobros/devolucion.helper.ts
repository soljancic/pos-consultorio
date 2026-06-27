import { Decimal } from '../../common/decimal'

export interface RepartoDevolucion {
  totalNuevo: Decimal
  descuentoNuevo: Decimal
  delta: Decimal
  deudaReduccion: Decimal
  reembolso: Decimal
  nuevoSaldo: Decimal
}

// Recomputa el cobro al quitar una linea de subtotal `subtotalLinea`, conservando
// el descuento existente (recortado si supera el nuevo bruto, igual que setProductos).
// Reparte la baja del total entre la deuda viva (lo que aun se debia) y el
// reembolso (lo ya pagado). Invariante: deudaReduccion + reembolso == delta.
export function calcularRepartoDevolucion(
  total: Decimal,
  descuento: Decimal,
  saldoPendiente: Decimal,
  subtotalLinea: Decimal,
): RepartoDevolucion {
  const bruto = total.plus(descuento)
  const brutoNuevo = bruto.minus(subtotalLinea)
  const descuentoNuevo = descuento.gt(brutoNuevo) ? brutoNuevo : descuento
  const totalNuevo = brutoNuevo.minus(descuentoNuevo)
  const delta = total.minus(totalNuevo)
  const deudaReduccion = delta.gt(saldoPendiente) ? saldoPendiente : delta
  const reembolso = delta.gt(saldoPendiente) ? delta.minus(saldoPendiente) : new Decimal(0)
  const nuevoSaldo = saldoPendiente.gt(delta) ? saldoPendiente.minus(delta) : new Decimal(0)
  return { totalNuevo, descuentoNuevo, delta, deudaReduccion, reembolso, nuevoSaldo }
}

export interface PagoVivo {
  id: number
  monto: Decimal
  tipoCuentaId: number
  esEfectivo: boolean
}

export interface MovimientoReembolso {
  tipoCuentaId: number
  monto: Decimal // positivo: cuanto se devuelve de esa forma de pago
  esEfectivo: boolean
}

// Reparte `reembolso` entre los pagos vivos del mas reciente al mas antiguo
// (la lista llega YA ordenada desc por fecha). Devuelve los movimientos a crear
// como pagos negativos, partiendo el pago del borde si hace falta. La suma de
// los montos devueltos == reembolso (si los pagos alcanzan, que es el caso real:
// reembolso = parte ya pagada del item <= total pagado del cobro).
export function planificarReembolso(
  pagosDescPorFecha: PagoVivo[],
  reembolso: Decimal,
): MovimientoReembolso[] {
  const movs: MovimientoReembolso[] = []
  let restante = reembolso
  for (const p of pagosDescPorFecha) {
    if (restante.lte(0)) break
    const take = p.monto.gt(restante) ? restante : p.monto
    movs.push({ tipoCuentaId: p.tipoCuentaId, monto: take, esEfectivo: p.esEfectivo })
    restante = restante.minus(take)
  }
  return movs
}
