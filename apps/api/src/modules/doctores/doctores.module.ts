import { Module } from '@nestjs/common'
import { DoctoresController } from './doctores.controller'
import { DoctoresService } from './doctores.service'

@Module({ controllers: [DoctoresController], providers: [DoctoresService] })
export class DoctoresModule {}
