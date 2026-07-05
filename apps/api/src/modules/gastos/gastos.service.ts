import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { PartialType } from '@nestjs/swagger'
import { IsNumber, Min, IsString, IsOptional, IsInt, IsISO8601, IsNotEmpty } from 'class-validator'
import { Decimal } from '../../common/decimal'
import { PrismaService } from '../../prisma/prisma.service'
import { diaCajaLocal } from '../caja/caja.service'

export class CreateGastoDto {
  // Dia calendario del gasto (YYYY-MM-DD)
  @IsISO8601()
  fecha: string

  @IsInt() @Min(1)
  tipoGastoId: number

  @IsNumber() @Min(0.01)
  monto: number

  @IsString() @IsNotEmpty()
  descripcion: string

  @IsString() @IsOptional()
  personal?: string

  @IsInt() @Min(1)
  tipoCuentaId: number

  @IsString() @IsOptional()
  comprobanteUrl?: string
}

export class UpdateGastoDto extends PartialType(CreateGastoDto) {}

@Injectable()
export class GastosService {
  constructor(private prisma: PrismaService) {}

  // fecha es @db.Date: se persiste como dia calendario (clave T00:00:00Z)
  private claveDia(fecha: string) {
    return new Date(`${fecha.slice(0, 10)}T00:00:00Z`)
  }

