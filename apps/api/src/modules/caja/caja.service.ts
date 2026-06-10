import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class CajaService {
  constructor(private prisma: PrismaService) {}

  async getHoy(consultorioId: string) {
    const hoy = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00Z')

    const caja = await this.prisma.cajaDiaria.findUnique({
      where: { consultorioId_fecha: { consultorioId, fecha: hoy } },
    })

    const pagos = await this.prisma.pago.findMany({
      where: {
        cobro: { consultorioId },
        createdAt: { gte: hoy },
      },
      include: {
        cobro: {
          include: {
            cita: {
              include: {
                paciente: { select: { nombre: true, apellido: true } },
                doctor: { select: { nombre: true } },
                servicio: { select: { nombre: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    return { caja, pagos }
  }

  async cerrar(consultorioId: string, usuarioId: string) {
    const hoy = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00Z')

    return this.prisma.cajaDiaria.update({
      where: { consultorioId_fecha: { consultorioId, fecha: hoy } },
      data: { cerrada: true, cierreAt: new Date(), usuarioCierreId: usuarioId },
    })
  }

  async getHistorial(consultorioId: string, desde: string, hasta: string) {
    return this.prisma.cajaDiaria.findMany({
      where: {
        consultorioId,
        fecha: { gte: new Date(desde), lte: new Date(hasta) },
      },
      orderBy: { fecha: 'desc' },
    })
  }
}
