import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, PenLine, X } from 'lucide-react'
import { HOJA_H, HOJA_W, type HojaManuscritaApi } from '@pos/types'
import { cn, formatFecha } from '../../lib/utils'
import { btnIconUI } from '../../lib/ui'
import { HojaRenderer } from './HojaRenderer'

interface Props {
  /**
   * Hojas completas (con `trazos`) -- tanto la lista en vivo que ya trae el
   * editor (`useQuery<HojaManuscritaApi[]>`) como la que trae la linea de
   * tiempo bajo demanda (fetch al tocar el indicador, mismo endpoint
   * `GET /atenciones/cita/:citaId/hojas`) son el mismo tipo de la API sin
   * recortar -- no hace falta un tipo aparte para el visor, ver el
   * reporte de Task 14 (fix round 1) sobre por que la union de dos `Pick<>`
   * independientes de ronda anterior desaparecio en vez de fusionarse.
   */
  hojas: HojaManuscritaApi[]
  /** Indice (0-based) de la hoja con la que abre el visor. */
  indiceInicial: number
  onClose: () => void
}

/**
 * Visor de hojas manuscritas en solo lectura, disponible en CUALQUIER
 * dispositivo (a diferencia del editor -- LienzoManuscrito.tsx -- que solo
 * abre con puntero tactil). Compartido entre el panel de la atencion
 * (HojasManuscritasPanel.tsx, Task 12) y la linea de tiempo clinica del
 * paciente (HistoriaClinicaTimeline.tsx, Task 14): mismo overlay, mismo
 * canvas de solo lectura, misma medicion -- la unica diferencia entre los dos
 * usos es que el panel abre casi siempre con una sola hoja y la linea de
 * tiempo con varias, y eso ya lo resuelve la navegacion (mas abajo) sola,
 * sin dos componentes.
 *
 * Pantalla completa de verdad (fix round 1, Finding 2): la version anterior
 * era una tarjeta centrada `max-w-sm` -- en celular 384px casi llena la
 * pantalla y el hueco pasaba desapercibido, pero en desktop (el caso que
 * esta tarea existe para servir: escribir es solo tablet, leer es
 * universal) un doctor revisando cursiva densa terminaba con un canvas de
 * ~320px en medio de un monitor grande. Mismo andamiaje de pantalla completa
 * que LienzoManuscrito.tsx (`fixed inset-0 z-[60] flex flex-col`, header +
 * area de contenido a `flex-1` + footer de navegacion), no un modal-sobre-
 * modal con `ModalHeader`: ese componente esta pensado para tarjetas con
 * ancho acotado, no para una pantalla de borde a borde.
 *
 * Medicion en DOS ejes (no solo ancho): con una tarjeta acotada por
 * `max-h-[90vh] overflow-y-auto` alcanzaba con el ancho (el alto se
 * resolvia solo, con scroll si hacia falta). A pantalla completa el alto
 * disponible es un limite real -- en un monitor ancho y bajo, ajustar la
 * hoja SOLO por ancho la desbordaria verticalmente. Misma formula que ya
 * usa LienzoManuscrito.tsx: se miden `clientWidth` y `clientHeight` del
 * area disponible y se elige el mayor ancho que entra en AMBOS (el menor
 * entre el ancho disponible y el ancho que ocuparia la hoja si se ajustara
 * por alto).
 *
 * `HojaRenderer` fija el ancho del canvas por `style` inline (gana siempre
 * sobre clases utilitarias tipo `max-w-full`), asi que el ancho se mide del
 * contenedor real en vez de pasar un numero fijo. El padding vive en el
 * wrapper EXTERIOR (`p-4 sm:p-6`, igual que LienzoManuscrito); `areaRef`
 * cuelga de un div INTERIOR sin padding propio -- medir el wrapper con
 * padding directamente infla el ancho por encima del espacio real
 * disponible para el canvas. El renderer no se monta hasta la primera
 * medicion (`ancho > 0`): sin ese candado se pintaria una vez de mas con un
 * ancho incorrecto (0 o el del render anterior) antes de que el
 * ResizeObserver dispare.
 */
