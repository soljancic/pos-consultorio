import {
  HOJA_H,
  HOJA_W,
  MAX_PUNTOS_POR_TRAZO,
  MAX_TRAZOS_BYTES,
  TRAZOS_VERSION,
  type TrazosHoja,
} from '@pos/types'

const HEX = /^#[0-9a-fA-F]{6}$/
// Margen de tolerancia: el trazo puede salirse un poco del borde al dibujar
// cerca del limite y no queremos rechazar una hoja legitima por 2 pixeles.
const MARGEN = 20

function esObjetoPlano(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Valida el JSON de trazos que manda el cliente. Lanza Error con mensaje en
 * espanol al primer problema. Funcion pura: no conoce Nest ni Prisma, para que
 * sea trivial de testear. El caller la envuelve en BadRequestException.
 */
export function validarTrazos(valor: unknown): TrazosHoja {
  if (!esObjetoPlano(valor)) {
    throw new Error('Los trazos deben ser un objeto')
  }
  if (valor.v !== TRAZOS_VERSION) {
    throw new Error(`Versión de trazos no soportada (esperada ${TRAZOS_VERSION})`)
  }
  if (valor.w !== HOJA_W || valor.h !== HOJA_H) {
    throw new Error(`Dimensiones de hoja inválidas (esperadas ${HOJA_W}x${HOJA_H})`)
  }
  if (!Array.isArray(valor.strokes)) {
    throw new Error('Los trazos deben traer un arreglo strokes')
  }

  // El tope de peso se chequea primero sobre el JSON completo: es la defensa
  // real contra una fila patologica, independiente de cuantos trazos tenga.
  if (Buffer.byteLength(JSON.stringify(valor)) > MAX_TRAZOS_BYTES) {
    throw new Error('La hoja pesa más de 2 MB')
  }

  for (const trazo of valor.strokes) {
    if (!esObjetoPlano(trazo)) {
      throw new Error('Cada trazo debe ser un objeto')
    }
    if (typeof trazo.c !== 'string' || !HEX.test(trazo.c)) {
      throw new Error('Color de trazo inválido (se espera hex de 6 dígitos)')
    }
    if (typeof trazo.s !== 'number' || !Number.isFinite(trazo.s) || trazo.s <= 0 || trazo.s > 64) {
      throw new Error('Grosor de trazo inválido')
    }
    if (!Array.isArray(trazo.p)) {
      throw new Error('Cada trazo debe traer un arreglo de puntos')
    }
    if (trazo.p.length > MAX_PUNTOS_POR_TRAZO) {
      throw new Error(`Un trazo supera el máximo de ${MAX_PUNTOS_POR_TRAZO} puntos`)
    }
    for (const punto of trazo.p) {
      if (!Array.isArray(punto) || punto.length !== 3 || !punto.every((n) => typeof n === 'number' && Number.isFinite(n))) {
        throw new Error('Cada punto debe ser [x, y, presión] numérico')
      }
      const [x, y, presion] = punto as [number, number, number]
      if (x < -MARGEN || x > HOJA_W + MARGEN || y < -MARGEN || y > HOJA_H + MARGEN) {
        throw new Error('Hay un punto fuera de la hoja')
      }
      if (presion < 0 || presion > 1) {
        throw new Error('La presión debe estar entre 0 y 1')
      }
    }
  }

  return valor as unknown as TrazosHoja
}

/**
 * Siguiente `orden` para una hoja nueva.
 *
 * OJO: recibe los ordenes de TODAS las filas de la atencion, incluidas las que
 * tienen deletedAt. Una hoja borrada sigue ocupando su `orden` por el
 * @@unique([atencionId, orden]); calcular sobre las vivas chocaria contra ella.
 */
export function siguienteOrden(ordenesExistentes: number[]): number {
  if (ordenesExistentes.length === 0) return 1
  return Math.max(...ordenesExistentes) + 1
}
