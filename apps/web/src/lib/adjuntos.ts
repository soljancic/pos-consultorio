import { api } from './api-client'

export type AdjuntoMeta = {
  nombre: string
  archivo: string
  tipo: string
  tamano: number
  subidoAt: string
}

// Los archivos viajan autenticados (JWT), asi que no hay URL directa para
// <a href>: se baja el blob y se abre en otra pestana
export async function abrirArchivoAutenticado(ruta: string) {
  const r = await api.get(ruta, { responseType: 'blob' })
  const url = URL.createObjectURL(r.data)
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function abrirAdjunto(citaId: number, indice: number) {
  return abrirArchivoAutenticado(`/atenciones/cita/${citaId}/adjuntos/${indice}`)
}

export function abrirRecetaPdf(recetaId: number) {
  return abrirArchivoAutenticado(`/atenciones/recetas/${recetaId}/pdf`)
}

export function formatTamano(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
