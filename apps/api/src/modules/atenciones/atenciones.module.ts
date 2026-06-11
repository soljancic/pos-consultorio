import { Module } from '@nestjs/common'
import { AtencionesService } from './atenciones.service'
import { RecetasService } from './recetas.service'
import { AtencionesController } from './atenciones.controller'

@Module({
  providers: [AtencionesService, RecetasService],
  controllers: [AtencionesController],
})
export class AtencionesModule {}
