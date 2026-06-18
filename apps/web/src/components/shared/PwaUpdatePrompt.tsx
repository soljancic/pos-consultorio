import { useRegisterSW } from 'virtual:pwa-register/react'

// Registro del service worker. Con registerType: 'autoUpdate' (vite.config.ts)
// el SW nuevo entra solo y la app recarga a los assets frescos: no mostramos
// un aviso "Actualizar". Solo dejamos el chequeo periodico para pestañas que
// quedan abiertas mucho rato (sino el SW recien se actualiza al re-navegar).
export function PwaUpdatePrompt() {
  useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (registration) setInterval(() => registration.update(), 60 * 1000)
    },
  })

  return null
}
