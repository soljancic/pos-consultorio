import { Injectable } from '@nestjs/common'
import { AccionLog, Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

const PAGE_SIZE = 50

// E2-M3: lectura paginada de la tabla logs (que ya alimentan todos los
// modulos). Solo lectura: los logs jamas se editan ni se borran.
@Injectable()
export class LogsService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    consultorioId: number,
    filtros: { entidad?: string; accion?: AccionLog; desde?: string; hasta?: string; page?: number },
  ) {
    const page = Math.max(1, filtros.page ?? 1)
    const where: Prisma.LogWhereInput = {
      consultorioId,
      ...(filtros.entidad && { entidad: filtros.entidad }),
      ...(filtros.accion && { accion: filtros.accion }),
      ...((filtros.desde || filtros.hasta) && {
        createdAt: {
          ...(filtros.desde && { gte: new Date(`${filtros.desde.slice(0, 10)}T00:00:00`) }),
          ...(filtros.hasta && {
            lt: new Date(new Date(`${filtros.hasta.slice(0, 10)}T00:00:00`).getTime() + 86_400_000),
          }),
        },
      }),
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.log.count({ where }),
      this.prisma.log.findMany({
        where,
        include: { usuario: { select: { nombre: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ])

    return { items, total, page, pageSize: PAGE_SIZE }
  }
}
