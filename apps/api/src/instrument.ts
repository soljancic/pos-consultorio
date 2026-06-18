import * as Sentry from '@sentry/nestjs'

// Inicializa Sentry ANTES de que NestJS cargue (este archivo se importa primero
// en main.ts). Sin SENTRY_DSN el SDK queda deshabilitado: arrancar sin DSN es seguro.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
  release: process.env.SENTRY_RELEASE,
  // Muestreo de trazas: completo en dev, acotado en produccion
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  enableLogs: true,
})
