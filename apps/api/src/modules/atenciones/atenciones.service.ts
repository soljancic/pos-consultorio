import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { IsString, IsOptional, IsISO8601 } from 'class-validator'
import { PrismaService } from '../../prisma/prisma.service'
import { EstadoCita } from '@prisma/client'

export class UpsertAtencionDto {
  @IsString() @IsOptional()
  motivo?: string

  @IsString() @IsOptional()
  diagnostico?: string

  @IsString() @IsOptional()
  tratamiento?: string

  @IsString() @IsOptional()
  evolucion?: string

  @IsISO8601() @IsOptional()
  proximoControl?: string
}

// La atencion solo se registra cuando el servicio se esta prestando o ya se presto
const ESTADOS_ATENDIBLES: EstadoCita[] = [
  EstadoCita.EN_ATENCION,
  EstadoCita.ATENDIDA,
  EstadoCita.COBRADO,
  EstadoCita.CON_DEUDA,
]

@Injectable()
export class AtencionesService {
  constructor(private prisma: PrismaService) {}

  async findByCita(consultorioId: number, citaId: number) {
    const atencion = await this.prisma.atencion.findFirst({
      where: { citaId, cita: { consultorioId, deletedAt: null } },
    })
    if (!atencion) throw new NotFoundException('La cita no tiene atencion registrada')
    return atencion
  }

  async upsert(consultorioId: number, citaId: number, dto: UpsertAtencionDto, usuarioId: number) {
    const cita = await this.prisma.cita.findFirst({
      where: { id: citaId, consultorioId, deletedAt: null },
      include: { atencion: true },
    })
    if (!cita) throw new NotFoundException('Cita no encontrada')
    if (!ESTADOS_ATENDIBLES.includes(cita.estado)) {
      throw new BadRequestException(
        `No se puede registrar atencion en una cita ${cita.estado}`,
      )
    }

    const data = {
      motivo: dto.motivo,
      diagnostico: dto.diagnostico,
      tratamiento: dto.tratamiento,
      evolucion: dto.evolucion,
      proximoControl: dto.proximoControl ? new Date(dto.proximoControl) : null,
    }

    const [atencion] = await this.prisma.$transaction([
      this.prisma.atencion.upsert({
        where: { citaId },
        create: { citaId, ...data },
        update: data,
      }),
      this.prisma.log.create({
        data: {
          consultorioId,
          usuarioId,
          entidad: 'Atencion',
          entidadId: citaId,
          accion: cita.atencion ? 'UPDATE' : 'CREATE',
          payloadAntes: cita.atencion
            ? { diagnostico: cita.atencion.diagnostico, tratamiento: cita.atencion.tratamiento }
            : undefined,
          payloadDespues: { diagnostico: dto.diagnostico, tratamiento: dto.tratamiento },
        },
      }),
    ])

    return atencion
  }
}
