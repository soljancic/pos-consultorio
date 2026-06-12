import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PrismaService } from '../../prisma/prisma.service'
import { MensajesService } from './mensajes.service'

// Encola la tanda diaria de cada consultorio activo a las 07:30 (hora del
// server = TZ del consultorio en el MVP), antes de que abra la jornada.
@Injectable()
export class MensajesCron {
  private readonly logger = new Logger(MensajesCron.name)

  constructor(
    private prisma: PrismaService,
    private mensajes: MensajesService,
  ) {}

  @Cron('30 7 * * *')
  async generarColaDiaria() {
    if (process.env.MENSAJES_CRON === 'off') return
    const consultorios = await this.prisma.consultorio.findMany({
      where: { activo: true },
      select: { id: true },
    })
    for (const c of consultorios) {
      const r = await this.mensajes.generar(c.id)
      if (r.recordatorios + r.avisosDeuda > 0) {
        this.logger.log(`Consultorio ${c.id}: ${r.recordatorios} recordatorios, ${r.avisosDeuda} avisos de deuda`)
      }
    }
  }
}
