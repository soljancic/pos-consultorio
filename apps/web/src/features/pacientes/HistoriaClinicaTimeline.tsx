import { useEffect, useState, useDeferredValue } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Stethoscope, CalendarPlus, Paperclip, PenLine, Loader2, X } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { HojaManuscritaApi } from '@pos/types'
import { api } from '../../lib/api-client'
import { formatDia, cn } from '../../lib/utils'
import { abrirAdjunto, type AdjuntoMeta } from '../../lib/adjuntos'
import { inputUI, cardUI, btnIconUI } from '../../lib/ui'
import { ErrorState } from '../../components/shared/ErrorState'
import { VisorHojaManuscrita } from '../../components/manuscrito/VisorHojaManuscrita'

// Lo minimo para mostrar el conteo ("3 hojas manuscritas") en la linea de
// tiempo -- ver atenciones.service.ts (findByPaciente) sobre por que NUNCA
// trae `trazos` aca. El trazo completo se trae recien al abrir el visor
// (VisorHojasBajoDemanda, mas abajo).
type HojaResumen = Pick<HojaManuscritaApi, 'id' | 'orden'>

type AtencionTimeline = {
  id: number
  motivo: string | null
  diagnostico: string | null
  tratamiento: string | null
  evolucion: string | null
  proximoControl: string | null
  adjuntos: AdjuntoMeta[] | null
  // Opcional a proposito: la PWA cachea los GET de la API con NetworkFirst
  // (`consultech-api`), asi que un doctor offline despues de este deploy
  // puede recibir una respuesta cacheada de ANTES del deploy, sin la clave
  // `hojas` -- leerla sin guardia tiraba la pagina entera del paciente.
  hojas?: HojaResumen[]
  cita: {
    id: number
    fechaHora: string
    estado: string
    doctor: { nombre: string }
    servicio: { nombre: string }
  }
}

interface Props {
  pacienteId: number
  onAgendarControl: (fecha: string) => void
}

