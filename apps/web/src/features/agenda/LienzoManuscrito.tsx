import { useEffect, useRef, useState } from 'react'
import { PenLine, X } from 'lucide-react'
import {
  COLORES_LAPIZ,
  GROSORES_LAPIZ,
  HOJA_H,
  HOJA_W,
  hojaVacia,
  type Trazo,
  type TrazosHoja,
} from '@pos/types'
import { altoHoja, cuantizar, escalaHoja, pathDeTrazo, pintarHoja } from '../../components/manuscrito/dibujar'
import { cn } from '../../lib/utils'
import { btnIconUI } from '../../lib/ui'

interface Props {
  citaId: number
  onClose: () => void
}

/**
 * Espacio: pixeles CSS del canvas -> espacio logico de la hoja (0..HOJA_W,
 * 0..HOJA_H). Pura: solo usa el rect del propio elemento, sin estado del
 * componente, asi que vive fuera de LienzoManuscrito.
 */
function aEspacioHoja(clientX: number, clientY: number, rect: DOMRect) {
  return {
    x: ((clientX - rect.left) / rect.width) * HOJA_W,
    y: ((clientY - rect.top) / rect.height) * HOJA_H,
  }
}

// Un dispositivo sin presion reporta 0 (o 0.5 en algunos navegadores) en todos
// los puntos. Normalizamos a 0.5 para que pintarHoja() detecte el caso y deje
// que perfect-freehand simule la presion. Pura por el mismo motivo que arriba.
function presionDe(e: { pressure: number; pointerType: string }): number {
  if (e.pointerType !== 'pen') return 0.5
  return e.pressure > 0 ? e.pressure : 0.5
}

/**
 * Editor de una hoja manuscrita: captura el trazo del lapiz/dedo y lo pinta.
 * Una sola hoja en memoria, sin persistir (eso llega en Tareas 10 y 11).
 *
 * Estado pensado como seam para lo que sigue:
 * - `trazosRef` guarda TODOS los trazos cerrados de la hoja actual; Task 10
 *   lo convierte en un array de hojas + un indice de hoja activa.
 * - `color`/`grosor` son const por ahora (sin UI para cambiarlos); Task 9 los
 *   sube a useState y les cablea la barra inferior (hoy un placeholder).
 * - `sucio` marca cambios sin guardar; Task 11 lo consume para el autoguardado
 *   y lo vuelve a poner en false tras guardar.
 */
