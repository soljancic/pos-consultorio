import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import { SentryModule, SentryGlobalFilter } from '@sentry/nestjs/setup'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { ScheduleModule } from '@nestjs/schedule'
import { PrismaModule } from './prisma/prisma.module'
import { HealthController } from './health.controller'
import { AuthModule } from './auth/auth.module'
import { ConsultoriosModule } from './modules/consultorios/consultorios.module'
import { UsuariosModule } from './modules/usuarios/usuarios.module'
import { PacientesModule } from './modules/pacientes/pacientes.module'
import { ServiciosModule } from './modules/servicios/servicios.module'
import { DoctoresModule } from './modules/doctores/doctores.module'
import { CitasModule } from './modules/citas/citas.module'
import { AtencionesModule } from './modules/atenciones/atenciones.module'
import { CobrosModule } from './modules/cobros/cobros.module'
import { CajaModule } from './modules/caja/caja.module'
import { GastosModule } from './modules/gastos/gastos.module'
import { TiposGastoModule } from './modules/tipos-gasto/tipos-gasto.module'
import { TiposCuentaModule } from './modules/tipos-cuenta/tipos-cuenta.module'
import { DisponibilidadesModule } from './modules/disponibilidades/disponibilidades.module'
import { LogsModule } from './modules/logs/logs.module'
import { PortalModule } from './modules/portal/portal.module'
import { MailModule } from './modules/mail/mail.module'
import { ReportesModule } from './modules/reportes/reportes.module'
import { PlantillasModule } from './modules/plantillas/plantillas.module'
import { MensajesModule } from './modules/mensajes/mensajes.module'
import { NotificacionesModule } from './modules/notificaciones/notificaciones.module'

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    // Limite global generoso; /auth/login y /register tienen limites estrictos propios
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 200 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    MailModule,
    AuthModule,
    ConsultoriosModule,
    UsuariosModule,
    PacientesModule,
    ServiciosModule,
    DoctoresModule,
    CitasModule,
    AtencionesModule,
    CobrosModule,
    CajaModule,
    GastosModule,
    TiposGastoModule,
    TiposCuentaModule,
    DisponibilidadesModule,
    LogsModule,
    PortalModule,
    ReportesModule,
    PlantillasModule,
    MensajesModule,
    NotificacionesModule,
  ],
  controllers: [HealthController],
  providers: [
    // Captura en Sentry las excepciones no manejadas (debe ir antes de otros filtros)
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
