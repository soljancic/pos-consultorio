import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eraser,
  History,
  Loader2,
  Pen,
  PenLine,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import {
  COLORES_LAPIZ,
  GROSORES_LAPIZ,
  HOJA_H,
  HOJA_W,
  MAX_HOJAS_POR_ATENCION,
  hojaVacia,
  type HojaManuscritaApi,
  type Trazo,
  type TrazosHoja,
} from '@pos/types'
import { altoHoja, cuantizar, escalaHoja, pathDeTrazo, pintarHoja } from '../../components/manuscrito/dibujar'
import { borrarBorrador, guardarBorrador, leerBorrador } from '../../components/manuscrito/borradorLocal'
import { api } from '../../lib/api-client'
import { cn, tiempoRelativo } from '../../lib/utils'
import { btnIconUI, btnOutlineUI, btnPrimaryUI } from '../../lib/ui'
import { toast } from '../../stores/toast.store'
import { ConfirmarModal } from '../../components/shared/ConfirmarModal'
import { ModalHeader } from '../../components/shared/ModalHeader'

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

// Compara dos trazos por VALOR (color, grosor, cada punto) -- no por
// identidad de objeto ni via JSON.stringify(). Sale apenas encuentra una
// diferencia (`.every()` corta corto), sin construir ninguna
// representacion intermedia. Ver `trazosIguales` para el motivo de evitar
// JSON.stringify(). Pura, vive fuera del componente por el mismo motivo
// que aEspacioHoja/presionDe.
function trazoIgual(a: Trazo, b: Trazo): boolean {
  if (a.c !== b.c || a.s !== b.s || a.p.length !== b.p.length) return false
  return a.p.every((punto, i) => punto[0] === b.p[i][0] && punto[1] === b.p[i][1] && punto[2] === b.p[i][2])
}

/**
 * Compara dos listas de trazos por CONTENIDO. Usada para decidir si el
 * borrador local de una hoja difiere de lo que el servidor tiene -- ver
 * `ofrecerBorradorSiHaceFalta`.
 *
 * No usa `JSON.stringify()`: la columna `trazos` es `Json` sobre Postgres,
 * que sin `@db.Json` mapea a `jsonb` por defecto -- y jsonb SI reordena las
 * claves de un objeto al guardarlo (documentado por Postgres; en la
 * practica jsonb ordena las claves para su representacion binaria interna,
 * no es un caso raro). Comparar el string serializado del borrador local
 * (armado por el cliente en el orden `{c, s, p}`) contra el de la hoja que
 * vuelve del servidor (reordenada por jsonb) daria "distintos" para el
 * MISMO contenido en CASI TODA recarga -- una falsa alarma constante, no
 * una rareza. Comparar por valor, campo a campo (`trazoIgual`), es inmune
 * a esto.
 *
 * Corte previo por longitud (`a.length !== b.length`) antes de comparar
 * nada mas -- pero si las longitudes COINCIDEN, sigue cayendo a la
 * comparacion real trazo por trazo: nunca se asume "iguales" solo porque
 * tienen la misma cantidad. Esa suposicion (cantidad como proxy de
 * contenido) fue exactamente el bug de la ronda anterior (recuperacion
 * comparando por `strokes.length`).
 *
 * El orden de los elementos SI importa (no es una comparacion de
 * conjuntos): la app solo agrega trazos al final o filtra preservando el
 * orden relativo (deshacer/rehacer intercambian snapshots completos, nunca
 * reordenan) -- dos listas con el mismo contenido pero orden distinto no
 * deberian ocurrir nunca en la practica, asi que compararlas posicion por
 * posicion es correcto y mas barato que una comparacion insensible al
 * orden.
 */
function trazosIguales(a: Trazo[], b: Trazo[]): boolean {
  return a.length === b.length && a.every((t, i) => trazoIgual(t, b[i]))
}

// Nombres en espanol de las paletas de @pos/types, solo para aria-label/title
// (accesibilidad). Si la paleta cambia de valores, cae al hex/numero crudo en
// vez de romper: nunca se usan para logica, solo como copy.
const NOMBRE_COLOR: Record<string, string> = { '#111827': 'Negro', '#1d4ed8': 'Azul', '#b91c1c': 'Rojo' }
const NOMBRE_GROSOR: Record<number, string> = { 2: 'Fino', 4: 'Medio', 7: 'Grueso' }

