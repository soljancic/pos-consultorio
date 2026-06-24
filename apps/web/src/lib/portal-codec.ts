import Sqids from 'sqids'

// Ofuscacion (no seguridad) de los ids numericos de doctor/servicio en el link
// de reserva: doctor=5 -> doctor=aB2k. Mismo id -> mismo codigo. El backend
// igual valida pertenencia/activo. minLength 4 para que ids chicos no salgan
// de 1-2 chars. Alfabeto fijo barajado (estable: no cambiar o se rompen los
// links ya compartidos).
const ALFABETO = 'fhpwxKQRTUVbn23456789ABCDEFGHJLMNPqrstuvyz'
const sqids = new Sqids({ alphabet: ALFABETO, minLength: 4 })

export function encodeId(id: number): string {
  return sqids.encode([id])
}

export function decodeId(code: string): number | null {
  const out = sqids.decode(code)
  return out.length === 1 ? out[0] : null
}
