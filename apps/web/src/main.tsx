// Debe ser el PRIMER import: inicializa Sentry antes que el resto de la app
import './instrument'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { reactErrorHandler } from '@sentry/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import App from './App'
import { OfflineBanner } from './components/shared/OfflineBanner'
import { PwaUpdatePrompt } from './components/shared/PwaUpdatePrompt'
import { iniciarTema } from './lib/theme'
import './index.css'

iniciarTema()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // staleTime 0: al navegar entre pantallas los montos se refrescan
      // siempre (una secretaria cobra y salta de caja a deudores al toque)
      staleTime: 0,
      retry: 1,
    },
  },
})

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string

const appContent = (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <App />
      <OfflineBanner />
      <PwaUpdatePrompt />
    </BrowserRouter>
  </QueryClientProvider>
)

createRoot(document.getElementById('root')!, {
  // React 19: reporta a Sentry los errores que React captura en el render
  onUncaughtError: reactErrorHandler(),
  onCaughtError: reactErrorHandler(),
}).render(
  <StrictMode>
    {googleClientId ? (
      <GoogleOAuthProvider clientId={googleClientId} locale="es">
        {appContent}
      </GoogleOAuthProvider>
    ) : (
      appContent
    )}
  </StrictMode>,
)
