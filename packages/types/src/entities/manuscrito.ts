// Notas manuscritas (2026-08-10). El formato se versiona con `v` para poder
// cambiarlo sin romper hojas ya guardadas.

/** [x, y, presion]. Coordenadas en espacio logico de la hoja, no en pixeles. */
export type PuntoTrazo = [number, number, number]

export interface Trazo {
  /** Color en hex, ej "#111827" */
  c: string
  /** Grosor base del trazo */
  s: number
  /** Puntos del trazo */
  p: PuntoTrazo[]
}

export interface TrazosHoja {
  /** Version del formato */
  v: number
  /** Ancho logico de la hoja */
  w: number
  /** Alto logico de la hoja */
  h: number
  strokes: Trazo[]
}

export const TRAZOS_VERSION = 1

/**
 * A4 vertical a ~150dpi. Siguen siendo las medidas por defecto: toda hoja
 * creada antes de que existiera la orientacion tiene exactamente estas.
 */
export const HOJA_W = 1240
export const HOJA_H = 1754

/**
 * Una hoja es A4 en una de las dos orientaciones. La orientacion se decide al
 * crearla y despues NO se cambia si ya tiene tinta: los trazos estan guardados
 * en coordenadas de la hoja, asi que dar vuelta las medidas los mandaria fuera
 * del papel. Una hoja vacia si se puede dar vuelta (no hay nada que mover).
 */
export type OrientacionHoja = 'vertical' | 'horizontal'

/** Medidas logicas de la hoja para cada orientacion. */
export function dimensionesHoja(orientacion: OrientacionHoja): { w: number; h: number } {
  return orientacion === 'horizontal' ? { w: HOJA_H, h: HOJA_W } : { w: HOJA_W, h: HOJA_H }
}

/**
 * Orientacion de una hoja ya guardada. Se deduce de sus propias medidas, que
 * es lo unico confiable: son las que se usaron para dibujar sus trazos.
 */
export function orientacionDeTrazos(trazos: { w: number; h: number }): OrientacionHoja {
  return trazos.w > trazos.h ? 'horizontal' : 'vertical'
}

/** Las dos unicas medidas que se aceptan, en el orden en que se validan. */
export const MEDIDAS_HOJA_VALIDAS: ReadonlyArray<{ w: number; h: number }> = [
  { w: HOJA_W, h: HOJA_H },
  { w: HOJA_H, h: HOJA_W },
]

export const MAX_HOJAS_POR_ATENCION = 20
export const MAX_TRAZOS_BYTES = 2_097_152
export const MAX_PUNTOS_POR_TRAZO = 10_000

/** Lado largo del PNG que se manda a transcribir */
export const OCR_LADO_LARGO = 2576

export const COLORES_LAPIZ = ['#111827', '#1d4ed8', '#b91c1c'] as const
export const GROSORES_LAPIZ = [2, 4, 7] as const

export function hojaVacia(orientacion: OrientacionHoja = 'vertical'): TrazosHoja {
  const { w, h } = dimensionesHoja(orientacion)
  return { v: TRAZOS_VERSION, w, h, strokes: [] }
}

/**
 * Forma en que la API devuelve una hoja. `trazos` viaja como JSON generico en
 * Prisma, asi que del lado del cliente hay que castearlo a TrazosHoja tras
 * leerlo (el server ya lo valido con validarTrazos al guardarlo).
 */
export interface HojaManuscritaApi {
  id: number
  atencionId: number
  orden: number
  trazos: TrazosHoja
  transcripcion: string | null
  transcritoAt: string | null
  createdAt: string
  updatedAt: string
}
