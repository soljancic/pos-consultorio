import { api } from './api-client'

export type AdjuntoMeta = {
  nombre: string
  archivo: string
  tipo: string
  tamano: number
  subidoAt: string
}

// Los adjuntos viajan autenticados (JWT), asi que no hay URL directa para
// <a href>: se baja el blob y se abre en otra pestana
export async function abrirAdjunto(citaId: number, indice: number) {
  const r = await api.get(`/atenciones/cita/${citaId}/adjuntos/${indice}`, {
    responseType: 'blob',
  })
  const url = URL.createObjectURL(r.data)
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function formatTamano(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
