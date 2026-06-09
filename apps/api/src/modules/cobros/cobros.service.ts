import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { EstadoCobro, EstadoCita, FormaPago } from '@pos/types'
import { Decimal } from '@prisma/client/runtime/library'

export class RegistrarPagoDto {
  monto: number
  formaPago: FormaPago
  referencia?: string
}

@Injectable()
export class CobrosService {
  constructor(private prisma: PrismaService) {}

  async findByCita(consultorioId: string, citaId: string) {
    const cobro = await this.prisma.cobro.findFirst({
      where: { citaId, consultorioId },
      include: { pagos: { orderBy: { createdAt: 'asc' } } },
    })
    if (!cobro) throw new NotFoundException('Cobro no encontrado')
    return cobro
  }

  async registrarPago(
    consultorioId: string,
    cobroId: string,
    dto: RegistrarPagoDto,
    usuarioId: string,
  ) {
    const cobro = await this.prisma.cobro.findFirst({
      where: { id: cobroId, consultorioId },
      include: { cita: true },
    })
    if (!cobro) throw new NotFoundException('Cobro no encontrado')
    if (cobro.estado === EstadoCobro.COMPLETO) {
      throw new BadRequestException('Este cobro ya esta completamente pagado')
    }

    const monto = new Decimal(dto.monto)
    if (monto.lte(0)) throw new BadRequestException('El monto debe ser mayor a cero')
    if (monto.gt(cobro.saldoPendiente)) {
      throw new BadRequestException(
        `El monto ($${monto}) supera el saldo pendiente ($${cobro.saldoPendiente})`,
      )
    }

    const nuevoSaldo = cobro.saldoPendiente.minus(monto)
    const cobrado = nuevoSaldo.lte(0)
    const nuevoEstadoCobro = cobrado ? EstadoCobro.COMPLETO : EstadoCobro.PARCIAL
    const nuevoEstadoCita = cobrado ? EstadoCita.COBRADO : EstadoCita.CON_DEUDA

    await this.prisma.$transaction(async (tx) => {
      // Registrar pago
      await tx.pago.create({
        data: {
          cobroId,
          formaPago: dto.formaPago,
          monto,
          referencia: dto.referencia,
          createdById: usuarioId,
        },
      })

      // Actualizar saldo del cobro
      await tx.cobro.update({
        where: { id: cobroId },
        data: { saldoPendiente: nuevoSaldo, estado: nuevoEstadoCobro },
      })

      // Actualizar estado de la cita
      await tx.cita.update({
        where: { id: cobro.citaId },
        data: { estado: nuevoEstadoCita },
      })

      // Actualizar deuda total del paciente
      await tx.paciente.update({
        where: { id: cobro.cita.pacienteId },
        data: { deudaTotal: { decrement: monto } },
      })

      // Actualizar caja diaria
      const hoy = new Date()
      hoy.setHours(0, 0, 0, 0)
      const campoMonto = {
        [FormaPago.EFECTIVO]: 'totalEfectivo',
        [FormaPago.QR]: 'totalQr',
        [FormaPago.TRANSFERENCIA]: 'totalTransferencia',
        [FormaPago.TARJETA]: 'totalTarjeta',
      }[dto.formaPago]

      await tx.cajaDiaria.upsert({
        where: { consultorioId_fecha: { consultorioId, fecha: hoy } },
        create: {
          consultorioId,
          fecha: hoy,
          usuarioAperturaId: usuarioId,
          [campoMonto]: monto,
          totalGeneral: monto,
        },
        update: {
          [campoMonto]: { increment: monto },
          totalGeneral: { increment: monto },
        },
      })

      // Log financiero
      await tx.log.create({
        data: {
          consultorioId,
          usuarioId,
          entidad: 'Cobro',
          entidadId: cobroId,
          accion: 'PAYMENT',
          payloadAntes: { saldoPendiente: cobro.saldoPendiente.toString() },
          payloadDespues: { saldoPendiente: nuevoSaldo.toString(), monto: monto.toString(), formaPago: dto.formaPago },
        },
      })
    })

    return this.findByCita(consultorioId, cobro.citaId)
  }

  async getDeudores(consultorioId: string) {
    return this.prisma.cobro.findMany({
      where: { consultorioId, estado: { in: [EstadoCobro.PENDIENTE, EstadoCobro.PARCIAL] } },
      include: {
        cita: {
          include: {
            paciente: { select: { id: true, nombre: true, apellido: true, whatsapp: true } },
            servicio: { select: { nombre: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })
  }
}
