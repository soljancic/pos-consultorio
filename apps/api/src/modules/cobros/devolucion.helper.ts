import { Decimal } from '@prisma/client/runtime/library'

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
