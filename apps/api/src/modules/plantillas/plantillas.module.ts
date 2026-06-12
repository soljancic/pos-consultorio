import { Module } from '@nestjs/common'
import { PlantillasController } from './plantillas.controller'
import { PlantillasService } from './plantillas.service'

@Module({ controllers: [PlantillasController], providers: [PlantillasService] })
export class PlantillasModule {}
