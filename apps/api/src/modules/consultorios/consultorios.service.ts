import { Injectable } from '@nestjs/common'
import { IsString, IsOptional } from 'class-validator'
import { PrismaService } from '../../prisma/prisma.service'

export class UpdateConsultorioDto {
  @IsString() @IsOptional()
  nombre?: string

  @IsString() @IsOptional()
  logoUrl?: string

  @IsString() @IsOptional()
  telefono?: string

  @IsString() @IsOptional()
  direccion?: string

  @IsString() @IsOptional()
  moneda?: string

  @IsString() @IsOptional()
  timezone?: string
}

const CONSULTORIO_SELECT = {
  id: true,
  nombre: true,
  logoUrl: true,
  telefono: true,
  direccion: true,
  moneda: true,
  timezone: true,
  plan: true,
} as const

@Injectable()
export class ConsultoriosService {
  constructor(private prisma: PrismaService) {}

  async findOne(id: string) {
    return this.prisma.consultorio.findUnique({
      where: { id },
      select: CONSULTORIO_SELECT,
    })
  }

  async update(id: string, data: UpdateConsultorioDto) {
    return this.prisma.consultorio.update({
      where: { id },
      data,
      select: CONSULTORIO_SELECT,
    })
  }
}
