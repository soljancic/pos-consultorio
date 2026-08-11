import type { TrazosHoja } from '@pos/types'

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
// mantener una sola conexion cacheada. Se llama cada 5 trazos, no por evento
// de puntero -- en la practica eso es como maximo cada 1-2 segundos incluso
// para una mano rapida, un ritmo al que el costo de abrir (sub-milisegundo en
// navegadores modernos, la conexion ya existe a nivel de motor) no compite
// con nada sensible a latencia. `close()` no aborta la transaccion en curso
// -- el spec la deja terminar antes de cerrar de verdad -- asi que no hay
// riesgo de perder la escritura que motivo el open. Si este modulo pasara a
// llamarse por evento de puntero (pointermove) en vez de cada N trazos, ahi
// si valdria la pena cachear la conexion; a este ritmo, simple gana.
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
 */
export async function guardarBorrador(hojaId: number, trazos: TrazosHoja): Promise<void> {
  try {
    const borrador: Borrador = { hojaId, trazos, guardadoAt: Date.now() }
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
