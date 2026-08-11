import { useEffect, useRef, useState } from 'react'
import { Check, Eraser, Pen, PenLine, Redo2, Undo2, X } from 'lucide-react'
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

// Nombres en espanol de las paletas de @pos/types, solo para aria-label/title
// (accesibilidad). Si la paleta cambia de valores, cae al hex/numero crudo en
// vez de romper: nunca se usan para logica, solo como copy.
const NOMBRE_COLOR: Record<string, string> = { '#111827': 'Negro', '#1d4ed8': 'Azul', '#b91c1c': 'Rojo' }
const NOMBRE_GROSOR: Record<number, string> = { 2: 'Fino', 4: 'Medio', 7: 'Grueso' }

/**
 * Editor de una hoja manuscrita: captura el trazo del lapiz/dedo y lo pinta.
 * Una sola hoja en memoria, sin persistir (eso llega en Tareas 10 y 11).
 *
 * Estado pensado como seam para lo que sigue:
 * - `trazosRef` guarda TODOS los trazos cerrados de la hoja actual; Task 10
 *   lo convierte en un array de hojas + un indice de hoja activa.
 * - `sucio` marca cambios sin guardar; Task 11 lo consume para el autoguardado
 *   y lo vuelve a poner en false tras guardar.
 *
 * Deshacer/rehacer: pila simple sobre la lista de trazos (el estado de una
 * hoja ES su lista de trazos, no hace falta nada mas sofisticado). Cada
 * mutacion (trazo nuevo, borrado) llama `registrarCambio()` ANTES de mutar,
 * lo que empuja el estado previo a `pilaDeshacer` y vacia `pilaRehacer`.
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
  // Herramienta congelada al aceptar el gesto (alBajar): un segundo puntero
  // que toca un boton de la barra (DOM fuera del canvas, no bloqueado por el
  // pointer capture del primer puntero) puede cambiar `herramienta` en vivo
  // a mitad de un trazo. alMover/alSubir leen esta copia congelada, no el
  // estado vivo, para que ese cambio nunca trunque un trazo ya en curso.
  const herramientaGesto = useRef<'lapiz' | 'borrador'>('lapiz')
  // Un solo undo por arrastre de borrador: true apenas el gesto actual borro
  // al menos un trazo (ver borrarEn). Se resetea en cada alBajar.
  const borradoRegistrado = useRef(false)

  const [herramienta, setHerramienta] = useState<'lapiz' | 'borrador'>('lapiz')
  const [color, setColor] = useState<string>(COLORES_LAPIZ[0])
  const [grosor, setGrosor] = useState<number>(GROSORES_LAPIZ[1])

  // Deshacer/rehacer: pila de listas de trazos completas (ver JSDoc arriba).
  const pilaDeshacer = useRef<Trazo[][]>([])
  const pilaRehacer = useRef<Trazo[][]>([])
  const [puedeDeshacer, setPuedeDeshacer] = useState(false)
  const [puedeRehacer, setPuedeRehacer] = useState(false)

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

  /** Reemplaza la lista de trazos y repinta. Unico camino que escribe en trazosRef. */
  function aplicar(strokes: Trazo[]) {
    trazosRef.current = { ...trazosRef.current, strokes }
    pintarFondo()
    setSucio(true)
    setPuedeDeshacer(pilaDeshacer.current.length > 0)
    setPuedeRehacer(pilaRehacer.current.length > 0)
  }

  /** Llamar ANTES de cada cambio (trazo nuevo, borrado). */
  function registrarCambio() {
    pilaDeshacer.current.push(trazosRef.current.strokes)
    pilaRehacer.current = []
  }

  function deshacer() {
    const anterior = pilaDeshacer.current.pop()
    if (!anterior) return
    pilaRehacer.current.push(trazosRef.current.strokes)
    aplicar(anterior)
  }

  function rehacer() {
    const siguiente = pilaRehacer.current.pop()
    if (!siguiente) return
    pilaDeshacer.current.push(trazosRef.current.strokes)
    aplicar(siguiente)
  }

  // Radio del borrador en espacio logico de hoja (0..HOJA_W, 0..HOJA_H), no
  // en pixeles CSS. Se suma el grosor del propio trazo (t.s) al radio fijo
  // para que un trazo grueso sea borrable donde visualmente se ve, no solo
  // donde pasa su linea central de puntos.
  const RADIO_BORRADOR = 14

  /**
   * Borra el trazo ENTERO que el punto toca (modelo vectorial, no pixeles).
   * Se llama una vez por evento (incluidos los coalescidos) mientras dura el
   * arrastre del borrador, asi que un solo gesto puede llamarla decenas de
   * veces. `registrarCambio()` solo se llama en el PRIMER borrado real del
   * gesto (guardado por `borradoRegistrado`, reseteado en alBajar): el
   * snapshot que empuja es el estado previo a CUALQUIER borrado del gesto,
   * asi que un unico "Deshacer" restaura todo lo que el arrastre borro. Un
   * gesto que no borra nada (arrastre sobre hoja en blanco) nunca toca la
   * pila de deshacer.
   */
  function borrarEn(x: number, y: number) {
    const quedan = trazosRef.current.strokes.filter(
      (t) => !t.p.some(([px, py]) => Math.hypot(px - x, py - y) < RADIO_BORRADOR + t.s),
    )
    if (quedan.length === trazosRef.current.strokes.length) return

    if (!borradoRegistrado.current) {
      registrarCambio()
      borradoRegistrado.current = true
    }
    aplicar(quedan)
  }

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
    // Congelar herramienta y reiniciar el contador de borrado para ESTE
    // gesto: ver comentarios en la declaracion de ambos refs.
    herramientaGesto.current = herramienta
    borradoRegistrado.current = false

    const { x, y } = aEspacioHoja(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())

    if (herramientaGesto.current === 'borrador') {
      borrarEn(x, y)
      return
    }

    trazoActivo.current = {
      c: color,
      s: grosor,
      p: [cuantizar(x, y, presionDe(e))],
    }
  }

  function alMover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (punteroActivo.current !== e.pointerId) return

    // getCoalescedEvents recupera los puntos que el navegador agrupa entre
    // frames (el Pencil muestrea a mas de 120 Hz). Safari lo tiene recien
    // desde la 18.2: sin deteccion, en un iPad viejo esto revienta.
    const eventos =
      typeof e.nativeEvent.getCoalescedEvents === 'function'
        ? e.nativeEvent.getCoalescedEvents()
        : [e.nativeEvent]
    const r = e.currentTarget.getBoundingClientRect()

    // Lee la herramienta CONGELADA en alBajar, no el estado vivo: un segundo
    // puntero tocando la barra a mitad de gesto no debe cambiar de rama aca.
    if (herramientaGesto.current === 'borrador') {
      for (const ev of eventos) {
        const { x, y } = aEspacioHoja(ev.clientX, ev.clientY, r)
        borrarEn(x, y)
      }
      return
    }

    if (!trazoActivo.current) return
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
    // No hace falta leer herramientaGesto aca: trazoActivo solo se llena en
    // alBajar cuando el gesto arranco en 'lapiz' (ver arriba), asi que este
    // guard ya es, en los hechos, "solo comitear si el gesto fue de lapiz".
    if (!trazo || trazo.p.length === 0) return

    registrarCambio()
    aplicar([...trazosRef.current.strokes, trazo])
    limpiarVivo()
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
          // btnIconUI es h-9 w-9 (36px): bajo el piso de 44px. Esta pantalla
          // es la superficie de escritura en tablet, el unico lugar de la app
          // donde un toque fallado le cuesta al doctor su lugar a mitad de la
          // nota, asi que el target se agranda local (no se toca el token
          // compartido, usado en 16+ archivos); el icono queda del mismo
          // tamano, solo crece el area de toque.
          className={cn(btnIconUI, 'h-11 w-11 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground')}
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
                aria-label="Hoja para escribir a mano con el lápiz o el dedo"
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

      <footer className="shrink-0 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 py-2.5 sm:justify-between sm:px-6 border-t bg-card/90 backdrop-blur-xs">
        <div className="inline-flex items-center gap-1 rounded-full bg-muted/60 p-1" role="group" aria-label="Herramienta">
          <button
            type="button"
            onClick={() => setHerramienta('lapiz')}
            aria-pressed={herramienta === 'lapiz'}
            aria-label="Lápiz"
            title="Lápiz"
            className={cn(
              'grid h-11 w-11 shrink-0 place-items-center rounded-full cursor-pointer transition-all duration-150',
              'focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60',
              herramienta === 'lapiz'
                ? 'bg-card text-primary shadow-xs ring-1 ring-primary/25'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Pen className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setHerramienta('borrador')}
            aria-pressed={herramienta === 'borrador'}
            aria-label="Borrador"
            title="Borrador"
            className={cn(
              'grid h-11 w-11 shrink-0 place-items-center rounded-full cursor-pointer transition-all duration-150',
              'focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60',
              herramienta === 'borrador'
                ? 'bg-card text-primary shadow-xs ring-1 ring-primary/25'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Eraser className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <div className="flex items-center gap-1" role="group" aria-label="Color del lápiz">
            {COLORES_LAPIZ.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-pressed={color === c}
                aria-label={`Color ${NOMBRE_COLOR[c] ?? c}`}
                title={NOMBRE_COLOR[c] ?? c}
                className={cn(
                  'relative grid h-11 w-11 shrink-0 place-items-center rounded-full cursor-pointer transition-all duration-150',
                  'focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60',
                  color === c ? 'ring-2 ring-offset-2 ring-offset-card ring-primary' : 'hover:bg-muted/60',
                )}
              >
                <span className="h-6 w-6 rounded-full ring-1 ring-black/10" style={{ backgroundColor: c }} aria-hidden="true" />
                {color === c && <Check className="absolute h-3.5 w-3.5 text-white" strokeWidth={3} aria-hidden="true" />}
              </button>
            ))}
          </div>

          <div className="h-6 w-px shrink-0 bg-border" aria-hidden="true" />

          <div className="flex items-center gap-1" role="group" aria-label="Grosor del lápiz">
            {GROSORES_LAPIZ.map((g, i) => (
              <button
                key={g}
                type="button"
                onClick={() => setGrosor(g)}
                aria-pressed={grosor === g}
                aria-label={`Grosor ${NOMBRE_GROSOR[g] ?? g}`}
                title={NOMBRE_GROSOR[g] ?? String(g)}
                className={cn(
                  'relative grid h-11 w-11 shrink-0 place-items-center rounded-full cursor-pointer transition-all duration-150',
                  'focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60',
                  grosor === g ? 'ring-2 ring-offset-2 ring-offset-card ring-primary bg-primary/5' : 'hover:bg-muted/60',
                )}
              >
                <span className="rounded-full bg-foreground" style={{ width: 6 + i * 4, height: 6 + i * 4 }} aria-hidden="true" />
                {grosor === g && (
                  <Check
                    className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full bg-primary p-0.5 text-primary-foreground"
                    strokeWidth={3}
                    aria-hidden="true"
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="inline-flex items-center gap-1" role="group" aria-label="Deshacer y rehacer">
          <button
            type="button"
            onClick={deshacer}
            disabled={!puedeDeshacer}
            aria-label="Deshacer"
            title="Deshacer"
            className={cn(
              btnIconUI,
              'h-11 w-11 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent',
            )}
          >
            <Undo2 className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={rehacer}
            disabled={!puedeRehacer}
            aria-label="Rehacer"
            title="Rehacer"
            className={cn(
              btnIconUI,
              'h-11 w-11 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent',
            )}
          >
            <Redo2 className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </footer>
    </div>
  )
}
