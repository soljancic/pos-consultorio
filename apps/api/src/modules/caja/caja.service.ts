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

    // MVP: "Total del dia. Total por forma de pago. Nuevas deudas. Pagos de deuda"
    // Pago cuya cita es de una fecha anterior a hoy = cobro de deuda vieja
    const pagosDeudaAnterior = pagos
      .filter((p) => new Date(p.cobro.cita.fechaHora) < hoy)
      .reduce((acc, p) => acc + Number(p.monto), 0)

    // Nuevas deudas: saldo pendiente de cobros de citas de HOY ya prestadas
    const finDia = new Date(hoy.getTime() + 24 * 60 * 60 * 1000)
    const cobrosHoy = await this.prisma.cobro.findMany({
      where: {
        consultorioId,
        saldoPendiente: { gt: 0 },
        cita: {
          fechaHora: { gte: hoy, lt: finDia },
          estado: { in: ['ATENDIDA', 'CON_DEUDA'] },
          deletedAt: null,
        },
      },
      select: { saldoPendiente: true },
    })
    const nuevasDeudas = cobrosHoy.reduce((acc, c) => acc + Number(c.saldoPendiente), 0)

    return { caja, pagos, pagosDeudaAnterior, nuevasDeudas }
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
