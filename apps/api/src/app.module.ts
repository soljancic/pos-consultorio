import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module'
import { ConsultoriosModule } from './modules/consultorios/consultorios.module'
import { UsuariosModule } from './modules/usuarios/usuarios.module'
import { PacientesModule } from './modules/pacientes/pacientes.module'
import { ServiciosModule } from './modules/servicios/servicios.module'
import { DoctoresModule } from './modules/doctores/doctores.module'
import { CitasModule } from './modules/citas/citas.module'
import { CobrosModule } from './modules/cobros/cobros.module'
import { CajaModule } from './modules/caja/caja.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    ConsultoriosModule,
    UsuariosModule,
    PacientesModule,
    ServiciosModule,
    DoctoresModule,
    CitasModule,
    CobrosModule,
    CajaModule,
  ],
})
export class AppModule {}
