import { Module } from '@nestjs/common'
import { AtencionesService } from './atenciones.service'
import { AtencionesController } from './atenciones.controller'

@Module({
  providers: [AtencionesService],
  controllers: [AtencionesController],
})
export class AtencionesModule {}
