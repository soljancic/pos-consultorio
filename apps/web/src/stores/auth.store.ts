import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthUser } from '@pos/types'
import { queryClient } from '../lib/query-client'

// El refresh token ya NO vive en el cliente: viaja en una cookie httpOnly que
// JS no puede leer (un XSS no lo exfiltra). Solo persistimos el access token
// (corto, 15m) y el usuario para pintar la UI. Al expirar el access, el
// interceptor de api-client lo renueva contra la cookie (/auth/refresh).
interface AuthState {
  accessToken: string | null
  user: AuthUser | null
  setAccessToken: (accessToken: string) => void
  setUser: (user: AuthUser) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      setAccessToken: (accessToken) => set({ accessToken }),
      setUser: (user) => set({ user }),
      logout: () => {
        set({ accessToken: null, user: null })
        // Vaciar TODO el cache de queries: el proximo login (quiza de otro
        // consultorio) no debe ver datos del tenant anterior
        queryClient.clear()
      },
    }),
    { name: 'pos-auth' },
  ),
)
