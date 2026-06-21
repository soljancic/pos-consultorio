import axios from 'axios'
import { useAuthStore } from '../stores/auth.store'

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1'

// Sin Content-Type fijo: axios pone application/json para objetos y
// multipart/form-data (con boundary) para FormData. Forzarlo a JSON rompia
// los uploads (multer no veia el archivo).
// withCredentials: el navegador manda/recibe la cookie httpOnly del refresh
// token (web y API comparten sitio toptech.com.bo; en dev va por el proxy vite).
export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
})

// Inyectar token en cada request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Un solo refresh en vuelo a la vez. Al expirar el access token varias queries
// disparan 401 a la vez; si cada una pidiera su propio refresh, la 2da
// presentaria un token ya rotado y la deteccion de reuso del server mataria la
// familia (logout espurio). Compartiendo la promesa, todas esperan al mismo.
let refreshing: Promise<string> | null = null

async function refrescarAccess(): Promise<string> {
  // Sin body: el refresh token viaja en la cookie httpOnly (withCredentials).
  // El server rota la cookie y devuelve un access token nuevo.
  const { data } = await axios.post(`${API_BASE}/auth/refresh`, {}, { withCredentials: true })
  useAuthStore.getState().setAccessToken(data.accessToken)
  return data.accessToken as string
}

// Manejar 401: intentar refresh (la cookie httpOnly lleva el token), si falla logout
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        refreshing = refreshing ?? refrescarAccess().finally(() => { refreshing = null })
        const accessToken = await refreshing
        original.headers.Authorization = `Bearer ${accessToken}`
        return api(original)
      } catch {
        useAuthStore.getState().logout()
      }
    }
    return Promise.reject(error)
  },
)
