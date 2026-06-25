import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common'
import { IsNumber, Min, IsInt, IsString, IsOptional, IsArray, ValidateNested, ArrayMaxSize } from 'class-validator'
import { Type } from 'class-transformer'
import { PrismaService } from '../../prisma/prisma.service'
import { EstadoCobro, EstadoCita } from '@pos/types'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { diaCajaLocal } from '../caja/caja.service'
import { descontarStockDeCobro } from './stock.helper'

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

export class DevolverPrepagoDto {
  @IsString() @IsOptional()
  motivo?: string
}

export class LineaProductoDto {
  @IsInt()
  productoId: number

  @IsInt() @Min(1)
  cantidad: number
}

export class SetLineasProductoDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => LineaProductoDto) @ArrayMaxSize(100)
  lineas: LineaProductoDto[]
}

export class PagoVentaDto {
  @IsInt()
  tipoCuentaId: number

  @IsNumber() @Min(0.01)
  monto: number

  @IsString() @IsOptional()
  referencia?: string
}

export class CrearVentaDirectaDto {
  @IsInt() @IsOptional()
  pacienteId?: number

  @IsArray() @ValidateNested({ each: true }) @Type(() => LineaProductoDto) @ArrayMaxSize(100)
  lineas: LineaProductoDto[]

