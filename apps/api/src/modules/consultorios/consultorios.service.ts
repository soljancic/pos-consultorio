import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class ConsultoriosService {
  constructor(private prisma: PrismaService) {}

  async findOne(id: string) {
    return this.prisma.consultorio.findUnique({
      where: { id },
      select: { id: true, nombre: true, logoUrl: true, moneda: true, timezone: true, plan: true },
    })
  }

  async update(id: string, data: { nombre?: string; logoUrl?: string; moneda?: string; timezone?: string }) {
    return this.prisma.consultorio.update({ where: { id }, data })
  }
}
