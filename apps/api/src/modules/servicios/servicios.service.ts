import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { IsString, IsNotEmpty, IsOptional, IsInt, Min, IsNumber, IsBoolean } from 'class-validator'
import { PartialType } from '@nestjs/swagger'
import { PrismaService } from '../../prisma/prisma.service'

export class CreateServicioDto {
  @IsString() @IsNotEmpty()
  nombre: string

  @IsString() @IsOptional()
  descripcion?: string

  @IsInt() @Min(5)
  duracionMin: number

  @IsNumber() @Min(0)
  precioBase: number

  @IsBoolean() @IsOptional()
  mostrarEnBooking?: boolean
}

export class UpdateServicioDto extends PartialType(CreateServicioDto) {
  @IsBoolean() @IsOptional()
  activo?: boolean
}

@Injectable()
export class ServiciosService {
  constructor(private prisma: PrismaService) {}

  private async exigirNombreUnico(consultorioId: number, nombre: string, exceptoId?: number) {
    const existe = await this.prisma.servicio.findFirst({
      where: {
        consultorioId,
        activo: true,
        nombre: { equals: nombre, mode: 'insensitive' },
        ...(exceptoId ? { id: { not: exceptoId } } : {}),
      },
      select: { id: true },
    })
    if (existe) throw new ConflictException('Ya existe un servicio con ese nombre')
  }

  findAll(consultorioId: number, incluirInactivos = false) {
    return this.prisma.servicio.findMany({
      where: { consultorioId, ...(incluirInactivos ? {} : { activo: true }) },
      orderBy: { nombre: 'asc' },
    })
  }

  async create(consultorioId: number, dto: CreateServicioDto) {
    await this.exigirNombreUnico(consultorioId, dto.nombre)
    return this.prisma.servicio.create({ data: { ...dto, consultorioId } })
  }

  async update(consultorioId: number, id: number, dto: UpdateServicioDto) {
    const s = await this.prisma.servicio.findFirst({ where: { id, consultorioId } })
    if (!s) throw new NotFoundException()
    if (dto.nombre) await this.exigirNombreUnico(consultorioId, dto.nombre, id)
    return this.prisma.servicio.update({ where: { id }, data: dto })
  }

  async remove(consultorioId: number, id: number) {
    const s = await this.prisma.servicio.findFirst({ where: { id, consultorioId } })
    if (!s) throw new NotFoundException()
    return this.prisma.servicio.update({ where: { id }, data: { activo: false } })
  }
}
