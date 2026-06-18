import * as Sentry from '@sentry/react'

// Sin VITE_SENTRY_DSN el SDK queda deshabilitado (no rompe nada en local).
// App medica: Session Replay enmascara TODO el texto y bloquea media para no
// filtrar datos de pacientes; solo se graba alrededor de errores, no sesiones al azar.
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
  ],
  tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  enableLogs: true,
})