export function LienzoManuscrito({ citaId, onClose }: Props) {
  const areaRef = useRef<HTMLDivElement>(null)
  const canvasFondo = useRef<HTMLCanvasElement>(null)
  const canvasVivo = useRef<HTMLCanvasElement>(null)

  const trazosRef = useRef<TrazosHoja>(hojaVacia())
  const trazoActivo = useRef<Trazo | null>(null)
  const punteroActivo = useRef<number | null>(null)
  // Rechazo de palma: apenas se ve un lapiz en la sesion, el dedo deja de
  // dibujar. En celular sin lapiz, el dedo sigue dibujando. Sticky a
  // proposito para toda la vida del editor (no se resetea en pointercancel).
  const vioLapiz = useRef(false)

  // Placeholder de herramientas para Task 9 (sin UI para cambiarlos todavia).
  const color: string = COLORES_LAPIZ[0]
  const grosor: number = GROSORES_LAPIZ[1]

  const [sucio, setSucio] = useState(false)

  // Ancho de render en pixeles CSS: se mide el area disponible (ya sin el
  // padding del contenedor) y se elige el mayor ancho que entra tanto a lo
  // ancho como a lo alto sin recortar la hoja ni forzar scroll.
  const [anchoCss, setAnchoCss] = useState(0)
  const altoCss = altoHoja(anchoCss)

  useEffect(() => {
    const el = areaRef.current
    if (!el) return

    function medir() {
      const actual = areaRef.current
      if (!actual) return
      const disponibleAncho = actual.clientWidth
      const disponibleAlto = actual.clientHeight
      if (disponibleAncho <= 0 || disponibleAlto <= 0) return
      const anchoPorAlto = (disponibleAlto * HOJA_W) / HOJA_H
      setAnchoCss(Math.max(0, Math.floor(Math.min(disponibleAncho, anchoPorAlto))))
    }

    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Cerrar con Escape (mismo gesto que el resto de overlays de la app).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Aviso nativo si se cierra la pestaña con trazos sin guardar: no hay
  // autoguardado todavia (Task 11), asi que perderlos seria silencioso.
  useEffect(() => {
    if (!sucio) return
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [sucio])

  function contexto(canvas: HTMLCanvasElement | null): CanvasRenderingContext2D | null {
    if (!canvas || anchoCss <= 0) return null
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    const escala = escalaHoja(anchoCss, dpr)
    const anchoFisico = Math.round(anchoCss * dpr)
    // Igual que HojaRenderer: el alto fisico sale de escala*HOJA_H, no de
    // altoCss*dpr, para no redondear dos veces (altoCss ya esta redondeado a
    // pixeles CSS).
    const altoFisico = Math.round(escala * HOJA_H)
    if (canvas.width !== anchoFisico || canvas.height !== altoFisico) {
      canvas.width = anchoFisico
      canvas.height = altoFisico
    }
    ctx.setTransform(escala, 0, 0, escala, 0, 0)
    return ctx
  }

  /** Redibuja TODOS los trazos cerrados. Solo al cambiar la lista o el tamano. */
  function pintarFondo() {
    const ctx = contexto(canvasFondo.current)
    if (!ctx) return
    ctx.clearRect(0, 0, HOJA_W, HOJA_H)
    pintarHoja(ctx, trazosRef.current)
  }

  /** Redibuja solo el trazo en curso. Se llama en cada pointermove. */
  function pintarVivo() {
    const ctx = contexto(canvasVivo.current)
    if (!ctx || !trazoActivo.current) return
    ctx.clearRect(0, 0, HOJA_W, HOJA_H)
    ctx.fillStyle = trazoActivo.current.c
    ctx.fill(pathDeTrazo(trazoActivo.current, trazoActivo.current.p.every((p) => p[2] === 0.5)))
  }

  function limpiarVivo() {
    const ctx = contexto(canvasVivo.current)
    ctx?.clearRect(0, 0, HOJA_W, HOJA_H)
  }

  // El canvas de fondo se reasigna width/height dentro de contexto() al
  // cambiar el tamano, lo que el navegador limpia implicitamente: sin este
  // efecto, redimensionar la ventana borraria visualmente los trazos ya
  // cerrados hasta el proximo trazo nuevo.
  useEffect(() => {
    pintarFondo()
  }, [anchoCss, altoCss])

  function puedeDibujar(e: React.PointerEvent) {
    if (e.pointerType === 'pen') return true
    if (e.pointerType === 'mouse') return true
    return !vioLapiz.current // touch: solo si nunca aparecio un lapiz
  }

  function alBajar(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.pointerType === 'pen') vioLapiz.current = true
    if (!puedeDibujar(e)) return
    if (punteroActivo.current !== null) return // ya hay un trazo en curso

    e.currentTarget.setPointerCapture(e.pointerId)
    punteroActivo.current = e.pointerId

    const { x, y } = aEspacioHoja(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
    trazoActivo.current = {
      c: color,
      s: grosor,
      p: [cuantizar(x, y, presionDe(e))],
    }
  }

  function alMover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (punteroActivo.current !== e.pointerId || !trazoActivo.current) return

    // getCoalescedEvents recupera los puntos que el navegador agrupa entre
    // frames (el Pencil muestrea a mas de 120 Hz). Safari lo tiene recien
    // desde la 18.2: sin deteccion, en un iPad viejo esto revienta.
    const eventos =
      typeof e.nativeEvent.getCoalescedEvents === 'function'
        ? e.nativeEvent.getCoalescedEvents()
        : [e.nativeEvent]

    const r = e.currentTarget.getBoundingClientRect()
    for (const ev of eventos) {
      const { x, y } = aEspacioHoja(ev.clientX, ev.clientY, r)
      trazoActivo.current.p.push(cuantizar(x, y, presionDe(ev)))
    }
    pintarVivo()
  }

  function alSubir(e: React.PointerEvent<HTMLCanvasElement>) {
    if (punteroActivo.current !== e.pointerId) return
    punteroActivo.current = null
    const trazo = trazoActivo.current
    trazoActivo.current = null
    if (!trazo || trazo.p.length === 0) return

    trazosRef.current = { ...trazosRef.current, strokes: [...trazosRef.current.strokes, trazo] }
    limpiarVivo()
    pintarFondo()
    setSucio(true)
  }

  return (
    <div className="fixed inset-0 z-[60] bg-neutral-100 dark:bg-neutral-900 flex flex-col">
      <header className="shrink-0 flex items-center gap-3 h-14 px-4 sm:px-6 border-b bg-card/90 backdrop-blur-xs">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20"
          aria-hidden="true"
        >
          <PenLine className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold text-foreground leading-tight truncate">Nota manuscrita</h1>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground leading-snug truncate">
            <span>Cita #{citaId}</span>
            {sucio && (
              <span className="inline-flex items-center gap-1 shrink-0 text-amber-600 dark:text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                Sin guardar
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar nota manuscrita"
          className={cn(btnIconUI, 'shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground')}
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-hidden p-4 sm:p-6">
        <div ref={areaRef} className="flex h-full w-full items-center justify-center">
          {anchoCss > 0 && (
            <div className="relative touch-none select-none" style={{ width: anchoCss, height: altoCss }}>
              <canvas ref={canvasFondo} aria-hidden="true" className="absolute inset-0 rounded-md bg-white shadow-sm" />
              <canvas
                ref={canvasVivo}
                aria-label="Hoja para escribir a mano con el lapiz o el dedo"
                className="absolute inset-0 rounded-md"
                style={{ touchAction: 'none', overscrollBehavior: 'none' }}
                onPointerDown={alBajar}
                onPointerMove={alMover}
                onPointerUp={alSubir}
                onPointerCancel={alSubir}
              />
            </div>
          )}
        </div>
      </div>

      <footer className="shrink-0 flex items-center justify-center h-16 px-4 border-t bg-card/90 backdrop-blur-xs">
        <p className="text-xs text-muted-foreground">Colores y grosores de lápiz próximamente</p>
      </footer>
    </div>
  )
}