  @IsArray() @ValidateNested({ each: true }) @Type(() => PagoVentaDto) @IsOptional() @ArrayMaxSize(20)
  pagos?: PagoVentaDto[]
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
        detalles: { orderBy: { id: 'asc' } },
      },
    })
    if (!cobro) throw new NotFoundException('Cobro no encontrado')
    return cobro
  }

  async findOne(consultorioId: number, cobroId: number) {
    const cobro = await this.prisma.cobro.findFirst({
      where: { id: cobroId, consultorioId },
      include: {
        pagos: { orderBy: { createdAt: 'asc' }, include: { tipoCuenta: { select: { nombre: true } } } },
        detalles: { orderBy: { id: 'asc' } },
      },
    })
    if (!cobro) throw new NotFoundException('Cobro no encontrado')
    return cobro
  }

  // Reemplaza las lineas de PRODUCTO de un cobro (las de servicio no se tocan)
  // y recomputa total/saldo/deuda. Solo se permite mientras la venta NO esta
  // confirmada: cita en ATENDIDA (aun no salio a COBRADO/CON_DEUDA). NO descuenta
  // stock (eso pasa al confirmar). Devuelve el cobro fresco + advertencias de
  // stock bajo (informativas; no bloquean).
  async setProductos(
    consultorioId: number,
    cobroId: number,
    dto: SetLineasProductoDto,
    usuarioId: number,
  ) {
    const cobro = await this.prisma.cobro.findFirst({
      where: { id: cobroId, consultorioId },
      include: { cita: { select: { id: true, estado: true, pacienteId: true, servicioId: true, servicio: { select: { nombre: true } } } } },
    })
    if (!cobro) throw new NotFoundException('Cobro no encontrado')
    if (cobro.estado === EstadoCobro.ANULADO) {
      throw new BadRequestException('El cobro esta anulado')
    }
    // Solo cita en ATENDIDA admite edicion de productos (antes de confirmar).
    // Venta directa edita sus lineas al crearse (no por aca).
    if (!cobro.citaId || cobro.cita?.estado !== EstadoCita.ATENDIDA) {
      throw new BadRequestException('Solo se pueden editar productos antes de confirmar el cobro (cita en atencion finalizada)')
    }

    // Cargar productos vendibles del consultorio para snapshot + validacion
    const ids = [...new Set(dto.lineas.map((l) => l.productoId))]
    const productos = await this.prisma.producto.findMany({
      where: { id: { in: ids }, consultorioId, deletedAt: null, activo: true, habilitadoVenta: true },
    })
    const porId = new Map(productos.map((p) => [p.id, p]))
    for (const l of dto.lineas) {
      if (!porId.has(l.productoId)) {
        throw new BadRequestException(`Producto ${l.productoId} no existe o no esta habilitado para la venta`)
      }
    }

    const advertencias: string[] = []
    const pagado = cobro.total.minus(cobro.saldoPendiente)

    const fresco = await this.prisma.$transaction(async (tx) => {
      // Auto-heal de cobros viejos (creados antes de modelar el servicio como
      // linea): si no hay linea de servicio, crearla con el monto que falta
      // (bruto actual - productos actuales) ANTES de tocar las lineas, asi el
      // servicio no se pierde al recomputar SUM(detalles).
      const yaServicio = await tx.detalleCobro.findFirst({
        where: { cobroId, consultorioId, servicioId: { not: null } }, select: { id: true },
      })
      if (!yaServicio && cobro.cita?.servicioId) {
        const prodPrev = await tx.detalleCobro.aggregate({
          where: { cobroId, consultorioId, productoId: { not: null } }, _sum: { subtotal: true },
        })
        const servicioMonto = cobro.total.plus(cobro.descuento).minus(prodPrev._sum.subtotal ?? new Decimal(0))
        if (servicioMonto.gt(0)) {
          await tx.detalleCobro.create({
            data: {
              consultorioId, cobroId,
              servicioId: cobro.cita.servicioId,
              descripcion: cobro.cita.servicio?.nombre ?? 'Servicio',
              cantidad: 1, precioVenta: servicioMonto, precioCosto: 0, subtotal: servicioMonto,
            },
          })
        }
      }

      // Borrar lineas de producto previas (las de servicio quedan)
      await tx.detalleCobro.deleteMany({ where: { cobroId, consultorioId, productoId: { not: null } } })

      // Insertar las nuevas lineas de producto (snapshot del producto)
      for (const l of dto.lineas) {
        const p = porId.get(l.productoId)!
        const subtotal = p.precioVenta.mul(l.cantidad)
        await tx.detalleCobro.create({
          data: {
            consultorioId, cobroId,
            productoId: p.id,
            descripcion: p.nombre,
            cantidad: l.cantidad,
            precioVenta: p.precioVenta,
            precioCosto: p.precioCosto,
            subtotal,
          },
        })
        if (p.controlaStock && l.cantidad > p.stockActual) {
          advertencias.push(`Stock bajo en "${p.nombre}" (disponible ${p.stockActual})`)
        }
      }

      // Recomputar bruto = SUM(detalles) (incluye la linea de servicio); el total
      // conserva el descuento ya aplicado: total = bruto - descuento. Si se
      // quitaron productos y el descuento supera al bruto, se recorta para no dar
      // total negativo.
      const agg = await tx.detalleCobro.aggregate({ where: { cobroId, consultorioId }, _sum: { subtotal: true } })
      const bruto = agg._sum.subtotal ?? new Decimal(0)
      const descuento = cobro.descuento.gt(bruto) ? bruto : cobro.descuento
      const nuevoTotal = bruto.minus(descuento)
      if (nuevoTotal.lt(pagado)) {
        throw new BadRequestException('El total de la venta no puede quedar por debajo de lo ya pagado')
      }
      const nuevoSaldo = nuevoTotal.minus(pagado)
      const nuevoEstado = nuevoSaldo.lte(0)
        ? EstadoCobro.COMPLETO
        : pagado.gt(0) ? EstadoCobro.PARCIAL : EstadoCobro.PENDIENTE

      await tx.cobro.update({
        where: { id: cobroId },
        data: { total: nuevoTotal, descuento, saldoPendiente: nuevoSaldo, estado: nuevoEstado },
      })

      // La cita en ATENDIDA ya sumo su saldo a deudaTotal; ajustar por el delta
      // de saldo que aportan los productos.
      const deltaSaldo = nuevoSaldo.minus(cobro.saldoPendiente)
      if (!deltaSaldo.isZero() && cobro.cita) {
        await tx.paciente.update({
          where: { id: cobro.cita.pacienteId },
          data: { deudaTotal: { increment: deltaSaldo } },
        })
      }

      return tx.cobro.findFirst({
        where: { id: cobroId, consultorioId },
        include: {
          pagos: { orderBy: { createdAt: 'asc' }, include: { tipoCuenta: { select: { nombre: true } } } },
          detalles: { orderBy: { id: 'asc' } },
        },
      })
    })

    return { ...fresco, advertencias }
  }

  // Venta de mostrador sin cita. El cobro nace YA confirmado: el stock se
  // descuenta al crearlo. paciente opcional si la venta se paga completa al
  // contado (pagos[] cubre el total); si queda saldo, paciente es OBLIGATORIO
  // para colgar la deuda.
  async crearVentaDirecta(consultorioId: number, dto: CrearVentaDirectaDto, usuarioId: number) {
    if (dto.lineas.length === 0) throw new BadRequestException('La venta no tiene productos')
    await this.exigirCajaAbierta(consultorioId)

    if (dto.pacienteId) {
      const pac = await this.prisma.paciente.findFirst({
        where: { id: dto.pacienteId, consultorioId, deletedAt: null },
        select: { id: true },
      })
      if (!pac) throw new BadRequestException('Paciente no valido')
    }

    const ids = [...new Set(dto.lineas.map((l) => l.productoId))]
    const productos = await this.prisma.producto.findMany({
      where: { id: { in: ids }, consultorioId, deletedAt: null, activo: true, habilitadoVenta: true },
    })
    const porId = new Map(productos.map((p) => [p.id, p]))
    for (const l of dto.lineas) {
      if (!porId.has(l.productoId)) {
        throw new BadRequestException(`Producto ${l.productoId} no existe o no esta habilitado para la venta`)
      }
    }

    let total = new Decimal(0)
    for (const l of dto.lineas) total = total.plus(porId.get(l.productoId)!.precioVenta.mul(l.cantidad))

    // Calcular totalPagado y validar sobrepago
    let totalPagado = new Decimal(0)
    for (const p of dto.pagos ?? []) totalPagado = totalPagado.plus(new Decimal(p.monto))
    if (totalPagado.gt(total)) {
      throw new BadRequestException('Los pagos superan el total de la venta')
    }

    // Validar formas de pago contra el catalogo del consultorio
    const tipoCuentaIds = [...new Set((dto.pagos ?? []).map((p) => p.tipoCuentaId))]
    const tiposCuenta = tipoCuentaIds.length > 0
      ? await this.prisma.tipoCuenta.findMany({
          where: { id: { in: tipoCuentaIds }, consultorioId, activo: true },
          select: { id: true, esEfectivo: true },
        })
      : []
    if (tiposCuenta.length !== tipoCuentaIds.length) {
      throw new BadRequestException('Forma de pago no valida')
    }
    const tipoCuentaMap = new Map(tiposCuenta.map((tc) => [tc.id, tc]))

    const saldoPendiente = total.minus(totalPagado)

    // Guard nuevo: solo exigir paciente si queda saldo
    if (saldoPendiente.gt(0) && !dto.pacienteId) {
      throw new BadRequestException('Si la venta no se paga completa al contado, elegi un paciente para la deuda')
    }

    const estado = saldoPendiente.lte(0)
      ? EstadoCobro.COMPLETO
      : totalPagado.gt(0) ? EstadoCobro.PARCIAL : EstadoCobro.PENDIENTE

    const advertencias: string[] = []

    const fresco = await this.prisma.$transaction(async (tx) => {
      const cobro = await tx.cobro.create({
        data: {
          citaId: null,
          consultorioId,
          pacienteId: dto.pacienteId ?? null,
          total,
          saldoPendiente,
          estado,
        },
      })

      for (const l of dto.lineas) {
        const p = porId.get(l.productoId)!
        await tx.detalleCobro.create({
          data: {
            consultorioId, cobroId: cobro.id, productoId: p.id,
            descripcion: p.nombre, cantidad: l.cantidad,
            precioVenta: p.precioVenta, precioCosto: p.precioCosto,
            subtotal: p.precioVenta.mul(l.cantidad),
          },
        })
      }

      // Confirmada al crear: descontar stock
      const adv = await descontarStockDeCobro(tx, consultorioId, cobro.id, usuarioId)
      advertencias.push(...adv)

      // Registrar pagos inline
      for (const p of dto.pagos ?? []) {
        await tx.pago.create({
          data: {
            cobroId: cobro.id,
            tipoCuentaId: p.tipoCuentaId,
            monto: new Decimal(p.monto),
            referencia: p.referencia,
            createdById: usuarioId,
          },
        })
      }

      // Caja: solo si hay dinero entrante
      if (totalPagado.gt(0)) {
        let efectivo = new Decimal(0)
        for (const p of dto.pagos ?? []) {
          if (tipoCuentaMap.get(p.tipoCuentaId)?.esEfectivo) {
            efectivo = efectivo.plus(new Decimal(p.monto))
          }
        }
        const { clave: hoy } = diaCajaLocal()
        await tx.cajaDiaria.upsert({
          where: { consultorioId_fecha: { consultorioId, fecha: hoy } },
          create: {
            consultorioId,
            fecha: hoy,
            usuarioAperturaId: usuarioId,
            ...(efectivo.gt(0) && { totalEfectivo: efectivo }),
            totalGeneral: totalPagado,
          },
          update: {
            ...(efectivo.gt(0) && { totalEfectivo: { increment: efectivo } }),
            totalGeneral: { increment: totalPagado },
          },
        })
      }

      // Deuda: si hay paciente y queda saldo, incrementar por el saldo pendiente
      if (dto.pacienteId && saldoPendiente.gt(0)) {
        await tx.paciente.update({
          where: { id: dto.pacienteId },
          data: { deudaTotal: { increment: saldoPendiente } },
        })
      }

      await tx.log.create({
        data: {
          consultorioId, usuarioId, entidad: 'Cobro', entidadId: cobro.id, accion: 'CREATE',
          payloadDespues: {
            evento: 'venta-directa',
            total: total.toString(),
            pagado: totalPagado.toString(),
            saldo: saldoPendiente.toString(),
            pacienteId: dto.pacienteId ?? null,
          },
        },
      })

      return tx.cobro.findFirstOrThrow({
        where: { id: cobro.id, consultorioId },
        include: {
          pagos: { orderBy: { createdAt: 'asc' }, include: { tipoCuenta: { select: { nombre: true } } } },
          detalles: { orderBy: { id: 'asc' } },
        },
      })
    })

    return { ...fresco, advertencias }
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

    // Venta directa (sin cita): no hay validacion de estado de cita.
    // Para cobros con cita: validar que la cita este en un estado cobrable.
    let tocaCita = false
    let estadoCita: EstadoCita | undefined
    let nuevoEstadoCita: EstadoCita | undefined

    if (cobro.citaId) {
      estadoCita = cobro.cita!.estado as EstadoCita
      if (![...ESTADOS_PRE_ATENCION, ...ESTADOS_POST_ATENCION].includes(estadoCita)) {
        throw new BadRequestException('No se puede cobrar una cita en este estado')
      }
      tocaCita = ESTADOS_POST_ATENCION.includes(estadoCita)
      const nuevoSaldoTemp = cobro.saldoPendiente.minus(monto)
      const cobradoTemp = nuevoSaldoTemp.lte(0)
      nuevoEstadoCita = cobradoTemp ? EstadoCita.COBRADO : EstadoCita.CON_DEUDA
    }

    const nuevoSaldo = cobro.saldoPendiente.minus(monto)
    const cobrado = nuevoSaldo.lte(0)
    const nuevoEstadoCobro = cobrado ? EstadoCobro.COMPLETO : EstadoCobro.PARCIAL

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
      if (tocaCita && cobro.citaId) {
        await tx.cita.update({
          where: { id: cobro.citaId },
          data: { estado: nuevoEstadoCita },
        })
        await tx.paciente.update({
          where: { id: cobro.cita!.pacienteId },
          data: { deudaTotal: { decrement: monto } },
        })
        // Confirmacion de la venta: la cita sale de ATENDIDA -> COBRADO/CON_DEUDA.
        // Descontar stock de las lineas de producto una sola vez (en ese borde).
        if (estadoCita === EstadoCita.ATENDIDA) {
          await descontarStockDeCobro(tx, consultorioId, cobroId, usuarioId)
        }
      }

      // Venta directa (sin cita): la deuda del paciente baja con cada pago
      if (!cobro.citaId && cobro.pacienteId) {
        await tx.paciente.update({
          where: { id: cobro.pacienteId },
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

    return cobro.citaId
      ? this.findByCita(consultorioId, cobro.citaId)
      : this.findOne(consultorioId, cobroId)
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
    const revierteCita = !!cobro.cita && cobro.cita.estado === EstadoCita.COBRADO
    // Paciente cuya deuda se incrementa: el de la cita, o el directo del cobro
    const pacienteDeuda = cobro.cita?.pacienteId ?? cobro.pacienteId

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

      if (revierteCita && cobro.cita) {
        await tx.cita.update({
          where: { id: cobro.cita.id },
          data: { estado: EstadoCita.CON_DEUDA },
        })
      }

      // Espejo del decrement de registrarPago
      if (pacienteDeuda) {
        await tx.paciente.update({
          where: { id: pacienteDeuda },
          data: { deudaTotal: { increment: pago.monto } },
        })
      }

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

    const advertencia = cajaOriginal?.cerrada
      ? 'La caja del dia del pago original ya estaba cerrada: la reversa impacta la caja de hoy'
      : undefined

    if (cobro.citaId && cobro.cita) {
      const cobroFresco = await this.findByCita(consultorioId, cobro.cita.id)
      return { ...cobroFresco, advertencia }
    }
    const cobroFresco = await this.findOne(consultorioId, cobro.id)
    return { ...cobroFresco, advertencia }
  }

  // Devolucion de prepago: reversa TODOS los pagos activos del cobro de la cita
  // (espejo negativo, los originales quedan anulados). Saca la plata de la caja
  // de hoy. Deja el cobro en su total/PENDIENTE; al cancelar la cita pasara a
  // ANULADO. No toca cita.estado ni deudaTotal (cancelar es siempre pre-atencion,
  // donde el prepago no impacto la deuda).
  async reversarPagosDeCita(
    consultorioId: number,
    citaId: number,
    usuarioId: number,
    motivo?: string,
  ): Promise<void> {
    const pagos = await this.prisma.pago.findMany({
      where: { cobro: { citaId, consultorioId }, anuladoAt: null, monto: { gt: 0 } },
      select: {
        id: true, monto: true, tipoCuentaId: true, referencia: true,
        tipoCuenta: { select: { esEfectivo: true } },
        cobro: { select: { id: true, total: true } },
      },
    })
    if (pagos.length === 0) return
    await this.exigirCajaAbierta(consultorioId)
    const { clave: hoy } = diaCajaLocal()

    await this.prisma.$transaction(async (tx) => {
      for (const p of pagos) {
        await tx.pago.create({
          data: {
            cobroId: p.cobro.id,
            tipoCuentaId: p.tipoCuentaId,
            monto: p.monto.negated(),
            referencia: p.referencia,
            createdById: usuarioId,
            reversaDeId: p.id,
          },
        })
        await tx.pago.update({
          where: { id: p.id },
          data: { anuladoAt: new Date(), anuladoPorId: usuarioId, motivoAnulacion: motivo },
        })
        await tx.cajaDiaria.upsert({
          where: { consultorioId_fecha: { consultorioId, fecha: hoy } },
          create: {
            consultorioId, fecha: hoy, usuarioAperturaId: usuarioId,
            ...(p.tipoCuenta.esEfectivo && { totalEfectivo: p.monto.negated() }),
            totalGeneral: p.monto.negated(),
          },
          update: {
            ...(p.tipoCuenta.esEfectivo && { totalEfectivo: { decrement: p.monto } }),
            totalGeneral: { decrement: p.monto },
          },
        })
        await tx.log.create({
          data: {
            consultorioId, usuarioId, entidad: 'Pago', entidadId: p.id, accion: 'PAYMENT',
            payloadAntes: { monto: p.monto.toString() },
            payloadDespues: { anulado: true, motivo: motivo ?? null, citaId, devolucion: true },
          },
        })
      }
      // El cobro vuelve a su total; quedara ANULADO al cancelar la cita
      await tx.cobro.update({
        where: { id: pagos[0].cobro.id },
        data: { saldoPendiente: pagos[0].cobro.total, estado: EstadoCobro.PENDIENTE },
      })
    })
  }

  // Deuda real = saldo de cobros cuya cita fue prestada (ATENDIDA/CON_DEUDA),
  // mas ventas directas con saldo y paciente asignado.
  private readonly whereDeudaReal = (consultorioId: number): Prisma.CobroWhereInput => ({
    consultorioId,
    saldoPendiente: { gt: new Decimal(0) },
    OR: [
      { cita: { estado: { in: [EstadoCita.ATENDIDA, EstadoCita.CON_DEUDA] }, deletedAt: null } },
      // Venta directa: sin cita, con paciente para colgar la deuda
      { citaId: null, pacienteId: { not: null } },
    ],
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
    // El descuento aplica sobre el total completo (servicio y/o productos); el
    // unico piso es lo ya pagado (no se puede dejar el cobro con saldo negativo).
    if (nuevoTotal.lt(pagado)) {
      throw new BadRequestException(
        `El nuevo total ($${nuevoTotal}) no puede ser menor a lo ya pagado ($${pagado})`,
      )
    }

    // Bruto (precio de lista = SUM detalles). Invariante total = bruto - descuento
    // => bruto = total + descuento. Robusto tambien para cobros viejos sin linea
    // de servicio (ahi descuento=0, bruto=total). El descuento queda como dato.
    const bruto = cobro.total.plus(cobro.descuento)
    const nuevoDescuento = bruto.minus(nuevoTotal) // + descuento, - recargo
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
        data: {
          total: nuevoTotal,
          descuento: nuevoDescuento,
          motivoDescuento: dto.motivo ?? null,
          saldoPendiente: nuevoSaldo,
          estado: nuevoEstadoCobro,
        },
      })

      // La deuda del paciente sigue al saldo solo si el servicio ya se presto
      const citaConDeuda =
        cobro.cita?.estado === EstadoCita.ATENDIDA ||
        cobro.cita?.estado === EstadoCita.CON_DEUDA
      if (citaConDeuda) {
        const delta = nuevoSaldo.minus(cobro.saldoPendiente)
        if (!delta.isZero()) {
          await tx.paciente.update({
            where: { id: cobro.cita!.pacienteId },
            data: { deudaTotal: { increment: delta } },
          })
        }
        // Si el ajuste deja el cobro saldado, la cita queda cobrada
        if (quedaSaldado) {
          await tx.cita.update({
            where: { id: cobro.cita!.id },
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

    return cobro.citaId
      ? this.findByCita(consultorioId, cobro.citaId)
      : this.findOne(consultorioId, cobroId)
  }

  async getDeudores(consultorioId: number) {
    const cobros = await this.prisma.cobro.findMany({
      where: this.whereDeudaReal(consultorioId),
      include: {
        pagos: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
        paciente: { select: { id: true, nombre: true, apellido: true, telefono: true, pais: true } },
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
      const pac = cobro.cita?.paciente ?? cobro.paciente
      if (!pac) continue // venta directa sin paciente (contado): no es deuda
      const fechaCita = cobro.cita ? new Date(cobro.cita.fechaHora) : new Date(cobro.createdAt)
      const ultimoServicio = cobro.cita?.servicio.nombre ?? 'Venta de productos'
      const fechaPago = cobro.pagos[0]?.createdAt ?? null
      const existing = porPaciente.get(pac.id)

      if (existing) {
        existing.deudaTotal += Number(cobro.saldoPendiente)
        if (fechaCita > existing.ultimaCitaFecha) {
          existing.ultimaCitaFecha = fechaCita
          existing.ultimoServicio = ultimoServicio
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
          ultimoServicio,
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
        select: { pacienteId: true, cita: { select: { pacienteId: true } } },
      }),
    ])

    const pacienteIds = new Set(cobros.map((c) => c.cita?.pacienteId ?? c.pacienteId).filter(Boolean))

    return {
      totalDeuda: Number(suma._sum.saldoPendiente ?? 0),
      cantidadPacientes: pacienteIds.size,
    }
  }
}
