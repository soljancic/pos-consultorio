import axios from 'axios'
import { useAuthStore } from '../stores/auth.store'

// Sin Content-Type fijo: axios pone application/json para objetos y
// multipart/form-data (con boundary) para FormData. Forzarlo a JSON rompia
// los uploads (multer no veia el archivo).
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
})

// Inyectar token en cada request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Manejar 401: intentar refresh, si falla logout
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const refreshToken = useAuthStore.getState().refreshToken
      if (refreshToken) {
        try {
          const { data } = await axios.post(
            `${import.meta.env.VITE_API_URL || '/api/v1'}/auth/refresh`,
            { refreshToken },
          )
          useAuthStore.getState().setTokens(data.accessToken, data.refreshToken)
          original.headers.Authorization = `Bearer ${data.accessToken}`
          return api(original)
        } catch {
          useAuthStore.getState().logout()
        }
      }
    }
    return Promise.reject(error)
  },
)
