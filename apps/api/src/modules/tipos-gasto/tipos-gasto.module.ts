import { Module } from '@nestjs/common'
import { TiposGastoController } from './tipos-gasto.controller'
import { TiposGastoService } from './tipos-gasto.service'

@Module({ controllers: [TiposGastoController], providers: [TiposGastoService] })
export class TiposGastoModule {}
