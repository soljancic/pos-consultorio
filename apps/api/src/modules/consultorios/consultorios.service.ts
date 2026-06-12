import { Injectable, ConflictException } from '@nestjs/common'
import { IsString, IsOptional, IsBoolean, Matches, MaxLength } from 'class-validator'
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

  // Portal publico (E2.5b): /reservar/:slug
  @Matches(/^[a-z0-9-]{3,40}$/, { message: 'slug: minusculas, numeros y guiones (3-40)' })
  @IsOptional()
  slug?: string

  @IsBoolean() @IsOptional()
  portalActivo?: boolean

  // E3 item 26: plantillas de WhatsApp ({nombre} {hora} {fecha} {monto} {consultorio})
  @IsString() @IsOptional() @MaxLength(400)
  msjRecordatorio?: string

  @IsString() @IsOptional() @MaxLength(400)
  msjDeuda?: string

  @IsString() @IsOptional() @MaxLength(400)
  msjContacto?: string
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
  slug: true,
  portalActivo: true,
  msjRecordatorio: true,
  msjDeuda: true,
  msjContacto: true,
} as const

@Injectable()
export class ConsultoriosService {
  constructor(private prisma: PrismaService) {}

  async findOne(id: number) {
    return this.prisma.consultorio.findUnique({
      where: { id },
      select: CONSULTORIO_SELECT,
    })
  }

  async update(id: number, data: UpdateConsultorioDto) {
    if (data.slug) {
      const tomado = await this.prisma.consultorio.findFirst({
        where: { slug: data.slug, id: { not: id } },
        select: { id: true },
      })
      if (tomado) throw new ConflictException('Ese slug ya esta en uso')
    }
    return this.prisma.consultorio.update({
      where: { id },
      data,
      select: CONSULTORIO_SELECT,
    })
  }
}
