import { api } from './api-client'

// Descarga un endpoint autenticado (JWT via axios) como archivo.
export async function descargarBlob(url: string, filename: string) {
  const res = await api.get(url, { responseType: 'blob' })
  const href = URL.createObjectURL(res.data as Blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(href)
}
