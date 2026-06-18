import * as Sentry from '@sentry/nestjs'

// Inicializa Sentry ANTES de que NestJS cargue (este archivo se importa primero
// en main.ts). Sin SENTRY_DSN el SDK queda deshabilitado: arrancar sin DSN es seguro.
// enabled solo en produccion: en dev los errores quedan en consola y NO queman cuota.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production',
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
  release: process.env.SENTRY_RELEASE,
  // Muestreo de trazas: completo en dev, acotado en produccion
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  enableLogs: true,
})
