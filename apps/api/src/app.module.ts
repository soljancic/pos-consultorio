import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Limite global generoso; /auth/login y /register tienen limites estrictos propios
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 200 }]),
    PrismaModule,
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
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
