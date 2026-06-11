import { Module } from '@nestjs/common'
import { AuthModule } from '../../auth/auth.module'
import { UsuariosController } from './usuarios.controller'
import { UsuariosService } from './usuarios.service'

// AuthModule provee crearTokenPassword para la invitacion por email (E2-M10)
@Module({
  imports: [AuthModule],
  controllers: [UsuariosController],
  providers: [UsuariosService],
})
export class UsuariosModule {}
