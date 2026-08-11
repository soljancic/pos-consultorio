import { Module } from '@nestjs/common'
import { AtencionesService } from './atenciones.service'
import { RecetasService } from './recetas.service'
import { HojasService } from './hojas.service'
import { TranscripcionService } from './transcripcion.service'
import { AtencionesController } from './atenciones.controller'

@Module({
  providers: [AtencionesService, RecetasService, HojasService, TranscripcionService],
  controllers: [AtencionesController],
})
export class AtencionesModule {}
