import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

// El dia de caja es el dia LOCAL del negocio (server en el timezone del
// consultorio para el MVP). Con fecha UTC, despues de las 20:00 GMT-4 los
// cobros caian en la caja del dia siguiente.
export function diaCajaLocal(): { clave: Date; inicioLocal: Date; finLocal: Date } {
  const ahora = new Date()
  const y = ahora.getFullYear()
  const m = String(ahora.getMonth() + 1).padStart(2, '0')
  const d = String(ahora.getDate()).padStart(2, '0')
  const diaStr = `${y}-${m}-${d}`
  return {
    // Clave para la columna @db.Date (se persiste como dia calendario)
    clave: new Date(`${diaStr}T00:00:00Z`),
    // Rango de instantes reales del dia local (para filtrar citas/pagos)
    inicioLocal: new Date(`${diaStr}T00:00:00`),
    finLocal: new Date(new Date(`${diaStr}T00:00:00`).getTime() + 24 * 60 * 60 * 1000),
  }
}

@Injectable()
export class CajaService {
  constructor(private prisma: PrismaService) {}

  async getHoy(consultorioId: string) {
    const { clave: hoy, inicioLocal, finLocal } = diaCajaLocal()

    const caja = await this.prisma.cajaDiaria.findUnique({
      where: { consultorioId_fecha: { consultorioId, fecha: hoy } },
    })

    const pagos = await this.prisma.pago.findMany({
      where: {
        cobro: { consultorioId },
        createdAt: { gte: inicioLocal, lt: finLocal },
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
    // Pago cuya cita es de un dia local anterior a hoy = cobro de deuda vieja
    const pagosDeudaAnterior = pagos
      .filter((p) => new Date(p.cobro.cita.fechaHora) < inicioLocal)
      .reduce((acc, p) => acc + Number(p.monto), 0)

    // Nuevas deudas: saldo pendiente de cobros de citas de HOY (dia local) ya prestadas
    const cobrosHoy = await this.prisma.cobro.findMany({
      where: {
        consultorioId,
        saldoPendiente: { gt: 0 },
        cita: {
          fechaHora: { gte: inicioLocal, lt: finLocal },
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
    const { clave: hoy } = diaCajaLocal()

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
