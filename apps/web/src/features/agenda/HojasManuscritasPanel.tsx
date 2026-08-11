import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PenLine } from 'lucide-react'
import type { Cita, HojaManuscritaApi } from '@pos/types'
import { api } from '../../lib/api-client'
import { formatFecha } from '../../lib/utils'
import { HojaRenderer } from '../../components/manuscrito/HojaRenderer'
import { ModalHeader } from '../../components/shared/ModalHeader'
import { LienzoManuscrito } from './LienzoManuscrito'

// Escribir es solo tablet y celular (decision del owner); leer es en
// cualquier dispositivo. Se evalua UNA sola vez al cargar el modulo: el tipo
// de puntero de un dispositivo no cambia durante la sesion.
const ESCRITURA_DISPONIBLE =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0)

interface Props {
  cita: Cita
  puedeEditar: boolean
  hayAtencion: boolean
  onTranscribir: (texto: string) => void
}

/**
 * Panel de notas manuscritas dentro de AtencionModal: sigue el mismo patron
 * visual que los bloques Adjuntos/Recetas (titulo + accion a la derecha,
 * lista abajo, leyenda cuando esta vacio). La lista son miniaturas
 * `HojaRenderer` en una tira horizontal con su propio scroll -- nunca
 * scroll horizontal de la pagina.
 *
 * `onTranscribir` ya viaja en la interfaz para que Task 13 (boton
 * "Transcribir a texto") no tenga que volver a tocar AtencionModal; esta
 * tarea no dibuja ese boton (fuera de alcance, ver plan).
 */
export function HojasManuscritasPanel({ cita, puedeEditar, hayAtencion, onTranscribir }: Props) {
  void onTranscribir

  // Misma queryKey que usa el editor (LienzoManuscrito): compartida via
  // TanStack Query, asi que un guardado/creacion/borrado adentro del editor
  // ya deja esta lista al dia sin que el panel tenga que refrescar nada por
  // su cuenta -- incluso mientras el editor sigue abierto encima.
  const { data: hojas = [] } = useQuery<HojaManuscritaApi[]>({
    queryKey: ['hojas', cita.id],
    queryFn: () => api.get<HojaManuscritaApi[]>(`/atenciones/cita/${cita.id}/hojas`).then((r) => r.data),
    enabled: hayAtencion,
  })

  const [escribiendo, setEscribiendo] = useState(false)
  const [hojaVista, setHojaVista] = useState<{ hoja: HojaManuscritaApi; numero: number } | null>(null)

  const puedeEscribir = puedeEditar && hayAtencion && ESCRITURA_DISPONIBLE
  const avisarQueFaltaTactil = puedeEditar && hayAtencion && hojas.length > 0 && !ESCRITURA_DISPONIBLE

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="block text-sm font-medium text-foreground">Notas manuscritas</span>
        {puedeEscribir && (
          <button
            type="button"
            onClick={() => setEscribiendo(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary cursor-pointer hover:underline focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60 rounded transition-colors duration-150"
          >
            <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
            Escribir a mano
          </button>
        )}
      </div>

      {hojas.length === 0 ? (
        <p className="text-xs text-muted-foreground/70">
          {hayAtencion ? 'Sin notas manuscritas' : 'Guarde la atención para poder escribir a mano'}
        </p>
      ) : (
        <>
          <div className="flex gap-3 overflow-x-auto -mx-1 px-1 py-1">
            {hojas.map((hoja, i) => (
              <button
                key={hoja.id}
                type="button"
                onClick={() => setHojaVista({ hoja, numero: i + 1 })}
                aria-label={`Ver hoja ${i + 1} del ${formatFecha(hoja.createdAt)}`}
                className="shrink-0 flex flex-col items-center gap-1 rounded-lg p-1.5 cursor-pointer hover:bg-muted/60 focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150"
              >
                <HojaRenderer trazos={hoja.trazos} ancho={64} />
                <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                  {i + 1} &bull; {formatFecha(hoja.createdAt)}
                </span>
              </button>
            ))}
          </div>
          {avisarQueFaltaTactil && (
            <p className="text-xs text-muted-foreground/70 mt-1.5">
              Para escribir a mano, abrí esta atención desde una tablet o un celular con lápiz.
            </p>
          )}
        </>
      )}

      {escribiendo && <LienzoManuscrito citaId={cita.id} onClose={() => setEscribiendo(false)} />}

      {hojaVista && (
        <VisorHoja hoja={hojaVista.hoja} numero={hojaVista.numero} onClose={() => setHojaVista(null)} />
      )}
    </div>
  )
}

/**
 * Visor de una sola hoja en solo lectura, disponible en cualquier
 * dispositivo (a diferencia del editor, que solo abre con puntero tactil).
 * Mismo andamiaje de modal-sobre-modal que RecetaModal/ConfirmarModal
 * (fixed inset-0 z-50, se apila por orden de montaje sobre AtencionModal).
 *
 * `HojaRenderer` fija el ancho del canvas por `style` inline (gana siempre
 * sobre clases utilitarias tipo `max-w-full`), asi que el ancho se mide del
 * contenedor real en vez de pasar un numero fijo -- un fijo mas chico que el
 * viewport de un celular angosto desbordaria el modal en vez de encogerse.
 */
function VisorHoja({ hoja, numero, onClose }: { hoja: HojaManuscritaApi; numero: number; onClose: () => void }) {
  const areaRef = useRef<HTMLDivElement>(null)
  const [ancho, setAncho] = useState(0)

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-xs modal-fade p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <ModalHeader icon={PenLine} title={`Hoja ${numero}`} subtitle={formatFecha(hoja.createdAt)} onClose={onClose} />
        <div ref={areaRef} className="p-6 sm:p-7 flex justify-center">
          {ancho > 0 && (
            <HojaRenderer trazos={hoja.trazos} ancho={ancho} etiqueta={`Hoja ${numero} manuscrita`} />
          )}
        </div>
      </div>
    </div>
  )
}
