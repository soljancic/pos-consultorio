import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, PenLine } from 'lucide-react'
import type { HojaManuscritaApi } from '@pos/types'
import { cn, formatFecha } from '../../lib/utils'
import { btnIconUI } from '../../lib/ui'
import { ModalHeader } from '../shared/ModalHeader'
import { HojaRenderer } from './HojaRenderer'

/** Lo minimo que el visor necesita de una hoja -- tanto la lista completa que
 * trae el editor (HojaManuscritaApi) como la version recortada que trae la
 * linea de tiempo (sin transcripcion/updatedAt, ver atenciones.service.ts)
 * encajan aca sin caster nada. */
type HojaVisor = Pick<HojaManuscritaApi, 'id' | 'orden' | 'trazos' | 'createdAt'>

interface Props {
  hojas: HojaVisor[]
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
 * Mismo andamiaje de modal-sobre-modal que RecetaModal/ConfirmarModal (fixed
 * inset-0 z-50, se apila por orden de montaje).
 *
 * `HojaRenderer` fija el ancho del canvas por `style` inline (gana siempre
 * sobre clases utilitarias tipo `max-w-full`), asi que el ancho se mide del
 * contenedor real en vez de pasar un numero fijo -- un fijo mas chico que el
 * viewport de un celular angosto desbordaria el modal en vez de encogerse.
 *
 * El padding vive en el wrapper EXTERIOR (`p-6 sm:p-7`); `areaRef` cuelga de
 * un div INTERIOR sin padding propio -- mismo split que usa
 * LienzoManuscrito.tsx (wrapper con `p-4 sm:p-6`, `areaRef` en el div hijo
 * sin padding). `clientWidth` incluye el padding del propio elemento
 * medido: medir el wrapper con padding directamente infla el ancho en
 * ~48-56px (el padding en si) por encima del espacio real disponible para
 * el canvas. El renderer no se monta hasta que llega la primera medicion
 * (`ancho > 0`): sin ese candado se pintaria una vez de mas con un ancho
 * incorrecto (0 o el del render anterior) antes de que el ResizeObserver
 * dispare.
 */
export function VisorHojaManuscrita({ hojas, indiceInicial, onClose }: Props) {
  // Congelada al montar (nunca sigue al `hojas` en vivo de la queryKey del
  // llamador): esto es un visor de LECTURA, no debe cambiar lo que muestra
  // por una mutacion de otra pestaña/dispositivo mientras el doctor lo tiene
  // abierto (p.ej. si se borra otra hoja de la misma atencion, un indice que
  // siguiera la lista en vivo podria empezar a apuntar a una hoja distinta a
  // mitad de sesion de lectura, o quedar fuera de rango). Sin este freeze, el
  // panel (que pasa el array vivo de useQuery) y la linea de tiempo (que ya
  // pasa un array capturado en el momento del click, ver HistoriaClinicaTimeline)
  // se comportarian distinto entre si -- mismo componente, dos semanticas.
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
      if (actual) setAncho(Math.max(0, Math.floor(actual.clientWidth)))
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-xs modal-fade p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <ModalHeader
          icon={PenLine}
          title={hayVarias ? `Hoja ${indice + 1} de ${hojasFijas.length}` : 'Hoja manuscrita'}
          subtitle={formatFecha(hoja.createdAt)}
          onClose={onClose}
        />
        <div className="p-6 sm:p-7">
          <div ref={areaRef} className="flex justify-center">
            {ancho > 0 && (
              <HojaRenderer trazos={hoja.trazos} ancho={ancho} etiqueta={`Hoja ${indice + 1} manuscrita`} />
            )}
          </div>

          {hayVarias && (
            <div className="mt-4 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => setIndice((i) => i - 1)}
                disabled={!hayAnterior}
                aria-label="Hoja anterior"
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
                className={cn(
                  btnIconUI,
                  'h-11 w-11 border border-input text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent',
                )}
              >
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
