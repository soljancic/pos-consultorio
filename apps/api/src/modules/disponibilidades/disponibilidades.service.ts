import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common'
import {
  IsInt, IsString, IsOptional, IsEnum, IsISO8601, Matches, IsArray, Min, Max,
} from 'class-validator'
import { TipoDisponibilidad, Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/
const MAX_OCURRENCIAS = 400 // tope de materializacion (~1 anio L-V)

export class CreateDisponibilidadDto {
  @IsInt()
  doctorId: number

  // Dia calendario (YYYY-MM-DD); con repeticion es el inicio de la serie
  @IsISO8601()
  fecha: string

  @Matches(HORA_REGEX, { message: 'horaInicio debe ser HH:mm' })
  horaInicio: string

  @Matches(HORA_REGEX, { message: 'horaFin debe ser HH:mm' })
  horaFin: string

  @IsEnum(TipoDisponibilidad) @IsOptional()
  tipo?: TipoDisponibilidad

  @IsString() @IsOptional()
  nota?: string

  // Repeticion semanal (opcional): dias 0=domingo..6=sabado + fecha limite
  @IsArray() @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) @IsOptional()
  repetirDiasSemana?: number[]

  @IsISO8601() @IsOptional()
  repetirHasta?: string
}

export class UpdateDisponibilidadDto {
  @Matches(HORA_REGEX, { message: 'horaInicio debe ser HH:mm' }) @IsOptional()
  horaInicio?: string

  @Matches(HORA_REGEX, { message: 'horaFin debe ser HH:mm' }) @IsOptional()
  horaFin?: string

  @IsEnum(TipoDisponibilidad) @IsOptional()
  tipo?: TipoDisponibilidad

  @IsString() @IsOptional()
  nota?: string
}

export type Alcance = 'uno' | 'serie' | 'desde'

function claveDia(fecha: string) {
  return new Date(`${fecha.slice(0, 10)}T00:00:00Z`)
}

// Solape de rangos "HH:mm" (zero-padded: comparacion lexicografica es valida)
function seSolapan(aIni: string, aFin: string, bIni: string, bFin: string) {
  return aIni < bFin && aFin > bIni
}

@Injectable()
export class DisponibilidadesService {
  constructor(private prisma: PrismaService) {}

  findAll(consultorioId: number, desde: string, hasta: string, doctorId?: number) {
    return this.prisma.disponibilidad.findMany({
      where: {
        consultorioId,
        deletedAt: null,
        fecha: { gte: claveDia(desde), lte: claveDia(hasta) },
        ...(doctorId && { doctorId }),
      },
      orderBy: [{ fecha: 'asc' }, { horaInicio: 'asc' }],
    })
  }

  async create(consultorioId: number, usuarioId: number, dto: CreateDisponibilidadDto) {
    if (dto.horaInicio >= dto.horaFin) {
      throw new BadRequestException('horaInicio debe ser anterior a horaFin')
    }
    const doctor = await this.prisma.doctor.findFirst({
      where: { id: dto.doctorId, consultorioId },
    })
    if (!doctor) throw new NotFoundException('Doctor no encontrado')

    const tipo = dto.tipo ?? TipoDisponibilidad.DISPONIBLE
    const esSerie = !!dto.repetirDiasSemana?.length

    // Fechas a materializar
    let fechas: Date[]
    if (esSerie) {
      if (!dto.repetirHasta) {
        throw new BadRequestException('La repeticion requiere una fecha limite (repetirHasta)')
      }
      const desde = claveDia(dto.fecha)
      const hasta = claveDia(dto.repetirHasta)
      if (hasta < desde) throw new BadRequestException('repetirHasta es anterior al inicio')
      fechas = []
      for (let d = new Date(desde); d <= hasta; d = new Date(d.getTime() + 86_400_000)) {
        if (dto.repetirDiasSemana!.includes(d.getUTCDay())) fechas.push(new Date(d))
        if (fechas.length > MAX_OCURRENCIAS) {
          throw new BadRequestException(`La serie supera el maximo de ${MAX_OCURRENCIAS} ocurrencias`)
        }
      }
      if (fechas.length === 0) {
        throw new BadRequestException('La serie no genera ninguna ocurrencia en el rango')
      }
    } else {
      fechas = [claveDia(dto.fecha)]
    }

    // Solapes contra los bloques existentes del doctor en el rango
    const existentes = await this.prisma.disponibilidad.findMany({
      where: {
        consultorioId,
        doctorId: dto.doctorId,
        deletedAt: null,
        fecha: { gte: fechas[0], lte: fechas[fechas.length - 1] },
      },
      select: { fecha: true, horaInicio: true, horaFin: true },
    })
    const porDia = new Map<number, { horaInicio: string; horaFin: string }[]>()
    for (const e of existentes) {
      const k = e.fecha.getTime()
      if (!porDia.has(k)) porDia.set(k, [])
      porDia.get(k)!.push(e)
    }
    for (const f of fechas) {
      const conflicto = (porDia.get(f.getTime()) ?? []).some((e) =>
        seSolapan(dto.horaInicio, dto.horaFin, e.horaInicio, e.horaFin),
      )
      if (conflicto) {
        throw new ConflictException(
          `El doctor ya tiene un bloque que se cruza el ${f.toISOString().slice(0, 10)}`,
        )
      }
    }

    return this.prisma.$transaction(async (tx) => {
      let serieId: number | undefined
      if (esSerie) {
        const serie = await tx.serieDisponibilidad.create({
          data: {
            consultorioId,
            doctorId: dto.doctorId,
            diasSemana: dto.repetirDiasSemana!,
            desde: fechas[0],
            hasta: claveDia(dto.repetirHasta!),
            horaInicio: dto.horaInicio,
            horaFin: dto.horaFin,
            tipo,
            nota: dto.nota,
          },
        })
        serieId = serie.id
      }

      await tx.disponibilidad.createMany({
        data: fechas.map((fecha) => ({
          consultorioId,
          doctorId: dto.doctorId,
          fecha,
          horaInicio: dto.horaInicio,
          horaFin: dto.horaFin,
          tipo,
          nota: dto.nota,
          serieId,
        })),
      })

      await tx.log.create({
        data: {
          consultorioId,
          usuarioId,
          entidad: 'Disponibilidad',
          entidadId: serieId ?? 0,
          accion: 'CREATE',
          payloadDespues: {
            doctorId: dto.doctorId,
            tipo,
            horario: `${dto.horaInicio}-${dto.horaFin}`,
            ocurrencias: fechas.length,
            ...(esSerie && { diasSemana: dto.repetirDiasSemana, hasta: dto.repetirHasta }),
          },
        },
      })

      return { serieId: serieId ?? null, ocurrencias: fechas.length }
    })
  }

