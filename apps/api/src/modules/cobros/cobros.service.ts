import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common'
import { IsNumber, Min, IsInt, IsString, IsOptional } from 'class-validator'
import { PrismaService } from '../../prisma/prisma.service'
import { EstadoCobro, EstadoCita } from '@pos/types'
import { Decimal } from '@prisma/client/runtime/library'
import { diaCajaLocal } from '../caja/caja.service'

export class RegistrarPagoDto {
  @IsNumber() @Min(0.01)
  monto: number

  // Forma de pago = cuenta del catalogo (tipos de cuenta)
  @IsInt()
  tipoCuentaId: number

  @IsString() @IsOptional()
  referencia?: string
}

export class AjustarTotalDto {
  @IsNumber() @Min(0)
  nuevoTotal: number

  @IsString() @IsOptional()
  motivo?: string
}

export class AnularPagoDto {
  @IsString() @IsOptional()
  motivo?: string
}

@Injectable()
export class CobrosService {
  constructor(private prisma: PrismaService) {}

  // E2-M9: sin turno abierto no entra ni sale dinero (tampoco tras el cierre)
  private async exigirCajaAbierta(consultorioId: number) {
    const { clave: hoy } = diaCajaLocal()
    const caja = await this.prisma.cajaDiaria.findUnique({
      where: { consultorioId_fecha: { consultorioId, fecha: hoy } },
      select: { abiertaAt: true, cerrada: true },
    })
    if (!caja?.abiertaAt) {
      throw new ConflictException('La caja no esta abierta: abra el turno del dia en Caja')
    }
    if (caja.cerrada) {
      throw new ConflictException('La caja de hoy ya esta cerrada: no se pueden registrar movimientos')
    }
  }

