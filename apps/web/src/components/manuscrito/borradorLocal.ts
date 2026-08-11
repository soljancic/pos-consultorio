import type { Trazo, TrazosHoja } from '@pos/types'

// IndexedDB a mano: son ~50 lineas y evita sumar una dependencia por esto.
// localStorage no sirve -- es sincrono y bloquearia el hilo mientras el
// doctor escribe. El borrador es una RED DE SEGURIDAD, no una dependencia:
// cualquier fallo aca (modo privado/incognito, cupo lleno, iOS que expulsa el
// storage bajo presion de memoria) se traga en silencio -- nunca debe
// interrumpir el dibujo ni el guardado real contra el servidor. Por eso las
// tres funciones exportadas atrapan sus propios errores y jamas rechazan.
const DB = 'consultech-manuscrito'
const STORE = 'borradores'

export interface Borrador {
  hojaId: number
  trazos: TrazosHoja
  guardadoAt: number
  /**
   * Contenido que el SERVIDOR tenia para esta hoja en el momento en que se
   * escribio este borrador. Le da DIRECCION a la comparacion de
   * recuperacion: un borrador que difiere del servidor solo es trabajo mas
   * nuevo si el servidor sigue estando donde estaba cuando el borrador se
   * escribio. Si el servidor avanzo por debajo (un guardado que resolvio
   * sin coincidir, y despues la sesion murio sin flush), este borrador
   * quedo ATRAS y aplicarlo destruiria notas ya comiteadas. Ver
   * `ofrecerBorradorSiHaceFalta` en LienzoManuscrito.tsx.
   *
   * Opcional: los registros escritos antes de que existiera este campo no
   * lo tienen, y se tratan como "sin informacion" (se ofrecen igual).
   */
  base?: Trazo[]
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible'))
      return
    }
    try {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: 'hojaId' })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    } catch (err) {
      // Algunos navegadores en modo privado tiran sincronicamente en vez de
      // resolver el request con onerror (Safari viejo).
      reject(err)
    }
  })
}

// Conexion nueva por operacion (abrir + transaccion + cerrar) en vez de
// mantener una sola conexion cacheada. Se llama cada 5 ediciones (trazo
// nuevo, borrado, deshacer, rehacer o recuperar -- ver el throttle en
// `aplicar()` de LienzoManuscrito.tsx), no por evento de puntero -- en la
// practica eso es como maximo cada 1-2 segundos incluso para una mano
// rapida, un ritmo al que el costo de abrir (sub-milisegundo en navegadores
// modernos, la conexion ya existe a nivel de motor) no compite con nada
// sensible a latencia. `close()` no aborta la transaccion en curso -- el
// spec la deja terminar antes de cerrar de verdad -- asi que no hay riesgo
// de perder la escritura que motivo el open. Si este modulo pasara a
// llamarse por evento de puntero (pointermove) en vez de cada N ediciones,
// ahi si valdria la pena cachear la conexion; a este ritmo, simple gana.
async function conStore<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await abrir()
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, modo).objectStore(STORE))
      req.onsuccess = () => resolve(req.result as T)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

/**
 * Guarda (o pisa) el borrador local de una hoja. Nunca lanza: un fallo se
 * registra en consola y se ignora silenciosamente -- perder un guardado
 * local no debe interrumpir el trazo que se estaba dibujando.
 *
 * `base` = lo que el servidor tenia cuando se tomo este borrador (ver el
 * campo homonimo de `Borrador`).
 */
export async function guardarBorrador(hojaId: number, trazos: TrazosHoja, base: Trazo[]): Promise<void> {
  try {
    const borrador: Borrador = { hojaId, trazos, guardadoAt: Date.now(), base }
    await conStore<void>('readwrite', (s) => s.put(borrador))
  } catch (err) {
    console.warn('No se pudo guardar el borrador local', err)
  }
}

/** Nunca lanza: un fallo de lectura se trata igual que "no hay borrador". */
export async function leerBorrador(hojaId: number): Promise<Borrador | null> {
  try {
    const r = await conStore<Borrador | undefined>('readonly', (s) => s.get(hojaId))
    return r ?? null
  } catch (err) {
    console.warn('No se pudo leer el borrador local', err)
    return null
  }
}

/**
 * Nunca lanza: si falla, el borrador queda huerfano en IndexedDB -- inofensivo,
 * el proximo `guardarBorrador` de esa hoja lo pisa igual.
 */
export async function borrarBorrador(hojaId: number): Promise<void> {
  try {
    await conStore<void>('readwrite', (s) => s.delete(hojaId))
  } catch (err) {
    console.warn('No se pudo borrar el borrador local', err)
  }
}
