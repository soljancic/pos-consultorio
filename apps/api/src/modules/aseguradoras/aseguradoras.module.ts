import { Module } from '@nestjs/common'
import { AseguradorasController } from './aseguradoras.controller'
import { AseguradorasService } from './aseguradoras.service'
import { CategoriasSeguroController } from './categorias-seguro.controller'

@Module({ controllers: [AseguradorasController, CategoriasSeguroController], providers: [AseguradorasService] })
export class AseguradorasModule {}
