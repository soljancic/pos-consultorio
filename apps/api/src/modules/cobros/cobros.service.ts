import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { IsNumber, Min, IsEnum, IsString, IsOptional } from 'class-validator'
import { PrismaService } from '../../prisma/prisma.service'
import { EstadoCobro, EstadoCita, FormaPago } from '@pos/types'
import { Decimal } from '@prisma/client/runtime/library'
import { diaCajaLocal } from '../caja/caja.service'

export class RegistrarPagoDto {
  @IsNumber() @Min(0.01)
  monto: number

  @IsEnum(FormaPago)
  formaPago: FormaPago

  @IsString() @IsOptional()
  referencia?: string
}

export class AjustarTotalDto {
  @IsNumber() @Min(0)
  nuevoTotal: number

  @IsString() @IsOptional()
  motivo?: string
}

@Injectable()
export class CobrosService {
  constructor(private prisma: PrismaService) {}

  async findByCita(consultorioId: number, citaId: number) {
    const cobro = await this.prisma.cobro.findFirst({
      where: { citaId, consultorioId },
      include: { pagos: { orderBy: { createdAt: 'asc' } } },
    })
    if (!cobro) throw new NotFoundException('Cobro no encontrado')
    return cobro
  }

  async registrarPago(
    consultorioId: number,
    cobroId: number,
    dto: RegistrarPagoDto,
    usuarioId: number,
  ) {
    const cobro = await this.prisma.cobro.findFirst({
      where: { id: cobroId, consultorioId },
      include: { cita: true },
    })
    if (!cobro) throw new NotFoundException('Cobro no encontrado')
    if (cobro.estado === EstadoCobro.COMPLETO) {
      throw new BadRequestException('Este cobro ya esta completamente pagado')
    }
    if (cobro.estado === EstadoCobro.ANULADO) {
      throw new BadRequestException('El cobro esta anulado (cita cancelada o no asistida)')
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

      // Actualizar caja diaria (dia LOCAL del negocio, no fecha UTC)
      const { clave: hoy } = diaCajaLocal()
      const campoMonto = {
        [FormaPago.EFECTIVO]: 'totalEfectivo',
        [FormaPago.QR]: 'totalQr',
        [FormaPago.TARJETA]: 'totalTarjeta',
        [FormaPago.VALES]: 'totalVales',
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

  // Deuda real = saldo de cobros cuya cita fue prestada (ATENDIDA/CON_DEUDA).
  // Las citas futuras crean cobros PENDIENTE que NO son deuda.
  private readonly whereDeudaReal = (consultorioId: number) => ({
    consultorioId,
    saldoPendiente: { gt: new Decimal(0) },
    cita: {
      estado: { in: [EstadoCita.ATENDIDA, EstadoCita.CON_DEUDA] },
      deletedAt: null,
    },
  })

  // Ajuste de precio al cobrar (MVP: "Descuento"). El total nunca puede
  // quedar por debajo de lo ya pagado; el cambio queda auditado en logs.
  async ajustarTotal(
    consultorioId: number,
    cobroId: number,
    dto: AjustarTotalDto,
    usuarioId: number,
  ) {
    const cobro = await this.prisma.cobro.findFirst({
      where: { id: cobroId, consultorioId },
      include: { cita: { select: { id: true, pacienteId: true, estado: true } } },
    })
    if (!cobro) throw new NotFoundException('Cobro no encontrado')
    // Un cobro saldado no se reabre por precio: dejaria deuda con la cita
    // en COBRADO. La correccion de pagos llega con las reversas (Etapa 2).
    if (cobro.estado === EstadoCobro.COMPLETO) {
      throw new BadRequestException('El cobro ya esta saldado; no se puede ajustar el precio')
    }

    const pagado = cobro.total.minus(cobro.saldoPendiente)
    const nuevoTotal = new Decimal(dto.nuevoTotal)
    if (nuevoTotal.lt(pagado)) {
      throw new BadRequestException(
        `El nuevo total ($${nuevoTotal}) no puede ser menor a lo ya pagado ($${pagado})`,
      )
    }

    const nuevoSaldo = nuevoTotal.minus(pagado)
    const quedaSaldado = nuevoSaldo.lte(0)
    const nuevoEstadoCobro = quedaSaldado
      ? EstadoCobro.COMPLETO
      : pagado.gt(0)
        ? EstadoCobro.PARCIAL
        : EstadoCobro.PENDIENTE

    await this.prisma.$transaction(async (tx) => {
      await tx.cobro.update({
        where: { id: cobroId },
        data: { total: nuevoTotal, saldoPendiente: nuevoSaldo, estado: nuevoEstadoCobro },
      })

      // La deuda del paciente sigue al saldo solo si el servicio ya se presto
      const citaConDeuda =
        cobro.cita.estado === EstadoCita.ATENDIDA ||
        cobro.cita.estado === EstadoCita.CON_DEUDA
      if (citaConDeuda) {
        const delta = nuevoSaldo.minus(cobro.saldoPendiente)
        if (!delta.isZero()) {
          await tx.paciente.update({
            where: { id: cobro.cita.pacienteId },
            data: { deudaTotal: { increment: delta } },
          })
        }
        // Si el ajuste deja el cobro saldado, la cita queda cobrada
        if (quedaSaldado) {
          await tx.cita.update({
            where: { id: cobro.cita.id },
            data: { estado: EstadoCita.COBRADO },
          })
        }
      }

      await tx.log.create({
        data: {
          consultorioId,
          usuarioId,
          entidad: 'Cobro',
          entidadId: cobroId,
          accion: 'UPDATE',
          payloadAntes: {
            total: cobro.total.toString(),
            saldoPendiente: cobro.saldoPendiente.toString(),
          },
          payloadDespues: {
            total: nuevoTotal.toString(),
            saldoPendiente: nuevoSaldo.toString(),
            motivo: dto.motivo ?? 'ajuste de precio',
          },
        },
      })
    })

    return this.findByCita(consultorioId, cobro.cita.id)
  }

  async getDeudores(consultorioId: number) {
    const cobros = await this.prisma.cobro.findMany({
      where: this.whereDeudaReal(consultorioId),
      include: {
        pagos: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
        cita: {
          include: {
            paciente: { select: { id: true, nombre: true, apellido: true, whatsapp: true } },
            servicio: { select: { nombre: true } },
          },
        },
      },
    })

    type Deudor = {
      pacienteId: number
      nombre: string
      apellido: string
      whatsapp: string | null
      deudaTotal: number
      ultimaCitaFecha: Date
      ultimoServicio: string
      ultimoPago: Date | null
      cobros: typeof cobros
    }
    const porPaciente = new Map<number, Deudor>()

    for (const cobro of cobros) {
      const pac = cobro.cita.paciente
      const fechaCita = new Date(cobro.cita.fechaHora)
      const fechaPago = cobro.pagos[0]?.createdAt ?? null
      const existing = porPaciente.get(pac.id)

      if (existing) {
        existing.deudaTotal += Number(cobro.saldoPendiente)
        if (fechaCita > existing.ultimaCitaFecha) {
          existing.ultimaCitaFecha = fechaCita
          existing.ultimoServicio = cobro.cita.servicio.nombre
        }
        if (fechaPago && (!existing.ultimoPago || fechaPago > existing.ultimoPago)) {
          existing.ultimoPago = fechaPago
        }
        existing.cobros.push(cobro)
      } else {
        porPaciente.set(pac.id, {
          pacienteId: pac.id,
          nombre: pac.nombre,
          apellido: pac.apellido,
          whatsapp: pac.whatsapp,
          deudaTotal: Number(cobro.saldoPendiente),
          ultimaCitaFecha: fechaCita,
          ultimoServicio: cobro.cita.servicio.nombre,
          ultimoPago: fechaPago,
          cobros: [cobro],
        })
      }
    }

    return Array.from(porPaciente.values()).sort((a, b) => b.deudaTotal - a.deudaTotal)
  }

  async getDeudoresResumen(consultorioId: number) {
    const [suma, cobros] = await Promise.all([
      this.prisma.cobro.aggregate({
        where: this.whereDeudaReal(consultorioId),
        _sum: { saldoPendiente: true },
      }),
      this.prisma.cobro.findMany({
        where: this.whereDeudaReal(consultorioId),
        select: { cita: { select: { pacienteId: true } } },
      }),
    ])

    const pacienteIds = new Set(cobros.map((c) => c.cita.pacienteId))

    return {
      totalDeuda: Number(suma._sum.saldoPendiente ?? 0),
      cantidadPacientes: pacienteIds.size,
    }
  }
}
