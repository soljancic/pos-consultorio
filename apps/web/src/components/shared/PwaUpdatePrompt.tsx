import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

// Registro del service worker. Con registerType: 'autoUpdate' (vite.config.ts)
// el SW nuevo entra solo y la app recarga a los assets frescos: no mostramos
// un aviso "Actualizar". Solo dejamos el chequeo periodico para pestañas que
// quedan abiertas mucho rato (sino el SW recien se actualiza al re-navegar).
export function PwaUpdatePrompt() {
  // skipWaiting + clientsClaim hacen que el SW nuevo TOME control, pero la
  // pagina ya cargada sigue corriendo el bundle viejo hasta recargar. Forzamos
  // una recarga (una sola vez) cuando un SW NUEVO reemplaza al que ya controlaba
  // la pagina = hubo deploy. En la primera instalacion (sin controller previo)
  // no se recarga, para no duplicar la primera carga.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const hadController = !!navigator.serviceWorker.controller
    let recargando = false
    const onControllerChange = () => {
      if (!hadController || recargando) return
      recargando = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
  }, [])

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
