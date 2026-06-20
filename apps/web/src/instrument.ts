import * as Sentry from '@sentry/react'

// Sin VITE_SENTRY_DSN el SDK queda deshabilitado (no rompe nada en local).
// App medica: Session Replay enmascara TODO el texto y bloquea media para no
// filtrar datos de pacientes; solo se graba alrededor de errores, no sesiones al azar.
// enabled solo en build de produccion: `vite dev` (local) nunca envia eventos.
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  enabled: import.meta.env.PROD,
  environment: import.meta.env.MODE,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
  ],
  tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  enableLogs: true,
  // No reportar 4xx esperados que la app YA maneja: 401 (refresh/logout via
  // interceptor), 403 (ruta/accion sin permiso por rol) y 404 (recurso
  // inexistente o de otro consultorio, ej. abrir /pacientes/:id de otro tenant).
  // No son bugs accionables; se filtran para que los errores reales no queden
  // tapados por ruido. El resto (400/422 validacion, 5xx server) si se reporta.
  beforeSend(event, hint) {
    const err = hint?.originalException as
      | { isAxiosError?: boolean; response?: { status?: number } }
      | undefined
    const status = err?.response?.status
    if (err?.isAxiosError && status != null && [401, 403, 404].includes(status)) {
      return null
    }
    return event
  },
})