  async findByCita(consultorioId: number, citaId: number) {
    const cobro = await this.prisma.cobro.findFirst({
      where: { citaId, consultorioId },
      include: {
        pagos: {
          orderBy: { createdAt: 'asc' },
          include: { tipoCuenta: { select: { nombre: true } } },
        },
      },
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
    await this.exigirCajaAbierta(consultorioId)

    const monto = new Decimal(dto.monto)
    if (monto.lte(0)) throw new BadRequestException('El monto debe ser mayor a cero')
    if (monto.gt(cobro.saldoPendiente)) {
      throw new BadRequestException(
        `El monto ($${monto}) supera el saldo pendiente ($${cobro.saldoPendiente})`,
      )
    }

    // Forma de pago = cuenta del catalogo; esEfectivo define si va al arqueo
    const tipoCuenta = await this.prisma.tipoCuenta.findFirst({
      where: { id: dto.tipoCuentaId, consultorioId, activo: true },
      select: { id: true, esEfectivo: true },
    })
    if (!tipoCuenta) throw new BadRequestException('Forma de pago no valida')

    const ESTADOS_PRE_ATENCION: EstadoCita[] = [
      EstadoCita.PENDIENTE, EstadoCita.CONFIRMADA, EstadoCita.LLEGO, EstadoCita.EN_ATENCION,
    ]
    const ESTADOS_POST_ATENCION: EstadoCita[] = [EstadoCita.ATENDIDA, EstadoCita.CON_DEUDA]
    const estadoCita = cobro.cita.estado as EstadoCita
    if (![...ESTADOS_PRE_ATENCION, ...ESTADOS_POST_ATENCION].includes(estadoCita)) {
      throw new BadRequestException('No se puede cobrar una cita en este estado')
    }
    const tocaCita = ESTADOS_POST_ATENCION.includes(estadoCita)

    const nuevoSaldo = cobro.saldoPendiente.minus(monto)
    const cobrado = nuevoSaldo.lte(0)
    const nuevoEstadoCobro = cobrado ? EstadoCobro.COMPLETO : EstadoCobro.PARCIAL
    const nuevoEstadoCita = cobrado ? EstadoCita.COBRADO : EstadoCita.CON_DEUDA

    await this.prisma.$transaction(async (tx) => {
      // Registrar pago
      await tx.pago.create({
        data: {
          cobroId,
          tipoCuentaId: tipoCuenta.id,
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

      // Prepago (pre-atencion): no se toca el ciclo de vida de la cita ni la
      // deuda (la cita futura no es deuda). Post-atencion: comportamiento de
      // siempre (la cita pasa a COBRADO/CON_DEUDA y baja la deuda del paciente).
      if (tocaCita) {
        await tx.cita.update({
          where: { id: cobro.citaId },
          data: { estado: nuevoEstadoCita },
        })
        await tx.paciente.update({
          where: { id: cobro.cita.pacienteId },
          data: { deudaTotal: { decrement: monto } },
        })
      }

      // Actualizar caja diaria (dia LOCAL del negocio, no fecha UTC). Solo el
      // efectivo participa del arqueo; totalGeneral suma todo.
      const { clave: hoy } = diaCajaLocal()
      await tx.cajaDiaria.upsert({
        where: { consultorioId_fecha: { consultorioId, fecha: hoy } },
        create: {
          consultorioId,
          fecha: hoy,
          usuarioAperturaId: usuarioId,
          ...(tipoCuenta.esEfectivo && { totalEfectivo: monto }),
          totalGeneral: monto,
        },
        update: {
          ...(tipoCuenta.esEfectivo && { totalEfectivo: { increment: monto } }),
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
          payloadDespues: { saldoPendiente: nuevoSaldo.toString(), monto: monto.toString(), tipoCuentaId: tipoCuenta.id },
        },
      })
    })

    return this.findByCita(consultorioId, cobro.citaId)
  }

  // Anulacion con asiento de reversa (E2-M1): el pago original nunca se borra
  // ni se edita; se crea un pago espejo negativo y todo queda auditado.
  async anularPago(
    consultorioId: number,
    pagoId: number,
    dto: AnularPagoDto,
    usuarioId: number,
  ) {
    const pago = await this.prisma.pago.findFirst({
      where: { id: pagoId, cobro: { consultorioId } },
      include: {
        tipoCuenta: { select: { esEfectivo: true } },
        cobro: {
          include: { cita: { select: { id: true, pacienteId: true, estado: true } } },
        },
      },
    })
    if (!pago) throw new NotFoundException('Pago no encontrado')
    if (pago.monto.isNegative()) {
      throw new BadRequestException('No se puede anular una reversa')
    }
    if (pago.anuladoAt) {
      throw new BadRequestException('El pago ya fue anulado')
    }
    // La reversa impacta la caja de HOY: requiere turno abierto
    await this.exigirCajaAbierta(consultorioId)

    const cobro = pago.cobro
    const nuevoSaldo = cobro.saldoPendiente.plus(pago.monto)
    const pagado = cobro.total.minus(nuevoSaldo)
    const nuevoEstadoCobro = pagado.gt(0) ? EstadoCobro.PARCIAL : EstadoCobro.PENDIENTE
    // Una cita cobrada vuelve a tener deuda; los demas estados no cambian
    const revierteCita = cobro.cita.estado === EstadoCita.COBRADO

    const { clave: hoy } = diaCajaLocal()

    await this.prisma.$transaction(async (tx) => {
      const reversa = await tx.pago.create({
        data: {
          cobroId: cobro.id,
          tipoCuentaId: pago.tipoCuentaId,
          monto: pago.monto.negated(),
          referencia: pago.referencia,
          createdById: usuarioId,
          reversaDeId: pago.id,
        },
      })

      await tx.pago.update({
        where: { id: pago.id },
        data: {
          anuladoAt: new Date(),
          anuladoPorId: usuarioId,
          motivoAnulacion: dto.motivo,
        },
      })

      await tx.cobro.update({
        where: { id: cobro.id },
        data: { saldoPendiente: nuevoSaldo, estado: nuevoEstadoCobro },
      })

      if (revierteCita) {
        await tx.cita.update({
          where: { id: cobro.cita.id },
          data: { estado: EstadoCita.CON_DEUDA },
        })
      }

      // Espejo del decrement de registrarPago
      await tx.paciente.update({
        where: { id: cobro.cita.pacienteId },
        data: { deudaTotal: { increment: pago.monto } },
      })

      // La reversa descuenta de la caja de HOY (la historica no se reescribe).
      // Solo el efectivo afecta el arqueo.
      await tx.cajaDiaria.upsert({
        where: { consultorioId_fecha: { consultorioId, fecha: hoy } },
        create: {
          consultorioId,
          fecha: hoy,
          usuarioAperturaId: usuarioId,
          ...(pago.tipoCuenta.esEfectivo && { totalEfectivo: pago.monto.negated() }),
          totalGeneral: pago.monto.negated(),
        },
        update: {
          ...(pago.tipoCuenta.esEfectivo && { totalEfectivo: { decrement: pago.monto } }),
          totalGeneral: { decrement: pago.monto },
        },
      })

      await tx.log.create({
        data: {
          consultorioId,
          usuarioId,
          entidad: 'Pago',
          entidadId: pago.id,
          accion: 'PAYMENT',
          payloadAntes: {
            monto: pago.monto.toString(),
            tipoCuentaId: pago.tipoCuentaId,
            saldoPendiente: cobro.saldoPendiente.toString(),
          },
          payloadDespues: {
            anulado: true,
            motivo: dto.motivo ?? null,
            reversaId: reversa.id,
            saldoPendiente: nuevoSaldo.toString(),
          },
        },
      })
    })

    // La caja del dia del pago original puede estar cerrada: alerta, no bloquea
    const claveDiaOriginal = new Date(
      `${pago.createdAt.getFullYear()}-${String(pago.createdAt.getMonth() + 1).padStart(2, '0')}-${String(pago.createdAt.getDate()).padStart(2, '0')}T00:00:00Z`,
    )
    const cajaOriginal = await this.prisma.cajaDiaria.findUnique({
      where: { consultorioId_fecha: { consultorioId, fecha: claveDiaOriginal } },
      select: { cerrada: true },
    })

    const cobroFresco = await this.findByCita(consultorioId, cobro.cita.id)
    return {
      ...cobroFresco,
      advertencia: cajaOriginal?.cerrada
        ? 'La caja del dia del pago original ya estaba cerrada: la reversa impacta la caja de hoy'
        : undefined,
    }
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
            paciente: { select: { id: true, nombre: true, apellido: true, telefono: true, pais: true } },
            servicio: { select: { nombre: true } },
          },
        },
      },
    })

    type Deudor = {
      pacienteId: number
      nombre: string
      apellido: string
      telefono: string | null
      pais: string
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
          telefono: pac.telefono,
          pais: pac.pais,
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
