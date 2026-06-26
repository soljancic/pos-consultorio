import { Decimal } from '@prisma/client/runtime/library'
import { calcularRepartoDevolucion, planificarReembolso } from './devolucion.helper'

const D = (n: number | string) => new Decimal(n)

describe('calcularRepartoDevolucion', () => {
  it('item no pagado: todo baja deuda, sin reembolso', () => {
    // total 150, descuento 0, saldo 150 (nada pagado), linea 50
    const r = calcularRepartoDevolucion(D(150), D(0), D(150), D(50))
    expect(r.totalNuevo.toString()).toBe('100')
    expect(r.delta.toString()).toBe('50')
    expect(r.deudaReduccion.toString()).toBe('50')
    expect(r.reembolso.toString()).toBe('0')
    expect(r.nuevoSaldo.toString()).toBe('100')
  })

  it('item totalmente pagado: todo es reembolso', () => {
    // total 150, descuento 0, saldo 0 (todo pagado), linea 50
    const r = calcularRepartoDevolucion(D(150), D(0), D(0), D(50))
    expect(r.totalNuevo.toString()).toBe('100')
    expect(r.delta.toString()).toBe('50')
    expect(r.deudaReduccion.toString()).toBe('0')
    expect(r.reembolso.toString()).toBe('50')
    expect(r.nuevoSaldo.toString()).toBe('0')
  })

  it('item parcialmente pagado: parte deuda, parte reembolso', () => {
    // total 150, descuento 0, saldo 20 (pago 130), linea 50 -> deuda baja 20, reembolso 30
    const r = calcularRepartoDevolucion(D(150), D(0), D(20), D(50))
    expect(r.deudaReduccion.toString()).toBe('20')
    expect(r.reembolso.toString()).toBe('30')
    expect(r.nuevoSaldo.toString()).toBe('0')
    expect(r.totalNuevo.toString()).toBe('100')
  })

  it('conserva el descuento si no supera el nuevo bruto', () => {
    // bruto 150 (total 140 + descuento 10), saldo 140, linea 50
    // brutoNuevo 100, descuentoNuevo 10, totalNuevo 90, delta 50
    const r = calcularRepartoDevolucion(D(140), D(10), D(140), D(50))
    expect(r.descuentoNuevo.toString()).toBe('10')
    expect(r.totalNuevo.toString()).toBe('90')
    expect(r.delta.toString()).toBe('50')
  })

  it('recorta el descuento si supera el nuevo bruto', () => {
    // bruto 60 (total 40 + descuento 20), saldo 40, linea 50
    // brutoNuevo 10, descuentoNuevo min(20,10)=10, totalNuevo 0, delta 40
    const r = calcularRepartoDevolucion(D(40), D(20), D(40), D(50))
    expect(r.descuentoNuevo.toString()).toBe('10')
    expect(r.totalNuevo.toString()).toBe('0')
    expect(r.delta.toString()).toBe('40')
  })
})

describe('planificarReembolso', () => {
  const efectivo = (id: number, monto: number) => ({ id, monto: D(monto), tipoCuentaId: 1, esEfectivo: true })
  const tarjeta = (id: number, monto: number) => ({ id, monto: D(monto), tipoCuentaId: 2, esEfectivo: false })

  it('un solo pago que cubre el reembolso', () => {
    const movs = planificarReembolso([efectivo(10, 100)], D(30))
    expect(movs).toHaveLength(1)
    expect(movs[0].tipoCuentaId).toBe(1)
    expect(movs[0].monto.toString()).toBe('30')
    expect(movs[0].esEfectivo).toBe(true)
  })

  it('toma del mas reciente primero y parte el del borde', () => {
    // lista YA ordenada desc por fecha: tarjeta (reciente), efectivo (viejo)
    const movs = planificarReembolso([tarjeta(20, 30), efectivo(10, 100)], D(40))
    expect(movs).toHaveLength(2)
    expect(movs[0]).toMatchObject({ tipoCuentaId: 2, esEfectivo: false })
    expect(movs[0].monto.toString()).toBe('30')
    expect(movs[1]).toMatchObject({ tipoCuentaId: 1, esEfectivo: true })
    expect(movs[1].monto.toString()).toBe('10')
  })

  it('reembolso 0 no genera movimientos', () => {
    expect(planificarReembolso([efectivo(10, 100)], D(0))).toHaveLength(0)
  })

  it('suma de movimientos == reembolso', () => {
    const movs = planificarReembolso([tarjeta(20, 25), efectivo(10, 100)], D(60))
    const suma = movs.reduce((acc: Decimal, m) => acc.plus(m.monto), D(0))
    expect(suma.toString()).toBe('60')
  })
})
