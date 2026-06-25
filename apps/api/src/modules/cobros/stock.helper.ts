import { Prisma } from '@prisma/client'

// Descuenta stock de las lineas de PRODUCTO de un cobro (solo las que controlan
// stock). Lo llama el caller en el momento de CONFIRMAR la venta (salida de
// ATENDIDA o creacion de venta directa), una sola vez por cobro. Permite stock
// negativo (alerta, no bloquea). Devuelve advertencias por linea bajo stock.
export async function descontarStockDeCobro(
  tx: Prisma.TransactionClient,
  consultorioId: number,
  cobroId: number,
  usuarioId: number,
): Promise<string[]> {
  const lineas = await tx.detalleCobro.findMany({
    where: { cobroId, consultorioId, productoId: { not: null } },
    select: {
      productoId: true, cantidad: true, descripcion: true,
      producto: { select: { controlaStock: true, stockActual: true } },
    },
  })
  const advertencias: string[] = []
  for (const l of lineas) {
    if (!l.producto?.controlaStock) continue
    if (l.cantidad > l.producto.stockActual) {
      advertencias.push(`Stock negativo en "${l.descripcion}" (habia ${l.producto.stockActual}, se vendieron ${l.cantidad})`)
    }
    await tx.producto.update({
      where: { id: l.productoId! },
      data: { stockActual: { decrement: l.cantidad } },
    })
  }
  if (lineas.length > 0) {
    await tx.log.create({
      data: {
        consultorioId, usuarioId, entidad: 'Cobro', entidadId: cobroId, accion: 'UPDATE',
        payloadDespues: { evento: 'descuento-stock', lineas: lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad })) },
      },
    })
  }
  return advertencias
}

// Espejo: restituye el stock descontado (al anular un cobro confirmado o reabrir
// una cita). Mismo set de lineas, increment.
export async function restituirStockDeCobro(
  tx: Prisma.TransactionClient,
  consultorioId: number,
  cobroId: number,
  usuarioId: number,
): Promise<void> {
  const lineas = await tx.detalleCobro.findMany({
    where: { cobroId, consultorioId, productoId: { not: null } },
    select: { productoId: true, cantidad: true, producto: { select: { controlaStock: true } } },
  })
  for (const l of lineas) {
    if (!l.producto?.controlaStock) continue
    await tx.producto.update({
      where: { id: l.productoId! },
      data: { stockActual: { increment: l.cantidad } },
    })
  }
  if (lineas.length > 0) {
    await tx.log.create({
      data: {
        consultorioId, usuarioId, entidad: 'Cobro', entidadId: cobroId, accion: 'UPDATE',
        payloadDespues: { evento: 'restitucion-stock', lineas: lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad })) },
      },
    })
  }
}
