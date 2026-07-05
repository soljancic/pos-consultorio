// Debe ser el PRIMER import: inicializa Sentry antes que el resto de la app
import './instrument'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { reactErrorHandler } from '@sentry/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import App from './App'
import { OfflineBanner } from './components/shared/OfflineBanner'
import { PwaUpdatePrompt } from './components/shared/PwaUpdatePrompt'
import { Toaster } from './components/shared/Toaster'
import { iniciarTema } from './lib/theme'
import { queryClient } from './lib/query-client'
import './index.css'

iniciarTema()

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string

const appContent = (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <App />
      <OfflineBanner />
      <PwaUpdatePrompt />
      <Toaster />
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
