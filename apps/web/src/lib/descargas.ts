import { api } from './api-client'

// Descarga un endpoint autenticado (JWT via axios) como archivo.
// Lanza un Error con mensaje legible si la descarga falla; el caller lo muestra.
export async function descargarBlob(url: string, filename: string) {
  try {
    const res = await api.get(url, { responseType: 'blob' })
    const href = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a')
    a.href = href
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(href)
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
    throw new Error(typeof msg === 'string' ? msg : 'Error al descargar el archivo')
  }
}
