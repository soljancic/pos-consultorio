import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { CitasService } from './citas.service'

// E3: barrido automatico de no-shows. Corre cada 30 minutos sobre todos los
// tenants; el mismo codigo se dispara a demanda con POST /citas/no-shows/procesar.
@Injectable()
export class CitasCron {
  private readonly logger = new Logger(CitasCron.name)

  constructor(private citas: CitasService) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async barrerNoShows() {
    if (process.env.NO_SHOW_CRON === 'off') return
    const { procesadas, revisadas } = await this.citas.procesarNoShows()
    if (revisadas > 0) {
      this.logger.log(`No-shows: ${procesadas}/${revisadas} citas vencidas marcadas`)
    }
  }
}
