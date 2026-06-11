import { Module } from '@nestjs/common'
import { PortalController } from './portal.controller'
import { PortalService } from './portal.service'
import { CitasService } from '../citas/citas.service'
import { DoctoresService } from '../doctores/doctores.service'

@Module({
  controllers: [PortalController],
  // CitasService/DoctoresService solo dependen de PrismaService (global)
  providers: [PortalService, CitasService, DoctoresService],
})
export class PortalModule {}
