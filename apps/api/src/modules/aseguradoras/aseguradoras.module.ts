import { Module } from '@nestjs/common'
import { AseguradorasController } from './aseguradoras.controller'
import { AseguradorasService } from './aseguradoras.service'

@Module({ controllers: [AseguradorasController], providers: [AseguradorasService] })
export class AseguradorasModule {}
