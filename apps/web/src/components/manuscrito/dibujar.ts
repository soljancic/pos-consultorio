import { getStroke } from 'perfect-freehand'
import type { PuntoTrazo, Trazo, TrazosHoja } from '@pos/types'

/**
 * Medidas logicas de la hoja sobre la que se dibuja. SIEMPRE se toman de la
 * hoja concreta (`trazos.w` / `trazos.h`) y nunca de una constante: desde que
 * existen las hojas apaisadas, la vertical dejo de ser la unica forma posible
 * y asumirla mandaria la mitad de una hoja horizontal fuera del papel.
 */
export type MedidasHoja = { w: number; h: number }

// Opciones de perfect-freehand afinadas para escritura (no para dibujo libre):
// streamline bajo mantiene la letra fiel, thinning medio da el efecto pluma.
const OPCIONES_BASE = {
  thinning: 0.55,
  smoothing: 0.5,
  streamline: 0.32,
  last: true,
}

/**
 * Redondea el punto antes de guardarlo: 1 decimal en coordenadas y 2 en la
 * presion recorta el JSON casi a la mitad sin que se note en el trazo.
 *
 * Tambien clampea x/y al rango de la hoja (0..medidas.w, 0..medidas.h). Con
 * setPointerCapture activo (Task 8) el lapiz sigue reportando coordenadas
 * aunque la mano se vaya del canvas; sin este clamp esos puntos viajarian
 * cientos de unidades fuera de la hoja y el server los rechaza con 400 (el
 * validador tolera solo MARGEN=20 mas alla del borde). Se clampea aca, en el
 * unico punto por el que pasa TODO punto antes de entrar a un Trazo (el
 * pointerdown inicial y cada evento del bucle de pointermove), en vez de en
 * cada call site que construye un trazo, para que la garantia "todo punto
 * vive dentro de la hoja" no dependa de que cada futura herramienta (Task 9+)
 * se acuerde de clampear. Ademas es el comportamiento correcto de una hoja de
 * papel real: el trazo se corta visualmente en el borde, no se escapa de el.
 */
export function cuantizar(x: number, y: number, presion: number, medidas: MedidasHoja): PuntoTrazo {
  const xc = Math.min(medidas.w, Math.max(0, x))
  const yc = Math.min(medidas.h, Math.max(0, y))
  return [Math.round(xc * 10) / 10, Math.round(yc * 10) / 10, Math.round(presion * 100) / 100]
}

/**
 * Alto en pixeles CSS que preserva la proporcion de la hoja para un ancho de
 * render dado. Espacio: pixeles CSS -> pixeles CSS.
 */
export function altoHoja(ancho: number, medidas: MedidasHoja): number {
  return Math.round((ancho * medidas.h) / medidas.w)
}

/**
 * Factor de escala que mapea el espacio logico de la hoja (0..medidas.w,
 * 0..medidas.h) a pixeles fisicos del canvas, para un ancho de render en
 * pixeles CSS y un devicePixelRatio dados. Espacio: logico de hoja ->
 * fisico de canvas.
 */
export function escalaHoja(ancho: number, dpr: number, medidas: MedidasHoja): number {
  return (ancho * dpr) / medidas.w
}

/**
 * Convierte un trazo en un Path2D listo para rellenar. getStroke() devuelve el
 * CONTORNO del trazo como poligono; se suaviza con curvas cuadraticas entre
 * puntos medios, que es lo que hace que la letra no se vea facetada.
 */
export function pathDeTrazo(trazo: Trazo, simularPresion: boolean): Path2D {
  const contorno = getStroke(trazo.p as number[][], {
    ...OPCIONES_BASE,
    // trazo.s se captura como grosor tipo radio; getStroke espera un
    // DIAMETRO. El x2 tiene que ser identico en el editor (trazo en vivo) y
    // aca (replay) o el trazo cambia de grosor al recargar la pagina.
    size: trazo.s * 2,
    simulatePressure: simularPresion,
  }) as number[][]

  const path = new Path2D()
  if (contorno.length === 0) return path

  path.moveTo(contorno[0][0], contorno[0][1])
  for (let i = 0; i < contorno.length; i++) {
    const [x0, y0] = contorno[i]
    const [x1, y1] = contorno[(i + 1) % contorno.length]
    path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
  }
  path.closePath()
  return path
}

/**
 * Pinta la hoja completa. El caller ya dejo el contexto escalado al tamano
 * logico de la hoja y limpio el canvas.
 */
export function pintarHoja(ctx: CanvasRenderingContext2D, trazos: TrazosHoja): void {
  for (const trazo of trazos.strokes) {
    // Si todos los puntos vienen con presion 0.5 exacta, el dispositivo no
    // reporta presion (dedo o mouse): dejamos que la libreria la simule.
    const sinPresionReal = trazo.p.every((p) => p[2] === 0.5)
    ctx.fillStyle = trazo.c
    ctx.fill(pathDeTrazo(trazo, sinPresionReal))
  }
}
