import { Module } from '@nestjs/common'
import { CitasService } from './citas.service'
import { CitasCron } from './citas.cron'
import { CitasController } from './citas.controller'

// NotificacionesService es global (NotificacionesModule @Global), igual que
// PrismaService y MailService: no hace falta importarlo aca.
@Module({
  controllers: [CitasController],
  providers: [CitasService, CitasCron],
  exports: [CitasService],
})
export class CitasModule {}
