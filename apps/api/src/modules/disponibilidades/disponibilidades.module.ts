import { Module } from '@nestjs/common'
import { DisponibilidadesController } from './disponibilidades.controller'
import { DisponibilidadesService } from './disponibilidades.service'

@Module({
  controllers: [DisponibilidadesController],
  providers: [DisponibilidadesService],
})
export class DisponibilidadesModule {}
