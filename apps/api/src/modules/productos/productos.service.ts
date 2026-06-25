import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import {
  IsString, IsNotEmpty, IsOptional, IsBoolean, IsInt, IsNumber, Min, MaxLength,
} from 'class-validator'
import { Type } from 'class-transformer'
import { PartialType } from '@nestjs/swagger'
import { PrismaService } from '../../prisma/prisma.service'

export class CreateProductoDto {
  @IsString() @IsNotEmpty() @MaxLength(120)
  nombre: string

  @IsString() @IsOptional() @MaxLength(60)
  categoria?: string

  @IsString() @IsOptional() @MaxLength(60)
  codigoBarras?: string

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  precioVenta: number

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  precioCosto: number

  @Type(() => Number) @IsInt()
  stockActual: number

  @IsBoolean() @IsOptional()
  controlaStock?: boolean

  @IsBoolean() @IsOptional()
  habilitadoVenta?: boolean
}

export class UpdateProductoDto extends PartialType(CreateProductoDto) {
  @IsBoolean() @IsOptional()
  activo?: boolean
}

@Injectable()
export class ProductosService {
  constructor(private prisma: PrismaService) {}

  // Lista paginada del catalogo (patron pacientes: {items,total}).
  async findAll(
    consultorioId: number,
    opts: { search?: string; incluirInactivos?: boolean; soloVendibles?: boolean; page?: number; limit?: number } = {},
  ) {
    const page = Math.max(1, opts.page ?? 1)
    const limit = Math.min(100, Math.max(1, opts.limit ?? 50))
    const where = {
      consultorioId,
      deletedAt: null,
      ...(opts.incluirInactivos ? {} : { activo: true }),
      ...(opts.soloVendibles ? { habilitadoVenta: true, activo: true } : {}),
      ...(opts.search
        ? {
            OR: [
              { nombre: { contains: opts.search, mode: 'insensitive' as const } },
              { codigoBarras: { contains: opts.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.producto.findMany({
        where,
        orderBy: { nombre: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.producto.count({ where }),
    ])
    return { items, total }
  }

  // Picker de venta: solo vendibles, sin paginar (lista acotada por search).
  vendibles(consultorioId: number, search?: string) {
    return this.prisma.producto.findMany({
      where: {
        consultorioId,
        deletedAt: null,
        activo: true,
        habilitadoVenta: true,
        ...(search
          ? {
              OR: [
                { nombre: { contains: search, mode: 'insensitive' as const } },
                { codigoBarras: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { nombre: 'asc' },
      take: 50,
    })
  }

  async create(consultorioId: number, dto: CreateProductoDto) {
    await this.validarCodigoUnico(consultorioId, dto.codigoBarras)
    return this.prisma.producto.create({
      data: {
        consultorioId,
        nombre: dto.nombre,
        categoria: dto.categoria,
        codigoBarras: dto.codigoBarras,
        precioVenta: dto.precioVenta,
        precioCosto: dto.precioCosto,
        stockActual: dto.stockActual,
        ...(dto.controlaStock !== undefined && { controlaStock: dto.controlaStock }),
        ...(dto.habilitadoVenta !== undefined && { habilitadoVenta: dto.habilitadoVenta }),
      },
    })
  }

  async update(consultorioId: number, id: number, dto: UpdateProductoDto) {
    const p = await this.prisma.producto.findFirst({ where: { id, consultorioId, deletedAt: null } })
    if (!p) throw new NotFoundException('Producto no encontrado')
    if (dto.codigoBarras !== undefined && dto.codigoBarras !== p.codigoBarras) {
      await this.validarCodigoUnico(consultorioId, dto.codigoBarras, id)
    }
    return this.prisma.producto.update({ where: { id }, data: dto })
  }

  // Si el producto fue usado en algun cobro, no se borra: se archiva
  // (activo:false), para preservar el historico de DetalleCobro.
  async remove(consultorioId: number, id: number) {
    const p = await this.prisma.producto.findFirst({ where: { id, consultorioId, deletedAt: null } })
    if (!p) throw new NotFoundException('Producto no encontrado')
    const usado = await this.prisma.detalleCobro.count({ where: { productoId: id } })
    if (usado > 0) {
      const producto = await this.prisma.producto.update({ where: { id }, data: { activo: false } })
      return { eliminado: false, enUso: true, producto }
    }
    await this.prisma.producto.update({ where: { id }, data: { deletedAt: new Date(), activo: false } })
    return { eliminado: true }
  }

  // codigoBarras es nullable: solo choca si hay otro producto vivo con el mismo
  // codigo en el consultorio (el @@unique ya cubre, validamos para 409 claro).
  private async validarCodigoUnico(consultorioId: number, codigoBarras: string | undefined, excludeId?: number) {
    if (!codigoBarras) return
    const existe = await this.prisma.producto.findFirst({
      where: { consultorioId, codigoBarras, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    })
    if (existe) throw new ConflictException('Ya existe un producto con ese codigo de barras')
  }
}
