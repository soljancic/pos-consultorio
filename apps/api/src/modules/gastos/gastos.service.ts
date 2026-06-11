import { Injectable, NotFoundException } from '@nestjs/common'
import { PartialType } from '@nestjs/swagger'
import { IsNumber, Min, IsString, IsOptional, IsEnum, IsISO8601, IsNotEmpty } from 'class-validator'
import { CategoriaGasto, CuentaGasto } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../prisma/prisma.service'

export class CreateGastoDto {
  // Dia calendario del gasto (YYYY-MM-DD)
  @IsISO8601()
  fecha: string

  @IsEnum(CategoriaGasto)
  categoria: CategoriaGasto

  @IsNumber() @Min(0.01)
  monto: number

  @IsString() @IsNotEmpty()
  descripcion: string

  @IsString() @IsOptional()
  personal?: string

  @IsEnum(CuentaGasto)
  cuenta: CuentaGasto

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

  findAll(consultorioId: number, desde?: string, hasta?: string, categoria?: CategoriaGasto) {
    return this.prisma.gasto.findMany({
      where: {
        consultorioId,
        deletedAt: null,
        ...(categoria && { categoria }),
        ...((desde || hasta) && {
          fecha: {
            ...(desde && { gte: this.claveDia(desde) }),
            ...(hasta && { lte: this.claveDia(hasta) }),
          },
        }),
      },
      include: { registradoPor: { select: { nombre: true } } },
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
      select: { categoria: true, monto: true },
    })

    const porCategoria: Record<string, number> = {}
    let total = 0
    for (const g of gastos) {
      const monto = Number(g.monto)
      total += monto
      porCategoria[g.categoria] = (porCategoria[g.categoria] ?? 0) + monto
    }
    return { total, porCategoria }
  }

  async create(consultorioId: number, usuarioId: number, dto: CreateGastoDto) {
    const gasto = await this.prisma.gasto.create({
      data: {
        consultorioId,
        fecha: this.claveDia(dto.fecha),
        categoria: dto.categoria,
        monto: new Decimal(dto.monto),
        descripcion: dto.descripcion,
        personal: dto.personal,
        cuenta: dto.cuenta,
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
          categoria: dto.categoria,
          monto: dto.monto,
          cuenta: dto.cuenta,
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

    const actualizado = await this.prisma.gasto.update({
      where: { id },
      data: {
        ...(dto.fecha !== undefined && { fecha: this.claveDia(dto.fecha) }),
        ...(dto.categoria !== undefined && { categoria: dto.categoria }),
        ...(dto.monto !== undefined && { monto: new Decimal(dto.monto) }),
        ...(dto.descripcion !== undefined && { descripcion: dto.descripcion }),
        ...(dto.personal !== undefined && { personal: dto.personal }),
        ...(dto.cuenta !== undefined && { cuenta: dto.cuenta }),
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
        payloadAntes: { monto: gasto.monto.toString(), categoria: gasto.categoria },
        payloadDespues: { monto: actualizado.monto.toString(), categoria: actualizado.categoria },
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
        payloadAntes: { monto: gasto.monto.toString(), categoria: gasto.categoria },
      },
    })

    return borrado
  }
}
