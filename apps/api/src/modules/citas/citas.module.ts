import { Module } from '@nestjs/common'
import { CitasService } from './citas.service'
import { CitasCron } from './citas.cron'
import { CitasController } from './citas.controller'
import { NotificacionesModule } from '../notificaciones/notificaciones.module'

@Module({
  imports: [NotificacionesModule],
  controllers: [CitasController],
  providers: [CitasService, CitasCron],
  exports: [CitasService],
})
export class CitasModule {}
