import { Module } from '@nestjs/common'
import { MensajesController } from './mensajes.controller'
import { MensajesService } from './mensajes.service'
import { MensajesCron } from './mensajes.cron'

@Module({
  controllers: [MensajesController],
  providers: [MensajesService, MensajesCron],
})
export class MensajesModule {}
