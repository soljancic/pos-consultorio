import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { NotificacionesService } from './notificaciones.service'

// Purga diaria de notificaciones leidas > 7 dias (borrado real). Apagable con
// NOTIF_PURGE_CRON=off.
@Injectable()
export class NotificacionesCron {
  private readonly logger = new Logger(NotificacionesCron.name)

  constructor(private notificaciones: NotificacionesService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgar() {
    if (process.env.NOTIF_PURGE_CRON === 'off') return
    const borradas = await this.notificaciones.purgarViejas()
    if (borradas > 0) this.logger.log(`Notificaciones purgadas: ${borradas}`)
  }
}
