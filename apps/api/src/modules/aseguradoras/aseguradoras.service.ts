import { Injectable, NotFoundException } from '@nestjs/common'
import { IsString, IsNotEmpty, IsOptional, IsEmail, IsBoolean, ValidateIf, MaxLength, IsInt, IsNumber, Min, Max } from 'class-validator'
import { PartialType } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { PrismaService } from '../../prisma/prisma.service'

export class CreateAseguradoraDto {
  @IsString() @IsNotEmpty() @MaxLength(120)
  nombre: string

  @IsString() @IsOptional() @MaxLength(120)
  contacto?: string

  @IsString() @IsOptional() @MaxLength(40)
  telefono?: string

  @ValidateIf((o) => o.email !== '' && o.email != null)
  @IsEmail() @IsOptional()
  email?: string

  @IsString() @IsOptional() @MaxLength(500)
  observaciones?: string
}

export class UpdateAseguradoraDto extends PartialType(CreateAseguradoraDto) {
  @IsBoolean() @IsOptional()
  activa?: boolean
}

export class CreateCategoriaSeguroDto {
  @Type(() => Number) @IsInt()
  aseguradoraId: number

  @IsString() @IsNotEmpty() @MaxLength(80)
  nombre: string

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100)
  porcentajeCobertura: number
}

// Base nombrada (sin aseguradoraId: la categoria no se mueve de aseguradora)
export class CategoriaSeguroBaseDto {
  @IsString() @IsNotEmpty() @MaxLength(80)
  nombre: string

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100)
  porcentajeCobertura: number
}

export class UpdateCategoriaSeguroDto extends PartialType(CategoriaSeguroBaseDto) {
  @IsBoolean() @IsOptional()
  activa?: boolean
}

@Injectable()
export class AseguradorasService {
  constructor(private prisma: PrismaService) {}

  findAll(consultorioId: number, incluirInactivas = false) {
    return this.prisma.aseguradora.findMany({
      where: { consultorioId, ...(incluirInactivas ? {} : { activa: true }) },
      orderBy: { nombre: 'asc' },
    })
  }

  create(consultorioId: number, dto: CreateAseguradoraDto) {
    return this.prisma.aseguradora.create({ data: { ...dto, consultorioId } })
  }

  async update(consultorioId: number, id: number, dto: UpdateAseguradoraDto) {
    const a = await this.prisma.aseguradora.findFirst({ where: { id, consultorioId } })
    if (!a) throw new NotFoundException()
    return this.prisma.aseguradora.update({ where: { id }, data: dto })
  }

  // Borrar si no tiene categorias; si las tiene, desactivar (las categorias
  // pueden estar referenciadas por pacientes/citas en fases posteriores).
  async remove(consultorioId: number, id: number) {
    const a = await this.prisma.aseguradora.findFirst({ where: { id, consultorioId } })
    if (!a) throw new NotFoundException()
    const conCategorias = await this.prisma.categoriaSeguro.count({ where: { aseguradoraId: id } })
    if (conCategorias > 0) {
      const aseguradora = await this.prisma.aseguradora.update({ where: { id }, data: { activa: false } })
      return { eliminado: false, enUso: true, aseguradora }
    }
    await this.prisma.aseguradora.delete({ where: { id } })
    return { eliminado: true }
  }

  async findCategorias(consultorioId: number, aseguradoraId: number, soloActivas = false) {
    return this.prisma.categoriaSeguro.findMany({
      where: { consultorioId, aseguradoraId, ...(soloActivas ? { activa: true } : {}) },
      orderBy: { nombre: 'asc' },
    })
  }

  async createCategoria(consultorioId: number, dto: CreateCategoriaSeguroDto) {
    // La aseguradora debe ser del mismo consultorio (no confiar en el body)
    const aseg = await this.prisma.aseguradora.findFirst({
      where: { id: dto.aseguradoraId, consultorioId },
      select: { id: true },
    })
    if (!aseg) throw new NotFoundException('Aseguradora inexistente')
    return this.prisma.categoriaSeguro.create({
      data: {
        consultorioId,
        aseguradoraId: dto.aseguradoraId,
        nombre: dto.nombre,
        porcentajeCobertura: dto.porcentajeCobertura,
      },
    })
  }

  async updateCategoria(consultorioId: number, id: number, dto: UpdateCategoriaSeguroDto) {
    const c = await this.prisma.categoriaSeguro.findFirst({ where: { id, consultorioId } })
    if (!c) throw new NotFoundException()
    return this.prisma.categoriaSeguro.update({ where: { id }, data: dto })
  }

  async removeCategoria(consultorioId: number, id: number) {
    const c = await this.prisma.categoriaSeguro.findFirst({ where: { id, consultorioId } })
    if (!c) throw new NotFoundException()
    const conTarifas = await this.prisma.tarifaCobertura.count({ where: { categoriaSeguroId: id } })
    if (conTarifas > 0) {
      const categoria = await this.prisma.categoriaSeguro.update({ where: { id }, data: { activa: false } })
      return { eliminado: false, enUso: true, categoria }
    }
    await this.prisma.categoriaSeguro.delete({ where: { id } })
    return { eliminado: true }
  }
}
