import { Module } from '@nestjs/common'
import { AseguradorasController } from './aseguradoras.controller'
import { AseguradorasService } from './aseguradoras.service'
import { CategoriasSeguroController } from './categorias-seguro.controller'
import { TarifasCoberturaController } from './tarifas-cobertura.controller'

@Module({ controllers: [AseguradorasController, CategoriasSeguroController, TarifasCoberturaController], providers: [AseguradorasService] })
export class AseguradorasModule {}
