/* eslint-disable */
// Push notifications — preparado para el futuro.
// El service worker (generado por vite-plugin-pwa) importa este archivo con
// importScripts, asi que estos listeners YA quedan activos. Falta solo la parte
// de backend: suscripcion Web Push (VAPID) + endpoint que envie los mensajes.
// Cuando exista, esto muestra la notificacion sin tocar el SW generado.

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { title: 'ConsulTech', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'ConsulTech'
  const options = {
    body: data.body || '',
    icon: '/brand/android-chrome-192x192.png',
    badge: '/brand/android-chrome-192x192.png',
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const win of wins) {
        if (win.url.includes(url) && 'focus' in win) return win.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    }),
  )
})
