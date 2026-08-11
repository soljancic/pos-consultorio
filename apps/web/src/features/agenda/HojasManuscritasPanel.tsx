import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Loader2, PenLine, ScanText } from 'lucide-react'
import type { Cita, HojaManuscritaApi, TrazosHoja } from '@pos/types'
import { api } from '../../lib/api-client'
import { cn, formatFecha } from '../../lib/utils'
import { btnDestructiveUI, btnOutlineUI, btnPrimaryUI } from '../../lib/ui'
import { toast } from '../../stores/toast.store'
import { HojaRenderer } from '../../components/manuscrito/HojaRenderer'
import { VisorHojaManuscrita } from '../../components/manuscrito/VisorHojaManuscrita'
import { rasterizarHoja } from '../../components/manuscrito/rasterizar'
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
  /**
   * Valor EN VIVO del campo Evolucion (el `form.evolucion` de AtencionModal),
   * no el que quedo guardado en el servidor. Task 13 lo necesita para decidir
   * si hay que preguntar reemplazar/agregar o llenar directo -- usar el valor
   * del servidor dejaria pasar por "vacio" un campo que el doctor esta
   * escribiendo en ese mismo instante y todavia no guardo, pisandolo en
   * silencio. Es la unica razon por la que este componente termino
   * necesitando un prop mas de AtencionModal (el resto de la tarea vive
   * entero aca adentro).
   */
  evolucionActual: string
  onTranscribir: (texto: string) => void
  /**
   * Guarda la atencion si todavia no existe. Las hojas cuelgan de un
   * atencionId, asi que hay que llamarla ANTES de abrir el editor -- si no, la
   * primera hoja se crearia contra una atencion que no esta. Resuelve de una
   * cuando la atencion ya existe.
   */
  onAsegurarAtencion: () => Promise<void>
}

/**
 * Panel de notas manuscritas dentro de AtencionModal: sigue el mismo patron
 * visual que los bloques Adjuntos/Recetas (titulo + accion a la derecha,
 * lista abajo, leyenda cuando esta vacio). La lista son miniaturas
 * `HojaRenderer` en una tira horizontal con su propio scroll -- nunca
 * scroll horizontal de la pagina.
 *
 * Task 13 agrega "Transcribir a texto": rasteriza cada hoja (rasterizar.ts),
 * las manda en orden al endpoint de Task 5 y mete el resultado en Evolucion
 * via `onTranscribir`.
 */
