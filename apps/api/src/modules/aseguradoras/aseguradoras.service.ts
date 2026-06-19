import { Injectable, NotFoundException } from '@nestjs/common'
import { IsString, IsNotEmpty, IsOptional, IsEmail, IsBoolean, ValidateIf, MaxLength } from 'class-validator'
import { PartialType } from '@nestjs/swagger'
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
}
