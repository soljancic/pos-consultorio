import { useRegisterSW } from 'virtual:pwa-register/react'

// Registro del service worker. Con registerType: 'autoUpdate' (vite.config.ts)
// el SW nuevo entra solo y la app recarga a los assets frescos: no mostramos
// un aviso "Actualizar". Solo dejamos el chequeo periodico para pestañas que
// quedan abiertas mucho rato (sino el SW recien se actualiza al re-navegar).
export function PwaUpdatePrompt() {
  useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      setInterval(() => {
        // En WebKit/Safari registration.update() rechaza con
        // "InvalidStateError: newestWorker is null" cuando el registro quedo
        // sin worker (desregistrado/redundante). Es benigno, pero como corre en
        // setInterval sin catch se reporta como unhandled rejection en Sentry.
        // Evitamos llamar update() sin worker vigente y tragamos el rechazo de
        // la carrera (el worker puede volverse redundante entre el check y la
        // llamada).
        if (!registration.installing && !registration.waiting && !registration.active) return
        registration.update().catch(() => {})
      }, 60 * 1000)
    },
  })

  return null
}