/**
 * Editor de notas manuscritas de una atencion: captura el trazo del
 * lapiz/dedo, lo pinta, y persiste multiples hojas contra el servidor
 * (`['hojas', citaId]`).
 *
 * Forma del estado: `trazosRef` sigue siendo UNA sola lista de trazos (la de
 * la hoja activa, identificada por `hojaActivaId`, el id real del servidor).
 * No hay un array de hojas en memoria con sus trazos completos aparte del
 * que ya devuelve `useQuery` -- cambiar de hoja relee `hoja.trazos` de esa
 * misma lista cacheada (`hojas.find(...)`) en vez de duplicarlo en otro
 * estado. `cargarHoja()` es el unico camino que cambia CUAL hoja esta activa
 * (trazosRef + historial + hojaActivaId, todos juntos, nunca por separado).
 *
 * `sucio` marca cambios sin guardar de la hoja activa. Task 11 agrega el
 * autoguardado con temporizador (cada 10s mientras `sucio`) y el borrador
 * local en IndexedDB (`components/manuscrito/borradorLocal.ts`), red de
 * seguridad para un corte de conexion a mitad de una nota.
 *
 * Deshacer/rehacer: pila simple sobre la lista de trazos (el estado de una
 * hoja ES su lista de trazos, no hace falta nada mas sofisticado). Cada
 * mutacion (trazo nuevo, borrado) llama `registrarCambio()` ANTES de mutar,
 * lo que empuja el estado previo a `pilaDeshacer` y vacia `pilaRehacer`.
 * `cargarHoja()` vacia ambas pilas: el historial de una hoja no aplica a
 * otra.
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
  // Cuenta llamadas a aplicar() (trazo, borrado, deshacer, rehacer,
  // recuperar) -- throttle del borrador local en IndexedDB. Ver aplicar().
  const contadorAplicarRef = useRef(0)

  const [herramienta, setHerramienta] = useState<'lapiz' | 'borrador'>('lapiz')
  const [color, setColor] = useState<string>(COLORES_LAPIZ[0])
  const [grosor, setGrosor] = useState<number>(GROSORES_LAPIZ[1])

  // Deshacer/rehacer: pila de listas de trazos completas (ver JSDoc arriba).
  const pilaDeshacer = useRef<Trazo[][]>([])
  const pilaRehacer = useRef<Trazo[][]>([])
  const [puedeDeshacer, setPuedeDeshacer] = useState(false)
  const [puedeRehacer, setPuedeRehacer] = useState(false)

  const [sucio, setSucio] = useState(false)
  // Espejo sincronico de `sucio`, mismo motivo que `bloqueoDibujoRef` mas
  // abajo: `guardarActivaSiSucia()` decide si hay algo que guardar en el
  // mismo tick en que `terminarGestoEnCurso()` puede acabar de llamar
  // `aplicar()` (que hace `setSucio(true)`) -- leer el estado `sucio` ahi
  // veria el valor de ANTES de esa llamada (React no aplica `setState`
  // sincronicamente dentro del mismo call stack), asi que el guardado se
  // saltaria un trazo recien comiteado. `sucioRef` si se actualiza al
  // instante.
  const sucioRef = useRef(false)

  // Hoja activa por id real del servidor -- nunca por indice ni por `orden`
  // (el backend asigna `orden` de por vida y una hoja borrada se lo queda
  // para siempre, asi que `orden` es un identificador, no una posicion). Es
  // `null` mientras la lista todavia no cargo o si la atencion no tiene
  // ninguna hoja. `hojaABorrar` guarda el id que el ConfirmarModal va a
  // confirmar -- siempre la hoja activa, ver boton "Eliminar hoja actual".
  const [hojaActivaId, setHojaActivaId] = useState<number | null>(null)
  const [hojaABorrar, setHojaABorrar] = useState<number | null>(null)
  // Se pone en true la PRIMERA vez que la lista carga con al menos una hoja
  // (ver el efecto de seleccion inicial, mas abajo) y nunca vuelve a false.
  // Sin este candado, borrar la ULTIMA hoja deja `hojaActivaId` en null justo
  // cuando `hojas` (cache de la query) todavia no se refresco -- el
  // invalidate del borrado es asincronico -- y el efecto de seleccion
  // inicial, viendo `hojaActivaId === null` con `hojas` todavia no vacio,
  // volveria a seleccionar la hoja recien borrada. El candado hace que esa
  // seleccion automatica ocurra una sola vez por sesion del editor; despues,
  // todo cambio de `hojaActivaId` es deliberado (crear/cambiar/borrar).
  const autoSeleccionoRef = useRef(false)

  // Candado de "hay un cambio de hoja en curso" (irAHoja/nuevaHoja), desde
  // el instante en que arrancan hasta que terminan (guardado previo +
  // reintento si hace falta + el propio cambio/creacion), NUNCA solo la
  // ventana de `guardarHoja.isPending` (que se apaga en cuanto el PUT
  // resuelve, antes de que `cargarHoja()` corra). Dos formas del mismo
  // candado a proposito: el ref es lo que lee `alBajar` -- sincronico,
  // sin el retraso de un render -- para rechazar un gesto de dibujo/borrado
  // NUEVO mientras se cambia de hoja; el estado es el espejo reactivo que
  // alimenta `operandoHoja` (mas abajo) para deshabilitar los controles de
  // la barra. Ver Finding 1 y 2 del review de Task 10.
  const bloqueoDibujoRef = useRef(false)
  const [cambiandoHoja, setCambiandoHoja] = useState(false)

  // Espejo sincronico de `hojaActivaId`, mismo motivo que `sucioRef`: tanto
  // el timer de autoguardado (cerrado sobre el closure del PRIMER render,
  // deps `[]`) como el flush al desmontar necesitan el `hojaActivaId` REAL
  // en el momento en que corren, no el `null` de antes de la
  // auto-seleccion de la primera hoja. `guardarActivaSiSucia()` lo lee de
  // aca, nunca del estado. Ver su declaracion mas abajo.
  const hojaActivaIdRef = useRef<number | null>(null)

  // Evita dos PUT concurrentes contra la misma hoja: el timer de
  // autoguardado y un cambio de hoja (irAHoja/nuevaHoja) pueden pedir
  // guardarActivaSiSucia() casi al mismo tiempo. `operandoHoja` (mas abajo)
  // no alcanza para esto: depende de que React re-renderice para reflejar
  // `guardarHoja.isPending`, y hay una ventana real entre que se llama
  // `mutateAsync` y que ese re-render se refleja en el DOM. Este ref se lee
  // y escribe sincronicamente, sin esa ventana.
  //
  // Guarda un objeto (no solo la promesa) porque `estado.silencioso`
  // necesita poder "actualizarse" mientras el guardado ya esta en vuelo: si
  // el timer arranca un guardado silencioso (sin toast en caso de error) y
  // despues un cambio de hoja explicito se UNE a esa misma promesa (en vez
  // de arrancar una segunda), el toast de error debe volver a estar
  // habilitado -- alguien esta esperando el resultado de verdad. Ver
  // `guardarActivaSiSucia`.
  const guardadoEnCursoRef = useRef<{ promesa: Promise<boolean>; estado: { silencioso: boolean } } | null>(null)

  // Borrador local (IndexedDB) mas NUEVO que lo que trajo el servidor al
  // cargar esta hoja -- señal de cambios sin subir por un corte de
  // conexion. `guardadoAt` es el timestamp local (ms) con el que se ofrece
  // "de hace X" en el modal. `null` = nada que ofrecer. Ver
  // `ofrecerBorradorSiHaceFalta`.
  const [recuperable, setRecuperable] = useState<{ id: number; borrador: TrazosHoja; guardadoAt: number } | null>(
    null,
  )

  const qc = useQueryClient()
  const { data: hojas = [], isLoading } = useQuery<HojaManuscritaApi[]>({
    queryKey: ['hojas', citaId],
    queryFn: () => api.get<HojaManuscritaApi[]>(`/atenciones/cita/${citaId}/hojas`).then((r) => r.data),
  })

  const crearHoja = useMutation({
    mutationFn: () =>
      api
        .post<HojaManuscritaApi>(`/atenciones/cita/${citaId}/hojas`, { trazos: hojaVacia() })
        .then((r) => r.data),
    onSuccess: (nueva) => {
      // Actualizacion optimista de la cache ADEMAS del invalidate (no en vez
      // de: el invalidate reconcilia con el servidor por si otra pestaña
      // toco la misma atencion mientras tanto). Sin esto, `hojas` seguiria
      // stale por el round-trip del refetch mientras `hojaActivaId` ya
      // apunta a la hoja nueva -- `indiceDe()` no la encontraria en la lista
      // vieja y el contador mostraria "Hoja 0 / N" un instante.
      qc.setQueryData<HojaManuscritaApi[]>(['hojas', citaId], (prev) => [...(prev ?? hojas), nueva])
      qc.invalidateQueries({ queryKey: ['hojas', citaId] })
      // cargarHoja() (mas abajo) tambien resetea el historial de deshacer:
      // sin eso, saltar a la hoja nueva dejaria la pila de la hoja anterior
      // aplicable sobre una hoja que nunca la tuvo.
      cargarHoja(nueva)
    },
    onError: (err: any) => toast.fromError(err, 'No se pudo crear la hoja'),
  })

  // Sin `onError` con toast aca a proposito: un PUT que resuelve OK no
  // garantiza que lo guardado sea lo MAS reciente en memoria (pudo llegar
  // un cambio nuevo mientras estaba en vuelo), asi que ni el toast de error
  // ni el borrado del borrador local pueden decidirse a este nivel --
  // ambos se deciden en `guardarActivaSiSucia()`, la unica que sabe si lo
  // que se acaba de confirmar coincide EXACTO con lo que hay en pantalla, y
  // si el guardado lo pidio una accion silenciosa (timer) o explicita
  // (cambio de hoja, "Recuperar"). Ver Finding 1 y 3 del review.
  const guardarHoja = useMutation({
    mutationFn: ({ id, trazos }: { id: number; trazos: TrazosHoja }) =>
      api.put(`/atenciones/cita/${citaId}/hojas/${id}`, { trazos }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hojas', citaId] }),
  })

  const borrarHoja = useMutation({
    mutationFn: (id: number) => api.delete(`/atenciones/cita/${citaId}/hojas/${id}`),
    onSuccess: (_data, id) => {
      setHojaABorrar(null)
      // Preferencia de a donde saltar: la hoja que ocupaba el siguiente
      // lugar (ahora corrida a este indice tras filtrar); si no hay
      // siguiente, la anterior; si no queda ninguna, null (estado vacio).
      const idx = hojas.findIndex((h) => h.id === id)
      const restantes = hojas.filter((h) => h.id !== id)
      // Actualizacion optimista de la cache ADEMAS del invalidate: sin ella,
      // `hojas` seguiria mostrando la hoja recien borrada hasta que el
      // refetch en segundo plano del invalidate resuelva. En ese hueco el
      // contador "Hoja N / M" parpadea contra un M viejo y, peor, si el
      // doctor toca "anterior/siguiente" durante esa ventana el boton puede
      // calcular el id de la hoja YA borrada (todavia presente en el array
      // stale) y mandar un guardado/cambio contra una hoja que el servidor
      // ya dio de baja (404). Filtrar la cache ya mismo cierra la ventana.
      qc.setQueryData<HojaManuscritaApi[]>(['hojas', citaId], restantes)
      qc.invalidateQueries({ queryKey: ['hojas', citaId] })
      if (id !== hojaActivaId) return
      // Se borro la hoja que se estaba viendo: saltar a la vecina calculada arriba.
      cargarHoja(restantes[idx] ?? restantes[idx - 1] ?? null)
    },
    onError: (err: any) => {
      setHojaABorrar(null)
      toast.fromError(err, 'No se pudo eliminar la hoja')
    },
  })

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

  // Selecciona la primera hoja la UNICA vez que la lista carga con al menos
  // una hoja (candado `autoSeleccionoRef`, ver su declaracion). Nunca vuelve
  // a auto-seleccionar despues: un refetch en segundo plano (tras guardar,
  // crear o borrar) no debe pisar `trazosRef` con lo que devuelva el
  // servidor mientras el doctor sigue escribiendo, ni resucitar una hoja
  // recien borrada mientras la cache de la query todavia esta stale.
  //
  // `useLayoutEffect`, no `useEffect`: con un efecto pasivo normal, el
  // PRIMER render tras resolver `hojas` (con `hojaActivaId` todavia null)
  // se pinta en pantalla ANTES de que el efecto corra -- el doctor ve, por
  // un frame, "Hoja 0 / N" y el area sin canvas ni estado vacio (ninguno de
  // los dos gates matchea: `hojaActivaId !== null` es falso Y
  // `hojas.length === 0` tambien es falso). `useLayoutEffect` corre
  // sincronicamente DESPUES de aplicar el DOM de ese render pero ANTES de
  // que el navegador pinte; el `setHojaActivaId` que dispara aca se
  // resuelve en un segundo render-commit que reemplaza al primero antes de
  // que llegue a verse. Mismo mecanismo que ya usa React para evitar
  // parpadeos de layout; aca lo usamos para evitar un parpadeo de dato.
  useLayoutEffect(() => {
    if (autoSeleccionoRef.current || isLoading || hojas.length === 0) return
    autoSeleccionoRef.current = true
    if (hojaActivaId === null) cargarHoja(hojas[0])
  }, [isLoading, hojas, hojaActivaId])

  // Autoguardado: un intervalo fijo de 10s para toda la vida del componente
  // (deps `[]`, no `[sucio, hojaActivaId]`) -- CADA tick llama
  // `guardarActivaSiSucia()`, que internamente no-opea si no hay nada sucio
  // o si ya hay un guardado en vuelo (mutex `guardadoEnCursoRef`).
  //
  // Un timer rearmado solo en la transicion `sucio` false->true (la version
  // anterior de este efecto) tiene un hueco real: si el primer intento
  // falla (offline), `guardarActivaSiSucia()` NO toca `sucio` en la rama de
  // error (sigue en `true`, sin cambiar de VALOR) -- React bailea de
  // re-renderizar cuando `setState` recibe el mismo valor primitivo que ya
  // tenia, asi que el efecto NUNCA vuelve a correr y NUNCA se arma un timer
  // nuevo, aunque el doctor siga escribiendo (cada trazo llama
  // `setSucio(true)`, ya `true`, mismo bailout). El intervalo fijo no
  // depende de que ningun estado CAMBIE DE VALOR: vuelve a preguntar cada
  // 10s pase lo que pase, asi que reintenta indefinidamente mientras la
  // conexion siga caida y haya algo pendiente.
  //
  // Reusa `guardarActivaSiSucia()` a proposito -- el MISMO camino (con el
  // mutex de `guardadoEnCursoRef`) que usan `irAHoja`/`nuevaHoja`: una
  // segunda ruta de guardado que se saltee la comparacion de snapshot
  // reintroduciria el bug critico de Task 10 (trazo dibujado durante un PUT
  // en vuelo, perdido en silencio al cambiar de hoja).
  //
  // `silencioso = true`: un fallo del timer NO dispara un toast -- en un
  // corte de conexion real serian 6 toasts por minuto encima del doctor a
  // mitad de una consulta, cuando el indicador "Sin guardar" del header ya
  // comunica lo mismo sin interrumpir. Un cambio de hoja explicito que se
  // UNA a este mismo guardado (ver `guardarActivaSiSucia`) lo reactiva:
  // ahi si hay alguien esperando el resultado.
  useEffect(() => {
    const t = setInterval(() => {
      void guardarActivaSiSucia(true)
    }, 10_000)
    return () => clearInterval(t)
  }, [])

  // Guarda lo pendiente al salir de la pantalla: este componente es un
  // overlay `fixed`, se desmonta cuando el padre deja de renderizarlo tras
  // `onClose()` (boton X o Escape). Efecto de limpieza con deps `[]` a
  // proposito (correr una sola vez, al desmontar de verdad, no en cada
  // cambio de hoja): eso ata el closure de este efecto al PRIMER render,
  // pero es seguro llamar directo a `prepararCambioDeHoja` -- misma razon
  // que el timer de arriba tambien puede llamar `guardarActivaSiSucia`
  // directo desde su propio closure fijo: ninguna de las dos depende de
  // ningun estado CAPTURADO por closure (`prepararCambioDeHoja` y todo lo
  // que llama -- `terminarGestoEnCurso`, `guardarActivaSiSucia` -- solo leen
  // refs y setters de estado, estables por React), asi que da igual desde
  // que render se haya "congelado" el closure. `prepararCambioDeHoja` (no
  // solo `guardarActivaSiSucia`) para tambien comitear un trazo a medio
  // hacer si el doctor cierra con el lapiz todavia apoyado.
  useEffect(() => {
    return () => {
      void prepararCambioDeHoja()
    }
  }, [])

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
  // cerrados hasta el proximo trazo nuevo. `hojaActivaId` en las deps: es lo
  // que repinta al cambiar de hoja -- cargarHoja() solo escribe trazosRef y
  // llama setHojaActivaId, nunca pintarFondo() directo, porque al pasar de
  // "ninguna hoja activa" a la primera el canvas todavia no esta montado en
  // ese mismo tick (se monta recien en el commit que sigue a este render).
  useEffect(() => {
    pintarFondo()
  }, [anchoCss, altoCss, hojaActivaId])

  /**
   * Reemplaza la lista de trazos y repinta. Unico camino que escribe en
   * trazosRef -- lo llaman `alSubir` (trazo nuevo), `borrarEn` (borrador),
   * `deshacer`/`rehacer` y `recuperarBorrador`, asi que es el unico lugar
   * correcto para el throttle del borrador local: cubre las CINCO formas de
   * editar la hoja, no solo agregar un trazo.
   *
   * Throttle por `contadorAplicarRef` (cuenta llamadas a `aplicar()`), NO
   * por `strokes.length`: el borrador (`borrarEn`) y deshacer pueden BAJAR
   * el conteo de trazos, asi que un throttle atado al largo del array
   * dejaria de escribir borradores durante una sesion de borrado intensivo
   * -- justo el escenario que produce el contenido mas importante de
   * respaldar (cambios recientes que todavia no llegaron al servidor).
   */
  function aplicar(strokes: Trazo[]) {
    trazosRef.current = { ...trazosRef.current, strokes }
    pintarFondo()
    sucioRef.current = true
    setSucio(true)
    setPuedeDeshacer(pilaDeshacer.current.length > 0)
    setPuedeRehacer(pilaRehacer.current.length > 0)

    // Borrador local cada 5 ediciones: barato (fire-and-forget, no bloquea
    // el dibujo) y alcanza como red de seguridad. `hojaActivaIdRef` (no el
    // estado): consistente con el resto de la logica critica de esta
    // pantalla, y correcto aca ademas porque `aplicar()` puede llamarse
    // desde `recuperarBorrador()` en el mismo tick que otros cambios de
    // estado siguen en vuelo. `guardarBorrador()` nunca lanza (ver su
    // JSDoc en borradorLocal.ts): un fallo de IndexedDB (privado, cupo
    // lleno, iOS que expulso el storage) jamas puede interrumpir un
    // handler de puntero.
    contadorAplicarRef.current += 1
    const hojaId = hojaActivaIdRef.current
    if (hojaId !== null && contadorAplicarRef.current % 5 === 0) {
      void guardarBorrador(hojaId, trazosRef.current)
    }
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
    // Rechaza CUALQUIER gesto nuevo (lapiz o borrador) mientras un cambio de
    // hoja esta en curso: `bloqueoDibujoRef` cubre desde el instante en que
    // irAHoja/nuevaHoja arrancan hasta que terminan del todo (guardado +
    // reintento + el propio cambio/creacion), no solo la ventana de la
    // mutation de guardado. Ref, no estado: se lee sincronicamente aca sin
    // esperar a que un re-render vuelva a crear este closure. Ver Finding 1
    // del review de Task 10 -- un trazo dibujado mientras el PUT de la hoja
    // saliente esta en vuelo se perdia silenciosamente al cambiar de hoja.
    if (bloqueoDibujoRef.current) return
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

  /**
   * Si hay un gesto a medio hacer (el doctor todavia tiene el lapiz o el
   * dedo apoyado, `punteroActivo` capturado), lo termina de forma prolija:
   * si era un trazo de lapiz en curso, lo comitea como si hubiera soltado
   * (mismo resultado que `alSubir`) en vez de descartarlo; si era un
   * arrastre de borrador, no hay nada que comitear (cada borrado ya se
   * aplico en el momento via `borrarEn`). En ambos casos libera el pointer
   * capture y limpia el canvas en vivo, para que cualquier evento tardio de
   * ESE puntero (ya no coincide con `punteroActivo`) quede inerte.
   *
   * Se llama al empezar un cambio de hoja (`prepararCambioDeHoja`, mas
   * abajo), ANTES de tomar la foto de `trazosRef` que se va a guardar --
   * asi un gesto en curso en el instante exacto en que el doctor toca
   * "siguiente" queda incluido en el guardado en vez de perderse. Ver
   * Finding 1 del review de Task 10.
   */
  function terminarGestoEnCurso() {
    const trazo = trazoActivo.current
    trazoActivo.current = null
    if (punteroActivo.current !== null) {
      const canvas = canvasVivo.current
      if (canvas?.hasPointerCapture(punteroActivo.current)) {
        canvas.releasePointerCapture(punteroActivo.current)
      }
      punteroActivo.current = null
    }
    limpiarVivo()
    if (!trazo || trazo.p.length === 0) return
    registrarCambio()
    aplicar([...trazosRef.current.strokes, trazo])
  }

  /**
   * Unico camino que cambia CUAL hoja esta activa: escribe trazosRef desde
   * la hoja recibida (o la vacia si `hoja` es null, estado sin ninguna
   * hoja), resetea el historial de deshacer/rehacer (una pila de sheet 1 no
   * puede aplicarse a sheet 2) y limpia cualquier trazo en curso. No marca
   * `sucio` -- cargar una hoja no es editarla -- ni llama pintarFondo(): el
   * efecto sobre [anchoCss, altoCss, hojaActivaId] repinta una vez el canvas
   * de la hoja destino este montado.
   *
   * Al final, si hay una hoja real, dispara (sin esperar) el chequeo de
   * borrador local -- ver `ofrecerBorradorSiHaceFalta`.
   */
  function cargarHoja(hoja: HojaManuscritaApi | null) {
    trazoActivo.current = null
    punteroActivo.current = null
    pilaDeshacer.current = []
    pilaRehacer.current = []
    setPuedeDeshacer(false)
    setPuedeRehacer(false)
    sucioRef.current = false
    setSucio(false)
    // Throttle del borrador local por hoja, no global: sin esto, las
    // primeras ediciones de una hoja recien abierta podrian tardar en
    // escribir su primer borrador segun donde haya quedado el contador de
    // la hoja anterior.
    contadorAplicarRef.current = 0
    const delServidor = hoja ? ((hoja.trazos as TrazosHoja) ?? hojaVacia()) : hojaVacia()
    trazosRef.current = delServidor
    hojaActivaIdRef.current = hoja?.id ?? null
    setHojaActivaId(hoja?.id ?? null)

    if (hoja) void ofrecerBorradorSiHaceFalta(hoja.id, delServidor)
  }

  /**
   * Tras cargar una hoja, revisa si IndexedDB tiene un borrador que DIFIERE
   * de lo que acaba de llegar del servidor -- señal de que un corte de
   * conexion dejo cambios sin subir. Si es asi, lo OFRECE via `recuperable`
   * (modal mas abajo en el render) -- nunca lo aplica ni lo descarta en
   * silencio, la decision es del doctor.
   *
   * Comparacion por CONTENIDO (`trazosIguales`), NO por tiempo ni por
   * cantidad de trazos (fix-round de review, cierre del residual de
   * desfasaje de reloj que quedo abierto en la ronda anterior). El
   * borrador SOLO se escribe desde el editor en vivo, y el editor SIEMPRE
   * arranca sembrado con la copia del servidor (`cargarHoja`, arriba) --
   * asi que un borrador cuyo CONTENIDO difiere de lo que el servidor tiene
   * ahora es, por construccion, trabajo local que el servidor no tiene,
   * sin importar cuando se escribio ninguno de los dos. Esto no necesita
   * ningun reloj:
   * - Comparar por TIEMPO (version anterior:
   *   `borrador.guardadoAt > Date.parse(hoja.updatedAt)`) comparaba un
   *   reloj de CLIENTE contra uno de SERVIDOR. Un reloj de tablet
   *   atrasado (zona horaria mal puesta, DST, un dispositivo que estuvo
   *   apagado semanas) hacia que un borrador genuinamente mas nuevo
   *   comparara como mas viejo -- el ofrecimiento nunca se disparaba, y
   *   el doctor quedaba silenciosamente sin la unica red de seguridad
   *   que existe especificamente para ese corte de conexion.
   * - Comparar por CANTIDAD de trazos (dos rondas atras) es semanticamente
   *   incorrecto en cuanto el doctor puede BORRAR: una edicion legitima
   *   que borra 3 trazos y deja la hoja mas corta no es "menos completa"
   *   que la version del servidor, es distinta.
   *
   * `leerBorrador` es async: para cuando resuelve, el doctor pudo haber
   * cambiado de hoja de nuevo (nav rapida). Se compara `hojaActivaIdRef.current`
   * (espejo sincronico, siempre al dia) contra el `id` que motivo esta
   * llamada -- si ya no coinciden, el ofrecimiento quedo viejo y se descarta
   * sin mostrar nada.
   */
  async function ofrecerBorradorSiHaceFalta(id: number, delServidor: TrazosHoja) {
    const borrador = await leerBorrador(id)
    if (!borrador || hojaActivaIdRef.current !== id) return
    if (!trazosIguales(borrador.trazos.strokes, delServidor.strokes)) {
      setRecuperable({ id, borrador: borrador.trazos, guardadoAt: borrador.guardadoAt })
    }
  }

  /** Indice (0-based) de una hoja en la lista ordenada -- NUNCA su `orden` (ver comentario de `hojaActivaId`). */
  function indiceDe(id: number) {
    return hojas.findIndex((h) => h.id === id)
  }

  /**
   * Guarda la hoja activa si tiene cambios sin guardar. Devuelve `false` sin
   * tocar nada si el guardado falla o si lo que se acaba de confirmar en el
   * servidor quedo viejo (ver mas abajo) -- en ambos casos `sucio` sigue en
   * `true` y el borrador local NO se borra.
   *
   * Invariante (fix-round de review, Finding 1): **nunca** se marca `sucio
   * = false` ni se borra el borrador local salvo que lo que el servidor
   * ACABA de confirmar sea EXACTAMENTE lo que hay en memoria en ese
   * instante (`trazosRef.current === foto`, comparacion de referencia --
   * `aplicar()` siempre crea un objeto nuevo, asi que cualquier escritura
   * durante el `await` cambia la identidad). `alBajar` rechaza gestos
   * NUEVOS mientras `bloqueoDibujoRef` esta activo (solo durante un cambio
   * de hoja), pero el timer de autoguardado (mas abajo) deliberadamente NO
   * bloquea el dibujo -- un doctor escribiendo sin pausa puede agregar
   * trazos durante CUALQUIER PUT en vuelo, no solo el de un cambio de hoja.
   *
   * Sin esta invariante (version anterior: un solo reintento y despues
   * limpiar sin volver a chequear) un doctor escribiendo a traves de DOS
   * rondas de red lentas perdia la ULTIMA revision en silencio: el segundo
   * PUT (el reintento) podia quedar viejo TAMBIEN si un trazo mas llego
   * mientras estaba en vuelo, y el codigo limpiaba `sucio` y borraba el
   * borrador de todos modos -- el trazo mas nuevo quedaba solo en memoria,
   * sin servidor y sin borrador, con el indicador diciendo "Guardado".
   *
   * Diseño elegido -- **sin reintento interno** (no un bucle acotado): un
   * solo intento por llamada; si al resolver `trazosRef.current !== foto`,
   * se retorna `false` sin reintentar aca mismo. Quien vuelve a intentarlo
   * es el PROXIMO llamador -- el timer de autoguardado ya reintenta
   * indefinidamente cada 10s (ver mas abajo), y un cambio de hoja
   * (`irAHoja`/`nuevaHoja`) que reciba `false` simplemente no avanza (el
   * doctor sigue en la misma hoja, con sus trazos intactos, y puede volver
   * a tocar "siguiente"). Se prefirio esto a un bucle acotado dentro de la
   * funcion por ser mas simple de razonar -- un solo lugar decide "hubo
   * coincidencia o no", sin un contador de intentos que mantener -- y
   * porque la cadencia de 10s del timer ya es el mecanismo de reintento;
   * duplicarlo aca (bucle + timer, dos relojes distintos reintentando lo
   * mismo) no agrega seguridad, solo complejidad.
   *
   * Task 11: unica funcion que emite el PUT de guardado, reusada por
   * `irAHoja`/`nuevaHoja` (via `prepararCambioDeHoja`), `recuperarBorrador`,
   * el timer de autoguardado y el flush al desmontar -- por diseño, para no
   * reintroducir el bug que Task 10 arreglo con una segunda ruta de
   * guardado. Como ahora hay MAS de un llamador que puede pedir un guardado
   * en cualquier momento (no solo un cambio de hoja explicito),
   * `guardadoEnCursoRef` evita que dos llamados concurrentes disparen dos
   * PUT en paralelo contra la misma hoja: el segundo llamado se UNE a la
   * promesa del primero en vez de arrancar uno nuevo, y recibe el mismo
   * resultado. Esto tambien cierra el caso "un cambio de hoja arranca justo
   * cuando el autoguardado ya esta en vuelo": sin unirse, `irAHoja` podria
   * seguir de largo a `cargarHoja()` (que pisa `trazosRef` con la hoja
   * destino) MIENTRAS el PUT del autoguardado, todavia en curso, evalua su
   * propia comparacion de snapshot -- veria `trazosRef.current !== foto`
   * por una razon incorrecta (la hoja cambio, no que se agrego un trazo) y
   * reenviaria el contenido de la hoja DESTINO contra el id de la hoja
   * ORIGEN.
   *
   * `silencioso` (Finding 3): si es `true` (el timer), un fallo NO dispara
   * el toast de error -- durante un corte de conexion real el timer
   * reintenta cada 10s indefinidamente, y un toast por cada intento fallido
   * seria una interrupcion cada 10s encima del doctor a mitad de una
   * consulta; el indicador "Sin guardar" del header ya comunica lo mismo
   * sin interrumpir. Si es `false` (default -- cambio de hoja, "Recuperar",
   * flush al salir) el doctor esta esperando el resultado de una accion
   * explicita, asi que un fallo SI avisa. El flag vive en `estado`
   * (objeto mutable compartido con `guardadoEnCursoRef.current.estado`,
   * no una primitiva capturada) para poder "upgradearse": si un llamador
   * NO silencioso se UNE a un guardado que el timer arranco en silencio,
   * el guardado en vuelo pasa a no-silencioso -- alguien esta esperando de
   * verdad, asi que si termina fallando, ahora si debe avisar.
   *
   * Lee `hojaActivaIdRef` (no el estado `hojaActivaId`) a proposito: el
   * timer de autoguardado (mas abajo) es un `setInterval` fijo que llama
   * esta funcion desde el closure del PRIMER render (efecto con deps `[]`).
   * Si leyera el estado, esa llamada veria para siempre el `hojaActivaId`
   * de ese primer render (`null`, antes de la auto-seleccion) y el
   * autoguardado nunca guardaria nada real. Los refs son el MISMO objeto
   * mutable en todos los renders, asi que leerlos desde cualquier closure
   * (viejo o nuevo) da siempre el valor actual.
   */
  async function guardarActivaSiSucia(silencioso = false): Promise<boolean> {
    if (guardadoEnCursoRef.current) {
      if (!silencioso) guardadoEnCursoRef.current.estado.silencioso = false
      return guardadoEnCursoRef.current.promesa
    }
    // `sucioRef`/`hojaActivaIdRef`, no el estado: ver el parrafo del JSDoc
    // (llamador desde closure potencialmente viejo) y, ademas, si
    // `terminarGestoEnCurso()` acaba de comitear un trazo en ESTE mismo
    // llamado (dentro de `prepararCambioDeHoja`), el estado `sucio` todavia
    // no reflejaria ese cambio aca (mismo motivo original de `sucioRef`).
    const hojaId = hojaActivaIdRef.current
    if (!sucioRef.current || hojaId === null) return true

    const estado = { silencioso }
    const promesa = (async (): Promise<boolean> => {
      const id = hojaId
      const foto = trazosRef.current
      try {
        await guardarHoja.mutateAsync({ id, trazos: foto })
      } catch (err) {
        if (!estado.silencioso) toast.fromError(err, 'No se pudo guardar la hoja')
        return false
      }
      // Solo aca -- coincidencia exacta confirmada -- es seguro marcar
      // limpio y borrar el borrador local. Si `trazosRef` cambio mientras
      // el PUT estaba en vuelo, lo que el servidor tiene ya quedo viejo:
      // no se marca limpio, no se borra el borrador, y se retorna `false`
      // sin reintentar aca (ver el diseño elegido en el JSDoc).
      if (trazosRef.current === foto) {
        sucioRef.current = false
        setSucio(false)
        void borrarBorrador(id)
        return true
      }
      return false
    })()

    guardadoEnCursoRef.current = { promesa, estado }
    try {
      return await promesa
    } finally {
      guardadoEnCursoRef.current = null
    }
  }

  /**
   * Preambulo comun a `irAHoja`/`nuevaHoja`: termina cualquier gesto a medio
   * hacer (para que quede incluido en lo que se guarda, no perdido) y guarda
   * la hoja activa si quedo sucia. Devuelve `false` si el guardado fallo --
   * el llamador no debe seguir con el cambio/creacion.
   */
  async function prepararCambioDeHoja(): Promise<boolean> {
    terminarGestoEnCurso()
    return guardarActivaSiSucia()
  }

  /**
   * Cambia a otra hoja. Bloquea gestos de dibujo nuevos y guarda la actual
   * si hace falta ANTES de tocar nada; si el guardado falla, no cambia de
   * hoja (los trazos siguen intactos en `trazosRef`, el toast ya avisa).
   * Perder trazos al cambiar de hoja es el peor bug posible de esta
   * pantalla.
   */
  async function irAHoja(id: number) {
    if (id === hojaActivaId || operandoHoja) return
    bloqueoDibujoRef.current = true
    setCambiandoHoja(true)
    try {
      const ok = await prepararCambioDeHoja()
      if (!ok) return
      const destino = hojas.find((h) => h.id === id)
      if (!destino) return // la lista cambio bajo los pies (poco probable, defensivo)
      cargarHoja(destino)
    } finally {
      bloqueoDibujoRef.current = false
      setCambiandoHoja(false)
    }
  }

  /**
   * Crea una hoja nueva y salta a ella. Saltar a la hoja nueva es, para
   * quien escribe, lo mismo que cambiar de hoja: mismo preambulo de
   * `irAHoja` (bloqueo + guardado previo con reintento), asi que un doble
   * tap en "+ Hoja" o un trazo mientras la creacion esta en vuelo no puede
   * perder nada tampoco.
   */
  async function nuevaHoja() {
    if (operandoHoja || estaEnLimite) return
    bloqueoDibujoRef.current = true
    setCambiandoHoja(true)
    try {
      const ok = await prepararCambioDeHoja()
      if (!ok) return
      await crearHoja.mutateAsync()
    } catch {
      // el toast ya lo dispara crearHoja.onError
    } finally {
      bloqueoDibujoRef.current = false
      setCambiandoHoja(false)
    }
  }

  /**
   * Aplica el borrador recuperado como el contenido vivo de la hoja (marca
   * `sucio`, como cualquier otro cambio, via `aplicar()`) y dispara un
   * guardado inmediato en vez de esperar los 10s del timer -- una vez que
   * el doctor elige recuperar, mejor persistirlo cuanto antes. Reusa
   * `guardarActivaSiSucia()` sin `silencioso` (default `false`): es una
   * accion explicita, si el guardado falla (sigue offline) el doctor debe
   * verlo. El borrador local NO se borra aca -- `guardarActivaSiSucia()` lo
   * hace, y solo si confirma que lo guardado coincide exacto con lo que hay
   * en pantalla (ver su JSDoc, Finding 1 del review).
   */
  function recuperarBorrador() {
    if (!recuperable) return
    aplicar(recuperable.borrador.strokes)
    setRecuperable(null)
    void guardarActivaSiSucia()
  }

  /** Descarta el borrador local ofrecido: el servidor ya tiene la version vigente. */
  function descartarBorrador() {
    if (!recuperable) return
    void borrarBorrador(recuperable.id)
    setRecuperable(null)
    toast.success('Borrador descartado')
  }

  const estaEnLimite = hojas.length >= MAX_HOJAS_POR_ATENCION
  const indiceActivo = hojaActivaId !== null ? indiceDe(hojaActivaId) : -1
  const hayAnterior = indiceActivo > 0
  const haySiguiente = indiceActivo >= 0 && indiceActivo < hojas.length - 1
  // Estado del indicador de guardado (header): "guardando" mientras el PUT
  // esta en vuelo (via TanStack Query, cubre timer/nav/flush por igual, sin
  // importar quien lo disparo), "sin guardar" mientras `sucio` y no hay PUT
  // en curso, "guardado" en el resto (incluye el estado inicial al abrir una
  // hoja sin cambios -- es correcto: lo que se ve YA es lo que tiene el
  // servidor).
  const estadoGuardado: 'guardando' | 'guardado' | 'sin-guardar' = guardarHoja.isPending
    ? 'guardando'
    : sucio
      ? 'sin-guardar'
      : 'guardado'
  // Fuente unica de verdad para "hay una operacion de hoja en curso": las
  // tres mutations (Task 10 original) MAS `cambiandoHoja` (este round), que
  // cubre la ventana completa de irAHoja/nuevaHoja incluyendo el tramo entre
  // que el guardado resuelve y que cargarHoja()/crearHoja() terminan -- una
  // ventana que `guardarHoja.isPending` por si solo no cubre. Gatea TODOS
  // los controles de navegacion y ciclo de vida de hoja (flechas, + Hoja,
  // eliminar); el borrado ademas queda protegido por el propio
  // ConfirmarModal, que bloquea fisicamente el resto de la UI. Ver Finding 2
  // del review de Task 10.
  const operandoHoja = crearHoja.isPending || guardarHoja.isPending || borrarHoja.isPending || cambiandoHoja

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
            {hojaActivaId !== null && (
              // aria-live="polite": un lector de pantalla anuncia el cambio
              // sin interrumpir -- el span en si nunca se desmonta mientras
              // haya una hoja activa, solo cambia su contenido, asi que las
              // tres transiciones (guardando/guardado/sin guardar) quedan
              // cubiertas. Color + forma (icono), nunca solo color: "sin
              // guardar" es el unico estado que realmente pide atencion.
              <span
                aria-live="polite"
                className={cn(
                  'inline-flex items-center gap-1 shrink-0',
                  estadoGuardado === 'sin-guardar' && 'text-amber-600 dark:text-amber-400',
                  estadoGuardado === 'guardado' && 'text-emerald-600 dark:text-emerald-400',
                )}
              >
                {estadoGuardado === 'guardando' && (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    Guardando…
                  </>
                )}
                {estadoGuardado === 'sin-guardar' && (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                    Sin guardar
                  </>
                )}
                {estadoGuardado === 'guardado' && (
                  <>
                    <Check className="h-3 w-3" aria-hidden="true" />
                    Guardado
                  </>
                )}
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

      <div className="shrink-0 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 px-4 py-2 sm:justify-between sm:px-6 border-b bg-card/60">
        {isLoading && <p className="text-sm text-muted-foreground">Cargando hojas…</p>}

        {!isLoading && hojas.length === 0 && (
          <button type="button" onClick={nuevaHoja} disabled={operandoHoja} className={cn(btnPrimaryUI, 'h-11')}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Primera hoja
          </button>
        )}

        {!isLoading && hojas.length > 0 && (
          <>
            <div className="inline-flex items-center gap-1" role="group" aria-label="Navegar hojas">
              <button
                type="button"
                onClick={() => hayAnterior && irAHoja(hojas[indiceActivo - 1].id)}
                disabled={!hayAnterior || operandoHoja}
                aria-label="Hoja anterior"
                title="Hoja anterior"
                className={cn(
                  btnIconUI,
                  'h-11 w-11 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent',
                )}
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              <span
                className="min-w-[6rem] text-center text-sm font-medium tabular-nums text-foreground"
                aria-live="polite"
              >
                Hoja {indiceActivo + 1} / {hojas.length}
              </span>
              <button
                type="button"
                onClick={() => haySiguiente && irAHoja(hojas[indiceActivo + 1].id)}
                disabled={!haySiguiente || operandoHoja}
                aria-label="Hoja siguiente"
                title="Hoja siguiente"
                className={cn(
                  btnIconUI,
                  'h-11 w-11 shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent',
                )}
              >
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="inline-flex items-center gap-2">
              {estaEnLimite && <p className="text-xs text-muted-foreground">Máximo 20 hojas por atención</p>}
              <button
                type="button"
                onClick={nuevaHoja}
                disabled={operandoHoja || estaEnLimite}
                title={estaEnLimite ? 'Máximo 20 hojas por atención' : 'Agregar hoja'}
                className={cn(btnOutlineUI, 'h-11')}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Hoja
              </button>
              <button
                type="button"
                onClick={() => hojaActivaId !== null && setHojaABorrar(hojaActivaId)}
                disabled={hojaActivaId === null || operandoHoja}
                aria-label="Eliminar hoja actual"
                title="Eliminar hoja actual"
                className={cn(
                  btnIconUI,
                  'h-11 w-11 shrink-0 text-destructive hover:bg-destructive/10 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent',
                )}
              >
                <Trash2 className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden p-4 sm:p-6">
        <div ref={areaRef} className="flex h-full w-full items-center justify-center">
          {anchoCss > 0 && hojaActivaId !== null && (
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
          {anchoCss > 0 && hojaActivaId === null && !isLoading && hojas.length === 0 && (
            <div className="flex max-w-xs flex-col items-center gap-2 text-center">
              <PenLine className="h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                Todavía no hay hojas en esta atención. Agregá la primera para empezar a escribir.
              </p>
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

      {hojaABorrar !== null && (
        <ConfirmarModal
          titulo="Eliminar hoja"
          mensaje={`Se eliminará la hoja ${indiceDe(hojaABorrar) + 1} de la historia clínica. Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          pendiente={borrarHoja.isPending}
          onConfirm={() => borrarHoja.mutate(hojaABorrar)}
          onClose={() => setHojaABorrar(null)}
        />
      )}

      {recuperable && (
        // No se usa ConfirmarModal aca a proposito: su boton de confirmar es
        // SIEMPRE btnDestructiveUI (rojo), pensado para acciones irreversibles
        // de riesgo (eliminar). "Recuperar" es la accion SEGURA y recomendada
        // -- pintarla de rojo diria, al reves de lo que es cierto, que
        // recuperar los propios trazos es lo arriesgado. Mismo andamiaje
        // visual que ConfirmarModal/CancelarCitaModal (ModalHeader +
        // modal-fade/modal-pop), tono "primary" (default) en vez de
        // "destructive", con "Recuperar" en btnPrimaryUI (accion recomendada)
        // y "Descartar" en btnOutlineUI (secundaria) -- mismo patron que
        // "Mantener"/"Devolver y cancelar" en CancelarCitaModal.
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-xs modal-fade p-4">
          <div className="bg-card rounded-2xl border shadow-2xl ring-1 ring-black/5 modal-pop w-full max-w-sm">
            <ModalHeader icon={History} title="Cambios sin guardar" onClose={() => setRecuperable(null)} />
            <div className="p-6 sm:p-7 space-y-5">
              <p className="text-sm text-foreground">
                Encontramos cambios sin guardar en esta hoja de{' '}
                <span className="font-medium">{tiempoRelativo(new Date(recuperable.guardadoAt))}</span>,
                probablemente por un corte de conexión. ¿Querés recuperarlos?
              </p>
              <div className="flex gap-3">
                <button type="button" onClick={descartarBorrador} className={cn(btnOutlineUI, 'flex-1')}>
                  Descartar
                </button>
                <button type="button" onClick={recuperarBorrador} className={cn(btnPrimaryUI, 'flex-1')}>
                  Recuperar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
