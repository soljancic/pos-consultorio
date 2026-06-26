import { Decimal } from '@prisma/client/runtime/library'
import { calcularRepartoDevolucion } from './devolucion.helper'

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
