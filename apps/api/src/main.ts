// Debe ser el PRIMER import: arranca Sentry antes que cualquier otro modulo
import './instrument'

import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { NestExpressApplication } from '@nestjs/platform-express'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { AppModule } from './app.module'

const esProduccion = process.env.NODE_ENV === 'production'

// En produccion la API se niega a arrancar sin secrets reales
function validarSecretsProduccion() {
  if (!esProduccion) return
  for (const clave of ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL']) {
    const valor = process.env[clave]
    if (!valor || valor.includes('change-this')) {
      throw new Error(`Config invalida: ${clave} no esta definido con un valor real de produccion`)
    }
  }
}

async function bootstrap() {
  validarSecretsProduccion()

  const app = await NestFactory.create<NestExpressApplication>(AppModule)

  // Detras del proxy de Railway: sin esto req.ip es la IP del proxy y el
  // rate limiting (login, registro, reservas del portal) colapsa en un solo
  // bucket compartido por todos los visitantes. 1 = confiar en el primer hop.
  app.set('trust proxy', 1)

  // Permite que Sentry vacie eventos pendientes al apagar el proceso
  app.enableShutdownHooks()

  app.use(helmet())
  // Lee la cookie httpOnly del refresh token (auth.controller la setea/borra)
  app.use(cookieParser())

  app.setGlobalPrefix('api/v1')

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  )

  // Sin ClassSerializerInterceptor: la API devuelve objetos planos de Prisma y el
  // interceptor descomponia los Decimal en {s,e,d} en vez de dejar que toJSON()
  // los serialice como string.
  // FRONTEND_URL admite varios origenes separados por coma (un mismo build se
  // sirve desde varios dominios publicos: *.up.railway.app + dominio propio).
  const origenesPermitidos = (process.env.FRONTEND_URL || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  app.enableCors({
    origin: origenesPermitidos,
    credentials: true,
  })

  // Swagger solo fuera de produccion: no exponer el contrato completo al mundo
  if (!esProduccion) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('POS del Consultorio API')
      .setDescription('API para el sistema de gestion de consultorios medicos')
      .setVersion('1.0')
      .addBearerAuth()
      .build()

    const document = SwaggerModule.createDocument(app, swaggerConfig)
    SwaggerModule.setup('api/docs', app, document)
  }

  const port = process.env.PORT || 3000
  await app.listen(port)
  console.log(`API corriendo en http://localhost:${port}/api/v1`)
  if (!esProduccion) console.log(`Swagger en http://localhost:${port}/api/docs`)
}

bootstrap()
