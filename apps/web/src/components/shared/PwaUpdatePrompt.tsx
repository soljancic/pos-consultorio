import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw, X } from 'lucide-react'

// Aviso de version nueva: cuando hay un deploy nuevo NO recargamos solos; le
// avisamos al usuario y el toca "Actualizar" (asi no pierde lo que esta haciendo).
// updateServiceWorker(true) aplica el SW nuevo y recarga la app.
export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      // Chequea si hay una version nueva cada 60s (pestaña abierta mucho rato).
      if (registration) setInterval(() => registration.update(), 60 * 1000)
    },
  })

  if (!needRefresh) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-[110] flex items-center justify-center gap-3 bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-lg"
      style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom))' }}
    >
      <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>Hay una nueva versión disponible.</span>
      <button
        type="button"
        onClick={() => updateServiceWorker(true)}
        className="rounded-md bg-white/20 px-3 py-1.5 font-semibold transition-colors hover:bg-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        Actualizar
      </button>
      <button
        type="button"
        onClick={() => setNeedRefresh(false)}
        aria-label="Descartar"
        className="rounded-md p-1.5 transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