  // Alcance: uno (solo este bloque), serie (todas sus ocurrencias),
  // desde (esta fecha en adelante). Solo cambia horas/tipo/nota; cambiar los
  // dias de la semana es recrear la serie.
  async update(
    consultorioId: number,
    id: number,
    usuarioId: number,
    dto: UpdateDisponibilidadDto,
    alcance: Alcance = 'uno',
  ) {
    const disp = await this.disponibilidadDelTenant(consultorioId, id)
    const horaInicio = dto.horaInicio ?? disp.horaInicio
    const horaFin = dto.horaFin ?? disp.horaFin
    if (horaInicio >= horaFin) {
      throw new BadRequestException('horaInicio debe ser anterior a horaFin')
    }

    const where = this.whereAlcance(disp, alcance)
    const data = {
      ...(dto.horaInicio !== undefined && { horaInicio: dto.horaInicio }),
      ...(dto.horaFin !== undefined && { horaFin: dto.horaFin }),
      ...(dto.tipo !== undefined && { tipo: dto.tipo }),
      ...(dto.nota !== undefined && { nota: dto.nota }),
    }

    const resultado = await this.prisma.$transaction(async (tx) => {
      const res = await tx.disponibilidad.updateMany({ where, data })
      await tx.log.create({
        data: {
          consultorioId,
          usuarioId,
          entidad: 'Disponibilidad',
          entidadId: id,
          accion: 'UPDATE',
          payloadAntes: { horario: `${disp.horaInicio}-${disp.horaFin}`, tipo: disp.tipo, alcance },
          payloadDespues: { ...data, afectadas: res.count },
        },
      })
      return res
    })

    return { actualizadas: resultado.count }
  }

  async remove(consultorioId: number, id: number, usuarioId: number, alcance: Alcance = 'uno') {
    const disp = await this.disponibilidadDelTenant(consultorioId, id)
    const where = this.whereAlcance(disp, alcance)

    const resultado = await this.prisma.$transaction(async (tx) => {
      const res = await tx.disponibilidad.updateMany({
        where,
        data: { deletedAt: new Date() },
      })
      await tx.log.create({
        data: {
          consultorioId,
          usuarioId,
          entidad: 'Disponibilidad',
          entidadId: id,
          accion: 'DELETE',
          payloadAntes: {
            doctorId: disp.doctorId,
            horario: `${disp.horaInicio}-${disp.horaFin}`,
            alcance,
            afectadas: res.count,
          },
        },
      })
      return res
    })

    return { eliminadas: resultado.count }
  }

  private async disponibilidadDelTenant(consultorioId: number, id: number) {
    const disp = await this.prisma.disponibilidad.findFirst({
      where: { id, consultorioId, deletedAt: null },
    })
    if (!disp) throw new NotFoundException('Disponibilidad no encontrada')
    return disp
  }

  private whereAlcance(
    disp: { id: number; serieId: number | null; fecha: Date },
    alcance: Alcance,
  ): Prisma.DisponibilidadWhereInput {
    if (alcance === 'uno' || !disp.serieId) return { id: disp.id }
    if (alcance === 'serie') return { serieId: disp.serieId, deletedAt: null }
    return { serieId: disp.serieId, deletedAt: null, fecha: { gte: disp.fecha } }
  }
}
