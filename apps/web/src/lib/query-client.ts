import { QueryClient } from '@tanstack/react-query'

// Compartido entre main.tsx (provider) y el logout (auth.store): al cerrar
// sesion el cache se vacia entero, asi otro login en la misma pestaña (p. ej.
// otro consultorio del mismo dueño) no ve datos del tenant anterior. Las
// queries con staleTime largo (consultorio, tarifas) ni siquiera refetchean
// solas, asi que sin el clear() el nombre/moneda/QR viejos quedaban colgados.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // staleTime 0: al navegar entre pantallas los montos se refrescan
      // siempre (una secretaria cobra y salta de caja a deudores al toque)
      staleTime: 0,
      retry: 1,
    },
  },
})
