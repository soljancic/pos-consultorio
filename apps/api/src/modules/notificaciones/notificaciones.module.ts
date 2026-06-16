import { Module } from '@nestjs/common'
import { NotificacionesService } from './notificaciones.service'
import { NotificacionesController } from './notificaciones.controller'
import { NotificacionesCron } from './notificaciones.cron'

@Module({
  controllers: [NotificacionesController],
  providers: [NotificacionesService, NotificacionesCron],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
