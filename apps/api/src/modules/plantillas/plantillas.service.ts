import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common'
import { IsString, IsNotEmpty, MaxLength, Matches } from 'class-validator'
import { PrismaService } from '../../prisma/prisma.service'

export class CreatePlantillaDto {
  @IsString() @IsNotEmpty() @MaxLength(40)
  nombre: string

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'horaInicio debe ser HH:mm' })
  horaInicio: string

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'horaFin debe ser HH:mm' })
  horaFin: string
}

// Calendario f2b: presets de horario nombrados, reutilizables al crear
// bloques de disponibilidad. Complementan a los presets fijos del modal.
@Injectable()
export class PlantillasService {
  constructor(private prisma: PrismaService) {}

  findAll(consultorioId: number) {
    return this.prisma.plantillaHorario.findMany({
      where: { consultorioId, deletedAt: null },
      orderBy: { horaInicio: 'asc' },
    })
  }

  async create(consultorioId: number, dto: CreatePlantillaDto) {
    if (dto.horaFin <= dto.horaInicio) {
      throw new BadRequestException('horaFin debe ser mayor que horaInicio')
    }
    const repetida = await this.prisma.plantillaHorario.findFirst({
      where: { consultorioId, deletedAt: null, nombre: { equals: dto.nombre, mode: 'insensitive' } },
    })
    if (repetida) throw new ConflictException('Ya existe una plantilla con ese nombre')
    return this.prisma.plantillaHorario.create({ data: { ...dto, consultorioId } })
  }

  async remove(consultorioId: number, id: number) {
    const plantilla = await this.prisma.plantillaHorario.findFirst({
      where: { id, consultorioId, deletedAt: null },
    })
    if (!plantilla) throw new NotFoundException('Plantilla no encontrada')
    return this.prisma.plantillaHorario.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
  }
}
