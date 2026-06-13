import { Module } from '@nestjs/common'
import { TiposCuentaController } from './tipos-cuenta.controller'
import { TiposCuentaService } from './tipos-cuenta.service'

@Module({ controllers: [TiposCuentaController], providers: [TiposCuentaService] })
export class TiposCuentaModule {}
