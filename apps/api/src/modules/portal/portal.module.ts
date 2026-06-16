import { Module } from '@nestjs/common'
import { PortalController } from './portal.controller'
import { PortalService } from './portal.service'
import { CitasService } from '../citas/citas.service'
import { DoctoresService } from '../doctores/doctores.service'

@Module({
  controllers: [PortalController],
  // CitasService/DoctoresService dependen solo de servicios globales
  // (PrismaService, MailService y NotificacionesService), por eso se pueden
  // proveer aca sin imports extra.
  providers: [PortalService, CitasService, DoctoresService],
})
export class PortalModule {}
