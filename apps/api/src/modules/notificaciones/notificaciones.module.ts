import { Global, Module } from '@nestjs/common'
import { NotificacionesService } from './notificaciones.service'
import { NotificacionesController } from './notificaciones.controller'
import { NotificacionesCron } from './notificaciones.cron'

// Global (como MailModule): CitasService emite notificaciones y se provee tanto
// en CitasModule como en PortalModule; exponer el service globalmente evita el
// error de DI al instanciarlo en cualquiera de esos contextos.
@Global()
@Module({
  controllers: [NotificacionesController],
  providers: [NotificacionesService, NotificacionesCron],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