export function VisorHojaManuscrita({ hojas, indiceInicial, onClose }: Props) {
  // Congelada al montar (nunca sigue al `hojas` en vivo de la queryKey del
  // llamador): esto es un visor de LECTURA, no debe cambiar lo que muestra
  // por una mutacion de otra pestaña/dispositivo mientras el doctor lo tiene
  // abierto (p.ej. si se borra otra hoja de la misma atencion, un indice que
  // siguiera la lista en vivo podria empezar a apuntar a una hoja distinta a
  // mitad de sesion de lectura, o quedar fuera de rango). Sin este freeze, el
  // panel (que pasa el array vivo de useQuery) y la linea de tiempo (que
  // pasa una lista recien traida y ya estable) se comportarian distinto
  // entre si -- mismo componente, dos semanticas.
  const [hojasFijas] = useState(hojas)
  const [indice, setIndice] = useState(indiceInicial)
  const areaRef = useRef<HTMLDivElement>(null)
  const [ancho, setAncho] = useState(0)

  const hoja = hojasFijas[indice]
  const hayVarias = hojasFijas.length > 1
  const hayAnterior = indice > 0
  const haySiguiente = indice < hojasFijas.length - 1

  useEffect(() => {
    const el = areaRef.current
    if (!el) return

    function medir() {
      const actual = areaRef.current
      if (!actual) return
      const disponibleAncho = actual.clientWidth
      const disponibleAlto = actual.clientHeight
      if (disponibleAncho <= 0 || disponibleAlto <= 0) return
      // El ancho que ocuparia la hoja si se ajustara solo por el alto
      // disponible (misma formula que LienzoManuscrito.tsx): el menor entre
      // este valor y el ancho disponible es el que entra en los dos ejes
      // sin recortar la hoja ni forzar scroll.
      const anchoPorAlto = (disponibleAlto * HOJA_W) / HOJA_H
      setAncho(Math.max(0, Math.floor(Math.min(disponibleAncho, anchoPorAlto))))
    }

    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Flechas para pasar de hoja (solo si hay mas de una) + Escape para
  // cerrar: el visor abre en cualquier dispositivo, incluida una PC sin
  // pantalla tactil, asi que el mouse/teclado tienen que alcanzar para todo.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (!hayVarias) return
      if (e.key === 'ArrowLeft') setIndice((i) => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setIndice((i) => Math.min(hojasFijas.length - 1, i + 1))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [hayVarias, hojasFijas.length, onClose])

  if (!hoja) return null

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
          <h1 className="text-sm font-semibold text-foreground leading-tight truncate">
            {hayVarias ? `Hoja ${indice + 1} de ${hojasFijas.length}` : 'Hoja manuscrita'}
          </h1>
          <p className="text-xs text-muted-foreground leading-snug truncate">{formatFecha(hoja.createdAt)}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          // btnIconUI es h-9 w-9 (36px): bajo el piso de 44px del proyecto.
          // Target agrandado local (no se toca el token compartido).
          className={cn(btnIconUI, 'h-11 w-11 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground')}
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-hidden p-4 sm:p-6">
        <div ref={areaRef} className="flex h-full w-full items-center justify-center">
          {ancho > 0 && (
            <HojaRenderer trazos={hoja.trazos} ancho={ancho} etiqueta={`Hoja ${indice + 1} manuscrita`} />
          )}
        </div>
      </div>

      {hayVarias && (
        <footer className="shrink-0 flex items-center justify-center gap-4 px-4 py-3 border-t bg-card/90 backdrop-blur-xs">
          <button
            type="button"
            onClick={() => setIndice((i) => i - 1)}
            disabled={!hayAnterior}
            aria-label="Hoja anterior"
            title="Hoja anterior"
            className={cn(
              btnIconUI,
              'h-11 w-11 border border-input text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent',
            )}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="text-sm text-muted-foreground tabular-nums min-w-[4.5rem] text-center">
            {indice + 1} de {hojasFijas.length}
          </span>
          <button
            type="button"
            onClick={() => setIndice((i) => i + 1)}
            disabled={!haySiguiente}
            aria-label="Hoja siguiente"
            title="Hoja siguiente"
            className={cn(
              btnIconUI,
              'h-11 w-11 border border-input text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent',
            )}
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </footer>
      )}
    </div>
  )
}
