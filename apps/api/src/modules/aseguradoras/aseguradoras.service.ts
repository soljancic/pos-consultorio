import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { IsString, IsNotEmpty, IsOptional, IsEmail, IsBoolean, ValidateIf, MaxLength, IsInt, IsNumber, Min, Max, ValidateNested, ArrayMaxSize, IsArray } from 'class-validator'
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

export class TarifaItemDto {
  @Type(() => Number) @IsInt()
  servicioId: number

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  montoPaciente: number

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  montoAseguradora: number
}

export class SetTarifasDto {
  @Type(() => Number) @IsInt()
  categoriaSeguroId: number

  @IsArray() @ValidateNested({ each: true }) @Type(() => TarifaItemDto) @ArrayMaxSize(500)
  tarifas: TarifaItemDto[]
}

@Injectable()
export class AseguradorasService {
  constructor(private prisma: PrismaService) {}

  private async exigirNombreUnicoAseguradora(consultorioId: number, nombre: string, exceptoId?: number) {
    const existe = await this.prisma.aseguradora.findFirst({
      where: {
        consultorioId,
        activa: true,
        nombre: { equals: nombre, mode: 'insensitive' },
        ...(exceptoId ? { id: { not: exceptoId } } : {}),
      },
      select: { id: true },
    })
    if (existe) throw new ConflictException('Ya existe una aseguradora con ese nombre')
  }

  private async exigirNombreUnicoCategoria(consultorioId: number, aseguradoraId: number, nombre: string, exceptoId?: number) {
    const existe = await this.prisma.categoriaSeguro.findFirst({
      where: {
        consultorioId,
        aseguradoraId,
        activa: true,
        nombre: { equals: nombre, mode: 'insensitive' },
        ...(exceptoId ? { id: { not: exceptoId } } : {}),
      },
      select: { id: true },
    })
    if (existe) throw new ConflictException('Ya existe una categoría con ese nombre para esta aseguradora')
  }

  findAll(consultorioId: number, incluirInactivas = false) {
    return this.prisma.aseguradora.findMany({
      where: { consultorioId, ...(incluirInactivas ? {} : { activa: true }) },
      orderBy: { nombre: 'asc' },
    })
  }

  async create(consultorioId: number, dto: CreateAseguradoraDto) {
    await this.exigirNombreUnicoAseguradora(consultorioId, dto.nombre)
    return this.prisma.aseguradora.create({ data: { ...dto, consultorioId } })
  }

  async update(consultorioId: number, id: number, dto: UpdateAseguradoraDto) {
    const a = await this.prisma.aseguradora.findFirst({ where: { id, consultorioId } })
    if (!a) throw new NotFoundException()
    if (dto.nombre) await this.exigirNombreUnicoAseguradora(consultorioId, dto.nombre, id)
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
    await this.exigirNombreUnicoCategoria(consultorioId, dto.aseguradoraId, dto.nombre)
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
    if (dto.nombre) await this.exigirNombreUnicoCategoria(consultorioId, c.aseguradoraId, dto.nombre, id)
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

  findTarifas(consultorioId: number, categoriaSeguroId: number) {
    return this.prisma.tarifaCobertura.findMany({
      where: { consultorioId, categoriaSeguroId },
      orderBy: { servicioId: 'asc' },
    })
  }

  async setTarifas(consultorioId: number, dto: SetTarifasDto) {
    const cat = await this.prisma.categoriaSeguro.findFirst({
      where: { id: dto.categoriaSeguroId, consultorioId },
      select: { id: true },
    })
    if (!cat) throw new NotFoundException('Categoria inexistente')
    // Solo upsert de las celdas enviadas. Un upsert por servicio en transaccion.
    await this.prisma.$transaction(
      dto.tarifas.map((t) =>
        this.prisma.tarifaCobertura.upsert({
          where: { categoriaSeguroId_servicioId: { categoriaSeguroId: dto.categoriaSeguroId, servicioId: t.servicioId } },
          create: {
            consultorioId,
            categoriaSeguroId: dto.categoriaSeguroId,
            servicioId: t.servicioId,
            montoPaciente: t.montoPaciente,
            montoAseguradora: t.montoAseguradora,
          },
          update: { montoPaciente: t.montoPaciente, montoAseguradora: t.montoAseguradora, activa: true },
        }),
      ),
    )
    return this.findTarifas(consultorioId, dto.categoriaSeguroId)
  }
}