export function HojasManuscritasPanel({
  cita,
  puedeEditar,
  hayAtencion,
  evolucionActual,
  onTranscribir,
  onAsegurarAtencion,
}: Props) {
  const qc = useQueryClient()

  // Misma queryKey que usa el editor (LienzoManuscrito): compartida via
  // TanStack Query, asi que un guardado/creacion/borrado adentro del editor
  // ya deja esta lista al dia sin que el panel tenga que refrescar nada por
  // su cuenta -- incluso mientras el editor sigue abierto encima.
  const { data: hojas = [] } = useQuery<HojaManuscritaApi[]>({
    queryKey: ['hojas', cita.id],
    queryFn: () => api.get<HojaManuscritaApi[]>(`/atenciones/cita/${cita.id}/hojas`).then((r) => r.data),
    enabled: hayAtencion,
  })

  // Query propia (nunca ['hojas', ...]): esto no cambia con nada que pase
  // adentro de una atencion, solo con un restart del servidor (falta o no
  // ANTHROPIC_API_KEY) -- staleTime infinito evita refetchearla en cada foco
  // de ventana o remontada del panel.
  const { data: estadoOcr } = useQuery<{ disponible: boolean }>({
    queryKey: ['transcripcion', 'estado'],
    queryFn: () => api.get<{ disponible: boolean }>('/atenciones/transcripcion/estado').then((r) => r.data),
    staleTime: Infinity,
  })

  const [escribiendo, setEscribiendo] = useState(false)
  const [hojaVistaIndice, setHojaVistaIndice] = useState<number | null>(null)

  // Progreso real de la transcripcion en curso (hoja N de M) -- el boton lo
  // muestra en su propia etiqueta, ver mas abajo. `decisionPendiente` guarda
  // el texto YA transcrito mientras se pregunta reemplazar/agregar (null =
  // nada pendiente). `avisoRevision` queda en `true` para siempre una vez que
  // se inserto texto generado, hasta que el panel se desmonte: no tiene
  // sentido volver a `false` solo porque arranca un segundo intento, el
  // aviso sigue siendo cierto sobre lo que ya hay en el campo.
  const [progreso, setProgreso] = useState<{ actual: number; total: number } | null>(null)
  const [decisionPendiente, setDecisionPendiente] = useState<string | null>(null)
  const [avisoRevision, setAvisoRevision] = useState(false)

  const transcribir = useMutation({
    mutationFn: async () => {
      const textos: string[] = []
      // Se saltean las hojas SIN TRAZOS antes de empezar. "+ Hoja" crea y
      // persiste una hoja vacia al instante, asi que un doctor que la toca y
      // cierra deja una hoja en blanco al final -- muy comun. El backend
      // responde 503 "No se pudo leer texto en esta hoja" para una pagina en
      // blanco (correctamente: no hay nada que leer) y el catch de abajo
      // aborta TODO el lote, asi que dos hojas escritas no producian nada
      // salvo "Hoja 3 de 3: No se pudo leer texto en esta hoja", sin pista
      // de que bastaba con borrar la hoja vacia. Ademas ahorra una llamada
      // al modelo (cuesta plata) por cada hoja en blanco.
      //
      // Se conserva el numero de cada hoja DENTRO DE LA LISTA COMPLETA
      // (`numero`), no su posicion en el lote filtrado: es el mismo numero
      // que muestra la miniatura del panel, asi que si una hoja falla el
      // doctor sabe exactamente cual mirar.
      const aTranscribir = hojas
        .map((hoja, i) => ({ hoja, numero: i + 1 }))
        .filter(({ hoja }) => ((hoja.trazos as TrazosHoja | null)?.strokes?.length ?? 0) > 0)

      // Secuencial a proposito, en `orden` (el orden que ya trae `hojas`, el
      // backend las lista con `orderBy: { orden: 'asc' }`): son pocas hojas y
      // en paralelo el costo y la exposicion a rate-limit se disparan sin
      // ganancia real.
      for (const { hoja, numero } of aTranscribir) {
        setProgreso({ actual: numero, total: hojas.length })
        let texto: string
        try {
          const blob = await rasterizarHoja(hoja.trazos as TrazosHoja)
          const fd = new FormData()
          fd.append('imagen', blob, `hoja-${hoja.orden}.png`)
          const { data } = await api.post<{ texto: string }>(
            `/atenciones/cita/${cita.id}/hojas/${hoja.id}/transcribir`,
            fd,
          )
          texto = data.texto
        } catch (err) {
          // Aborta ACA, sin seguir con las hojas que faltan: devolver "dos
          // hojas de tres" como si fuera el texto completo (sin avisar que
          // la tercera fallo) seria peor que no devolver nada -- el doctor
          // pegaria una nota incompleta pensando que es todo lo que escribio.
          // `mensajeDeHoja` arma un mensaje que dice CUAL hoja fallo y (si el
          // backend lo mando) POR QUE -- las tres razones de un 503 son
          // distintas (declinado / cortado por limite / nada legible) y las
          // manda ya distinguidas el propio backend (Task 5).
          throw new Error(mensajeDeHoja(err, numero, hojas.length))
        }
        if (texto) textos.push(texto)
      }
      // Si no quedo ninguna hoja con trazos, esto es '' y `onSuccess` muestra
      // el mismo mensaje que cuando ninguna hoja dio texto -- sin arrancar un
      // lote que solo podia terminar en un 503.
      return textos.join('\n\n')
    },
    onSuccess: (texto) => {
      if (!texto) {
        toast.error('No se pudo leer texto en ninguna hoja')
        return
      }
      if (evolucionActual.trim().length > 0) {
        setDecisionPendiente(texto) // abre el modal de reemplazar/agregar
      } else {
        onTranscribir(texto)
        setAvisoRevision(true)
      }
    },
    onError: (err: any) => toast.fromError(err, err.message),
    onSettled: () => {
      setProgreso(null)
      // Aunque el intento haya abortado a mitad de camino, las hojas que SI
      // se transcribieron ya quedaron guardadas en el servidor (Task 5 las
      // persiste una por una) -- invalidar refleja eso en cache pase lo que
      // pase, no solo cuando el intento completo sale bien.
      qc.invalidateQueries({ queryKey: ['hojas', cita.id] })
    },
  })

  // hayAtencion NO entra aca: si la atencion todavia no existe se crea sola al
  // tocar "Escribir a mano" (ver abrirEditor). Lo unico que puede impedir
  // escribir es el permiso o el dispositivo.
  const puedeEscribir = puedeEditar && ESCRITURA_DISPONIBLE
  const avisarQueFaltaTactil = puedeEditar && hojas.length > 0 && !ESCRITURA_DISPONIBLE
  const [abriendoEditor, setAbriendoEditor] = useState(false)

  async function abrirEditor() {
    setAbriendoEditor(true)
    try {
      await onAsegurarAtencion()
      setEscribiendo(true)
    } catch (err: any) {
      toast.fromError(err, 'Error al guardar la atención')
    } finally {
      setAbriendoEditor(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="block text-sm font-medium text-foreground">Notas manuscritas</span>
        {puedeEscribir && (
          <button
            type="button"
            disabled={abriendoEditor}
            onClick={abrirEditor}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary cursor-pointer hover:underline focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60 rounded disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-150"
          >
            <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
            Escribir a mano
          </button>
        )}
      </div>

      {hojas.length === 0 ? (
        <p className="text-xs text-muted-foreground/70">
          {puedeEditar && !ESCRITURA_DISPONIBLE
            ? 'Para escribir a mano, abrí esta atención desde una tablet o un celular con lápiz.'
            : 'Sin notas manuscritas'}
        </p>
      ) : (
        <>
          <div className="flex gap-3 overflow-x-auto -mx-1 px-1 py-1">
            {hojas.map((hoja, i) => (
              <button
                key={hoja.id}
                type="button"
                onClick={() => setHojaVistaIndice(i)}
                aria-label={`Ver hoja ${i + 1} del ${formatFecha(hoja.createdAt)}`}
                className="shrink-0 flex flex-col items-center gap-1 rounded-lg p-1.5 cursor-pointer hover:bg-muted/60 focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150"
              >
                {/* aria-hidden: el boton ya lleva su propio aria-label completo
                    arriba -- sin esto, el canvas role="img" de HojaRenderer
                    (con su aria-label generico) se anuncia por separado en modo
                    de exploracion de un lector de pantalla, igual que el
                    PenLine de "Escribir a mano" se oculta con aria-hidden. */}
                <span aria-hidden="true">
                  <HojaRenderer trazos={hoja.trazos} ancho={64} />
                </span>
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

          {/* Transcribir: en cualquier dispositivo (a diferencia de "Escribir a
              mano", lee hojas ya guardadas, no captura trazo), mientras se
              pueda editar la atencion -- transcribir escribe en Evolucion. */}
          {puedeEditar && (
            <div className="mt-2.5 flex flex-col items-start gap-1.5">
              <button
                type="button"
                onClick={() => transcribir.mutate()}
                disabled={transcribir.isPending || !estadoOcr?.disponible}
                className={btnOutlineUI}
              >
                {transcribir.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Transcribiendo hoja {progreso?.actual ?? 1} de {progreso?.total ?? hojas.length}…
                  </>
                ) : (
                  <>
                    <ScanText className="h-4 w-4" aria-hidden="true" />
                    Transcribir a texto
                  </>
                )}
              </button>
              {estadoOcr && !estadoOcr.disponible && (
                <p className="text-xs text-muted-foreground/70">
                  La transcripción automática no está configurada en el servidor.
                </p>
              )}
            </div>
          )}

          {avisoRevision && (
            <p
              role="status"
              className="mt-2.5 flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>Texto generado desde tu escritura. Revisalo antes de guardar.</span>
            </p>
          )}
        </>
      )}

      {escribiendo && <LienzoManuscrito citaId={cita.id} onClose={() => setEscribiendo(false)} />}

      {hojaVistaIndice !== null && (
        <VisorHojaManuscrita
          hojas={hojas}
          indiceInicial={hojaVistaIndice}
          onClose={() => setHojaVistaIndice(null)}
        />
      )}

      {decisionPendiente !== null && (
        <DecisionTranscripcionModal
          onReemplazar={() => {
            onTranscribir(decisionPendiente)
            setDecisionPendiente(null)
            setAvisoRevision(true)
          }}
          onAgregar={() => {
            onTranscribir(`${evolucionActual}\n\n${decisionPendiente}`)
            setDecisionPendiente(null)
            setAvisoRevision(true)
          }}
          onCancelar={() => setDecisionPendiente(null)}
        />
      )}
    </div>
  )
}

/**
 * Extrae un mensaje legible para el doctor a partir de lo que fallo al
 * transcribir UNA hoja. Prioriza el mensaje que mando el backend (Task 5 ya
 * distingue declinado / cortado por limite / nada legible con tres textos
 * distintos), despues el de un Error de cliente (p.ej. rasterizarHoja sin
 * contexto de canvas), y por ultimo un generico. Con mas de una hoja, antepone
 * "Hoja N de M" para que el doctor sepa DONDE se corto sin tener que adivinar
 * por el contador del boton (que ya se apago para cuando llega el toast).
 */
function mensajeDeHoja(err: unknown, orden: number, total: number): string {
  const raw = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message
  const backend = Array.isArray(raw) ? raw.join(', ') : raw
  const detalle = backend ?? (err instanceof Error ? err.message : undefined) ?? 'No se pudo transcribir la hoja'
  return total > 1 ? `Hoja ${orden} de ${total}: ${detalle}` : detalle
}

/**
 * Reemplazar/agregar/cancelar cuando Evolucion ya tiene texto propio del
 * doctor -- nunca se pisa en silencio (Don't del proyecto: prohibido
 * window.confirm). Mismo andamiaje de modal-sobre-modal que ConfirmarModal /
 * CancelarCitaModal, tres botones en fila como el caso `tienePrepago` de
 * CancelarCitaModal: descartar a la izquierda, la opcion destructiva al
 * medio, la segura (no pisa nada) a la derecha como default visual.
 */
function DecisionTranscripcionModal({
  onReemplazar,
  onAgregar,
  onCancelar,
}: {
  onReemplazar: () => void
  onAgregar: () => void
  onCancelar: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-xs modal-fade p-4">
      <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-md">
        <ModalHeader icon={ScanText} title="Transcripción lista" onClose={onCancelar} />
        <div className="p-6 sm:p-7 space-y-5">
          <p className="text-sm text-foreground">
            El campo Evolución ya tiene texto. ¿Qué querés hacer con la transcripción?
          </p>
          <div className="flex gap-3">
            <button type="button" onClick={onCancelar} className={cn(btnOutlineUI, 'flex-1')}>
              Cancelar
            </button>
            <button type="button" onClick={onReemplazar} className={cn(btnDestructiveUI, 'flex-1')}>
              Reemplazar
            </button>
            <button type="button" onClick={onAgregar} className={cn(btnPrimaryUI, 'flex-1')}>
              Agregar abajo
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