// Linea de tiempo clinica (E2-M4 f2): todas las atenciones del paciente con
// busqueda full-text sobre motivo/diagnostico/tratamiento/evolucion
export function HistoriaClinicaTimeline({ pacienteId, onAgendarControl }: Props) {
  const [busqueda, setBusqueda] = useState('')
  const q = useDeferredValue(busqueda.trim())

  const { data: atenciones = [], isLoading } = useQuery<AtencionTimeline[]>({
    queryKey: ['historia-clinica', pacienteId, q],
    queryFn: () =>
      api
        .get(`/atenciones/paciente/${pacienteId}`, { params: q ? { q } : undefined })
        .then((r) => r.data),
  })

  // Que atencion (por citaId) esta pidiendo ver sus hojas -- null = ninguna.
  // Solo guarda la INTENCION; VisorHojasBajoDemanda (mas abajo) es quien
  // dispara el fetch real al montarse. Task 14 (fix round 1): antes esto
  // guardaba la lista de hojas ya en mano (venian completas en la propia
  // query de la linea de tiempo); ahora la linea de tiempo solo sabe CUANTAS
  // hay por atencion, no su contenido, asi que abrir el visor implica traer
  // el trazo bajo demanda.
  const [visorCita, setVisorCita] = useState<{ citaId: number; indiceInicial: number } | null>(null)

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar en diagnósticos, tratamientos, evoluciones..."
          aria-label="Buscar en la historia clínica"
          className={cn(inputUI, 'pl-9')}
        />
      </div>

      {isLoading ? (
        <div className="p-6 text-center text-muted-foreground text-sm">Cargando...</div>
      ) : atenciones.length === 0 ? (
        <div className={cn(cardUI, 'p-8 text-center text-muted-foreground/70 text-sm')}>
          {q ? 'Sin resultados para la búsqueda' : 'Sin atenciones registradas'}
        </div>
      ) : (
        <ol className="relative ml-3 border-l-2 border-violet-500/30 space-y-4">
          {atenciones.map((a) => (
            <li key={a.id} className="relative pl-6">
              <span
                className="absolute left-[-13px] top-4 inline-flex items-center justify-center h-6 w-6 rounded-full bg-violet-500/15 text-violet-600 ring-4 ring-background"
                aria-hidden="true"
              >
                <Stethoscope className="h-3.5 w-3.5" />
              </span>
              <div className={cn(cardUI, 'p-4 space-y-1.5')}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-semibold text-foreground tabular-nums">
                    {format(new Date(a.cita.fechaHora), "dd/MM/yyyy HH:mm 'hs'", { locale: es })}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {a.cita.servicio.nombre} &bull; {a.cita.doctor.nombre}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  {a.motivo && <p><span className="font-medium text-foreground">Motivo:</span> {a.motivo}</p>}
                  {a.diagnostico && <p><span className="font-medium text-foreground">Diagnóstico:</span> {a.diagnostico}</p>}
                  {a.tratamiento && <p><span className="font-medium text-foreground">Tratamiento:</span> {a.tratamiento}</p>}
                  {a.evolucion && <p><span className="font-medium text-foreground">Evolución:</span> {a.evolucion}</p>}
                  {a.proximoControl && (
                    <p className="flex flex-wrap items-center gap-2">
                      <span>
                        <span className="font-medium text-foreground">Próximo control:</span>{' '}
                        {formatDia(a.proximoControl)}
                      </span>
                      <button
                        onClick={() => onAgendarControl(a.proximoControl!.slice(0, 10))}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary cursor-pointer hover:underline focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60 rounded transition-colors duration-150"
                      >
                        <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
                        Agendar control
                      </button>
                    </p>
                  )}
                </div>
                {(a.hojas?.length ?? 0) > 0 && (
                  <div className="pt-1">
                    {/* Sin miniaturas dibujadas a proposito (fix round 1,
                        Finding 1): mostrarlas exigiria traer `trazos` de
                        TODAS las hojas de TODAS las atenciones en esta
                        misma query -- justo el payload que la decision del
                        owner descarta. Es un boton-indicador: toca, carga,
                        recien ahi se dibuja. */}
                    <button
                      type="button"
                      onClick={() => setVisorCita({ citaId: a.cita.id, indiceInicial: 0 })}
                      className="inline-flex items-center gap-1.5 h-11 px-3 rounded-full border text-primary text-xs font-medium cursor-pointer hover:bg-primary/10 focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150"
                    >
                      <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
                      {a.hojas!.length === 1 ? '1 hoja manuscrita' : `${a.hojas!.length} hojas manuscritas`}
                    </button>
                  </div>
                )}
                {(a.adjuntos?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {a.adjuntos!.map((adj, i) => (
                      <button
                        key={`${adj.archivo}-${i}`}
                        onClick={() => abrirAdjunto(a.cita.id, i)}
                        title={adj.nombre}
                        className="inline-flex items-center gap-1 max-w-[200px] text-xs px-2 py-1 rounded-full border text-primary cursor-pointer hover:bg-primary/10 focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150"
                      >
                        <Paperclip className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span className="truncate">{adj.nombre}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {visorCita && (
        <VisorHojasBajoDemanda
          citaId={visorCita.citaId}
          indiceInicial={visorCita.indiceInicial}
          onClose={() => setVisorCita(null)}
        />
      )}
    </div>
  )
}

/**
 * Trae las hojas de UNA atencion bajo demanda y las entrega al visor de
 * pantalla completa (Task 14, fix round 1 -- Finding 1). Mismo endpoint y
 * misma queryKey que ya usa HojasManuscritasPanel.tsx (`['hojas', citaId]`,
 * `GET /atenciones/cita/:citaId/hojas`): si el doctor ya abrio esta atencion
 * en el modal durante la misma sesion, la cache de TanStack Query ya tiene
 * el dato y el visor abre sin spinner -- comparten cache, no es un
 * endpoint nuevo ni una segunda forma de pedir lo mismo.
 *
 * Mientras no hay datos, se muestra un estado honesto (spinner o error con
 * reintento) en vez de un visor vacio -- nunca se monta VisorHojaManuscrita
 * sin hojas para mostrar.
 */
function VisorHojasBajoDemanda({
  citaId,
  indiceInicial,
  onClose,
}: {
  citaId: number
  indiceInicial: number
  onClose: () => void
}) {
  const { data: hojas, isError, refetch } = useQuery<HojaManuscritaApi[]>({
    queryKey: ['hojas', citaId],
    queryFn: () => api.get<HojaManuscritaApi[]>(`/atenciones/cita/${citaId}/hojas`).then((r) => r.data),
  })

  // `hojas.length > 0`, no solo `hojas`: un array VACIO es truthy, y
  // VisorHojaManuscrita con cero hojas devuelve `null` (no tiene hoja que
  // pintar) -- el overlay nunca se montaba, nadie podia disparar `onClose`,
  // `visorCita` quedaba seteado y volver a tocar la pill no hacia nada hasta
  // recargar la pagina. Pasa de verdad: entre que la linea de tiempo trajo
  // el conteo y que el doctor toca la pill, esas hojas pueden haberse
  // borrado desde el modal de la atencion.
  const hojasListas = hojas && hojas.length > 0 ? hojas : null

  // Escape cierra tambien mientras carga, si hubo error o si la atencion se
  // quedo sin hojas -- una vez que hay datos que mostrar, VisorHojaManuscrita
  // toma el control del teclado.
  useEffect(() => {
    if (hojasListas) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [hojasListas, onClose])

  if (hojasListas) {
    return <VisorHojaManuscrita hojas={hojasListas} indiceInicial={indiceInicial} onClose={onClose} />
  }

  return (
    <div className="fixed inset-0 z-[60] bg-neutral-100 dark:bg-neutral-900 flex flex-col">
      <div className="shrink-0 flex justify-end p-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className={cn(btnIconUI, 'h-11 w-11 text-muted-foreground hover:bg-muted hover:text-foreground')}
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center px-4 pb-10">
        {isError ? (
          <ErrorState
            title="No se pudieron cargar las hojas"
            description="Revisá la conexión e intentá de nuevo."
            onRetry={() => refetch()}
          />
        ) : hojas ? (
          // Llegaron datos pero la lista vino vacia: las hojas se borraron
          // entre que la linea de tiempo trajo el conteo y este toque. Estado
          // explicito, con su boton de cerrar arriba -- nunca un spinner que
          // no va a terminar nunca.
          <p role="status" className="max-w-xs text-center text-sm text-muted-foreground">
            Esta atención ya no tiene hojas manuscritas.
          </p>
        ) : (
          // Esta rama solo se pinta mientras `hojas` todavia no llego y no
          // hubo error -- por construccion eso es siempre "cargando" (sin
          // datos exitosos previos no hay forma de que isPending sea false),
          // asi que no hace falta distinguir el primer intento de un retry.
          <div className="flex flex-col items-center gap-3" role="status">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Cargando hojas…</p>
          </div>
        )}
      </div>
    </div>
  )
}
