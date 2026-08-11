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

/** A4 vertical a ~150dpi */
export const HOJA_W = 1240
export const HOJA_H = 1754

export const MAX_HOJAS_POR_ATENCION = 20
export const MAX_TRAZOS_BYTES = 2_097_152
export const MAX_PUNTOS_POR_TRAZO = 10_000

/** Lado largo del PNG que se manda a transcribir */
export const OCR_LADO_LARGO = 2576

export const COLORES_LAPIZ = ['#111827', '#1d4ed8', '#b91c1c'] as const
export const GROSORES_LAPIZ = [2, 4, 7] as const

export function hojaVacia(): TrazosHoja {
  return { v: TRAZOS_VERSION, w: HOJA_W, h: HOJA_H, strokes: [] }
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
