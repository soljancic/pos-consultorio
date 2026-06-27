import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

// Aviso de conexion para doctores/recepcion: mobile-first, barra inferior al
// alcance del pulgar, no tapa la navegacion superior. La app sigue funcionando
// con datos cacheados (SW); este aviso solo informa que esta sin red.
export function OfflineBanner() {
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && !navigator.onLine)

  useEffect(() => {
    const online = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', online)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', off)
    }
  }, [])

  if (!offline) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-100 flex items-center justify-center gap-2 bg-amber-500 px-4 py-2.5 text-sm font-medium text-amber-950 shadow-lg"
      style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom))' }}
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>Sin conexión — viendo datos guardados. Se actualiza al volver la red.</span>
    </div>
  )
}