  findAll(consultorioId: number, desde?: string, hasta?: string, tipoGastoId?: number) {
    return this.prisma.gasto.findMany({
      where: {
        consultorioId,
        deletedAt: null,
        ...(tipoGastoId && { tipoGastoId }),
        ...((desde || hasta) && {
          fecha: {
            ...(desde && { gte: this.claveDia(desde) }),
            ...(hasta && { lte: this.claveDia(hasta) }),
          },
        }),
      },
      include: {
        registradoPor: { select: { nombre: true } },
        tipoGasto: { select: { nombre: true } },
        tipoCuenta: { select: { nombre: true, esEfectivo: true } },
      },
      orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }],
    })
  }

  async resumen(consultorioId: number, desde?: string, hasta?: string) {
    const gastos = await this.prisma.gasto.findMany({
      where: {
        consultorioId,
        deletedAt: null,
        ...((desde || hasta) && {
          fecha: {
            ...(desde && { gte: this.claveDia(desde) }),
            ...(hasta && { lte: this.claveDia(hasta) }),
          },
        }),
      },
      select: { monto: true, tipoGasto: { select: { nombre: true } } },
    })

    const porCategoria: Record<string, number> = {}
    let total = 0
    for (const g of gastos) {
      const monto = Number(g.monto)
      total += monto
      const nombre = g.tipoGasto.nombre
      porCategoria[nombre] = (porCategoria[nombre] ?? 0) + monto
    }
    return { total, porCategoria }
  }

  async create(consultorioId: number, usuarioId: number, dto: CreateGastoDto) {
    // E2-M9: sin turno abierto no se registra gastos (tampoco tras el cierre)
    const { clave: hoy } = diaCajaLocal()
    const cajaHoy = await this.prisma.cajaDiaria.findUnique({
      where: { consultorioId_fecha: { consultorioId, fecha: hoy } },
      select: { abiertaAt: true, cerrada: true },
    })
    if (!cajaHoy?.abiertaAt) {
      throw new ConflictException('La caja no esta abierta: abra el turno del dia en Caja')
    }
    if (cajaHoy.cerrada) {
      throw new ConflictException('La caja de hoy ya esta cerrada: no se pueden registrar movimientos')
    }

    // El tipo y la cuenta deben ser del mismo consultorio
    const [tg, tc] = await Promise.all([
      this.prisma.tipoGasto.findFirst({ where: { id: dto.tipoGastoId, consultorioId } }),
      this.prisma.tipoCuenta.findFirst({ where: { id: dto.tipoCuentaId, consultorioId } }),
    ])
    if (!tg) throw new NotFoundException('Tipo de gasto no encontrado')
    if (!tc) throw new NotFoundException('Tipo de cuenta no encontrado')

    const gasto = await this.prisma.gasto.create({
      data: {
        consultorioId,
        fecha: this.claveDia(dto.fecha),
        tipoGastoId: dto.tipoGastoId,
        monto: new Decimal(dto.monto),
        descripcion: dto.descripcion,
        personal: dto.personal,
        tipoCuentaId: dto.tipoCuentaId,
        comprobanteUrl: dto.comprobanteUrl,
        registradoPorId: usuarioId,
      },
    })

    await this.prisma.log.create({
      data: {
        consultorioId,
        usuarioId,
        entidad: 'Gasto',
        entidadId: gasto.id,
        accion: 'CREATE',
        payloadDespues: {
          tipoGastoId: dto.tipoGastoId,
          monto: dto.monto,
          tipoCuentaId: dto.tipoCuentaId,
          descripcion: dto.descripcion,
        },
      },
    })

    return gasto
  }

  async update(consultorioId: number, id: number, usuarioId: number, dto: UpdateGastoDto) {
    const gasto = await this.prisma.gasto.findFirst({
      where: { id, consultorioId, deletedAt: null },
    })
    if (!gasto) throw new NotFoundException('Gasto no encontrado')

    // Igual que en create: el tipo y la cuenta deben ser del mismo consultorio
    // (sin esto se podia colgar el gasto de un tipoCuentaId ajeno)
    if (dto.tipoGastoId !== undefined) {
      const tg = await this.prisma.tipoGasto.findFirst({
        where: { id: dto.tipoGastoId, consultorioId },
      })
      if (!tg) throw new NotFoundException('Tipo de gasto no encontrado')
    }
    if (dto.tipoCuentaId !== undefined) {
      const tc = await this.prisma.tipoCuenta.findFirst({
        where: { id: dto.tipoCuentaId, consultorioId },
      })
      if (!tc) throw new NotFoundException('Tipo de cuenta no encontrado')
    }

    const actualizado = await this.prisma.gasto.update({
      where: { id },
      data: {
        ...(dto.fecha !== undefined && { fecha: this.claveDia(dto.fecha) }),
        ...(dto.tipoGastoId !== undefined && { tipoGastoId: dto.tipoGastoId }),
        ...(dto.monto !== undefined && { monto: new Decimal(dto.monto) }),
        ...(dto.descripcion !== undefined && { descripcion: dto.descripcion }),
        ...(dto.personal !== undefined && { personal: dto.personal }),
        ...(dto.tipoCuentaId !== undefined && { tipoCuentaId: dto.tipoCuentaId }),
        ...(dto.comprobanteUrl !== undefined && { comprobanteUrl: dto.comprobanteUrl }),
      },
    })

    await this.prisma.log.create({
      data: {
        consultorioId,
        usuarioId,
        entidad: 'Gasto',
        entidadId: id,
        accion: 'UPDATE',
        payloadAntes: { monto: gasto.monto.toString(), tipoGastoId: gasto.tipoGastoId },
        payloadDespues: { monto: actualizado.monto.toString(), tipoGastoId: actualizado.tipoGastoId },
      },
    })

    return actualizado
  }

  async remove(consultorioId: number, id: number, usuarioId: number) {
    const gasto = await this.prisma.gasto.findFirst({
      where: { id, consultorioId, deletedAt: null },
    })
    if (!gasto) throw new NotFoundException('Gasto no encontrado')

    const borrado = await this.prisma.gasto.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    await this.prisma.log.create({
      data: {
        consultorioId,
        usuarioId,
        entidad: 'Gasto',
        entidadId: id,
        accion: 'DELETE',
        payloadAntes: { monto: gasto.monto.toString(), tipoGastoId: gasto.tipoGastoId },
      },
    })

    return borrado
  }
}
