import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
