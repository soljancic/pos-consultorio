import {
  HOJA_H,
  HOJA_W,
  MAX_PUNTOS_POR_TRAZO,
  MAX_TRAZOS_BYTES,
  TRAZOS_VERSION,
} from '@pos/types'
import { siguienteOrden, validarTrazos } from './manuscrito.validator'

function hojaValida() {
  return {
    v: TRAZOS_VERSION,
    w: HOJA_W,
    h: HOJA_H,
    strokes: [{ c: '#111827', s: 4, p: [[10, 20, 0.5], [11, 21, 0.6]] }],
  }
}

describe('validarTrazos', () => {
  it('acepta una hoja bien formada y la devuelve', () => {
    const hoja = hojaValida()
    expect(validarTrazos(hoja)).toEqual(hoja)
  })

  it('acepta una hoja sin trazos', () => {
    const hoja = { v: TRAZOS_VERSION, w: HOJA_W, h: HOJA_H, strokes: [] }
    expect(validarTrazos(hoja)).toEqual(hoja)
  })

  it('rechaza null y tipos que no son objeto', () => {
    expect(() => validarTrazos(null)).toThrow(/trazos/i)
    expect(() => validarTrazos('hola')).toThrow(/trazos/i)
    expect(() => validarTrazos([])).toThrow(/trazos/i)
  })

  it('rechaza una version desconocida', () => {
    expect(() => validarTrazos({ ...hojaValida(), v: 99 })).toThrow(/versi/i)
  })

  it('rechaza dimensiones que no son A4 en ninguna de las dos orientaciones', () => {
    expect(() => validarTrazos({ ...hojaValida(), w: 800 })).toThrow(/dimensiones/i)
    expect(() => validarTrazos({ ...hojaValida(), h: 100 })).toThrow(/dimensiones/i)
    // Ni siquiera un cuadrado con los dos lados de medidas validas.
    expect(() => validarTrazos({ ...hojaValida(), w: HOJA_W, h: HOJA_W })).toThrow(/dimensiones/i)
  })

  it('acepta una hoja apaisada (A4 girada)', () => {
    const hoja = { ...hojaValida(), w: HOJA_H, h: HOJA_W }
    expect(validarTrazos(hoja)).toEqual(hoja)
  })

  it('valida los puntos contra las medidas DE ESA hoja, no contra la vertical', () => {
    // Un punto pasada la mitad derecha de una hoja apaisada: legitimo ahi,
    // fuera de la hoja en una vertical. Si el validador usara siempre las
    // medidas verticales, escribir en la mitad derecha de una hoja acostada
    // daria 400.
    const apaisadaOk = { ...hojaValida(), w: HOJA_H, h: HOJA_W, strokes: [{ c: '#111827', s: 4, p: [[HOJA_W + 200, 20, 0.5]] }] }
    expect(validarTrazos(apaisadaOk)).toEqual(apaisadaOk)

    // Y al reves: ese mismo alto es valido en vertical pero se pasa del
    // borde de abajo de una apaisada.
    const apaisadaFuera = { ...hojaValida(), w: HOJA_H, h: HOJA_W, strokes: [{ c: '#111827', s: 4, p: [[20, HOJA_W + 200, 0.5]] }] }
    expect(() => validarTrazos(apaisadaFuera)).toThrow(/fuera de la hoja/i)
  })

  it('rechaza un color que no es hex de 6 digitos', () => {
    const hoja = hojaValida()
    hoja.strokes[0].c = 'red'
    expect(() => validarTrazos(hoja)).toThrow(/color/i)
  })

  it('rechaza un grosor fuera de rango', () => {
    const hoja = hojaValida()
    hoja.strokes[0].s = 0
    expect(() => validarTrazos(hoja)).toThrow(/grosor/i)
  })

  it('rechaza un punto que no es una tripleta numerica', () => {
    const hoja = hojaValida()
    hoja.strokes[0].p = [[10, 20] as never]
    expect(() => validarTrazos(hoja)).toThrow(/punto/i)
  })

  it('rechaza coordenadas fuera de la hoja', () => {
    const hoja = hojaValida()
    hoja.strokes[0].p = [[HOJA_W + 50, 20, 0.5]]
    expect(() => validarTrazos(hoja)).toThrow(/fuera/i)
  })

  it('rechaza una presion fuera de 0..1', () => {
    const hoja = hojaValida()
    hoja.strokes[0].p = [[10, 20, 3]]
    expect(() => validarTrazos(hoja)).toThrow(/presi/i)
  })

  it('rechaza un trazo con demasiados puntos', () => {
    const hoja = hojaValida()
    hoja.strokes[0].p = Array.from(
      { length: MAX_PUNTOS_POR_TRAZO + 1 },
      () => [1, 1, 0.5] as [number, number, number],
    )
    expect(() => validarTrazos(hoja)).toThrow(/puntos/i)
  })

  it('rechaza una hoja mas pesada que el tope', () => {
    // Un trazo por debajo del tope de puntos, repetido hasta pasar 2 MB.
    const trazo = {
      c: '#111827',
      s: 4,
      p: Array.from({ length: 5000 }, () => [1234.5, 1234.5, 0.55] as [number, number, number]),
    }
    const hoja = { v: TRAZOS_VERSION, w: HOJA_W, h: HOJA_H, strokes: Array.from({ length: 40 }, () => trazo) }
    expect(Buffer.byteLength(JSON.stringify(hoja))).toBeGreaterThan(MAX_TRAZOS_BYTES)
    expect(() => validarTrazos(hoja)).toThrow(/pesa/i)
  })
})

describe('siguienteOrden', () => {
  it('arranca en 1 cuando no hay hojas', () => {
    expect(siguienteOrden([])).toBe(1)
  })

  it('usa el maximo mas uno', () => {
    expect(siguienteOrden([1, 2, 3])).toBe(4)
  })

  // Regresion: una hoja borrada (soft delete) sigue ocupando su `orden` por el
  // @@unique([atencionId, orden]). Si se calculara sobre las hojas vivas, borrar
  // la ultima y crear otra chocaria contra la fila borrada.
  it('cuenta tambien los ordenes de hojas borradas', () => {
    expect(siguienteOrden([1, 2, 3 /* borrada */])).toBe(4)
  })

  it('no se rompe con ordenes desordenados o con huecos', () => {
    expect(siguienteOrden([5, 1, 3])).toBe(6)
  })
})
