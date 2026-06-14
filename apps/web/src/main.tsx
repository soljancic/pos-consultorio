import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import App from './App'
import { OfflineBanner } from './components/shared/OfflineBanner'
import { iniciarTema } from './lib/theme'
import './index.css'

iniciarTema()

// PWA: el service worker lo registra vite-plugin-pwa (injectRegister 'auto') y
// con registerType 'autoUpdate' la app se recarga sola ante un deploy nuevo (no
// queda pegada a archivos viejos cacheados). Forzamos un chequeo de updates cada
// 60s con la API nativa para que una pestaña abierta mucho rato tambien lo tome.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then((registration) => {
    setInterval(() => registration.update(), 60 * 1000)
  })
}

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
    </BrowserRouter>
  </QueryClientProvider>
)

createRoot(document.getElementById('root')!).render(
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
