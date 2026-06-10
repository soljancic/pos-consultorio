import { Injectable, NotFoundException } from '@nestjs/common'
import { IsString, IsNotEmpty, IsOptional, IsInt, Min, Max, IsBoolean, Matches } from 'class-validator'
import { PartialType } from '@nestjs/swagger'
import { PrismaService } from '../../prisma/prisma.service'

export class CreateDoctorDto {
  @IsString() @IsNotEmpty()
  nombre: string

  @IsString() @IsOptional()
  especialidad?: string

  @IsString() @IsOptional()
  colorAgenda?: string

  @IsString() @IsOptional()
  usuarioId?: string
}

export class UpdateDoctorDto extends PartialType(CreateDoctorDto) {
  @IsBoolean() @IsOptional()
  activo?: boolean
}

export class CreateHorarioDto {
  @IsInt() @Min(0) @Max(6)
  diaSemana: number

  @Matches(/^\d{2}:\d{2}$/)
  horaInicio: string

  @Matches(/^\d{2}:\d{2}$/)
  horaFin: string
}

@Injectable()
export class DoctoresService {
  constructor(private prisma: PrismaService) {}

  findAll(consultorioId: string, incluirInactivos = false) {
    return this.prisma.doctor.findMany({
      where: { consultorioId, ...(incluirInactivos ? {} : { activo: true }) },
      include: { horarios: { where: { activo: true }, orderBy: { diaSemana: 'asc' } } },
      orderBy: { nombre: 'asc' },
    })
  }

  create(consultorioId: string, dto: CreateDoctorDto) {
    return this.prisma.doctor.create({ data: { ...dto, consultorioId } })
  }

  async update(consultorioId: string, id: string, dto: UpdateDoctorDto) {
    const d = await this.prisma.doctor.findFirst({ where: { id, consultorioId } })
    if (!d) throw new NotFoundException()
    return this.prisma.doctor.update({ where: { id }, data: dto })
  }

  async addHorario(consultorioId: string, doctorId: string, dto: CreateHorarioDto) {
    const doctor = await this.prisma.doctor.findFirst({ where: { id: doctorId, consultorioId } })
    if (!doctor) throw new NotFoundException()
    return this.prisma.horarioAtencion.create({ data: { ...dto, doctorId } })
  }

  async getDisponibilidad(consultorioId: string, doctorId: string, fecha: string) {
    const doctor = await this.prisma.doctor.findFirst({
      where: { id: doctorId, consultorioId },
      include: { horarios: { where: { activo: true } } },
    })
    if (!doctor) throw new NotFoundException()

    const date = new Date(fecha)
    const diaSemana = date.getDay()
    const horario = doctor.horarios.find((h) => h.diaSemana === diaSemana)
    if (!horario) return { disponible: false, slots: [] }

    const citasDelDia = await this.prisma.cita.findMany({
      where: {
        consultorioId,
        doctorId,
        deletedAt: null,
        fechaHora: {
          gte: new Date(`${fecha}T${horario.horaInicio}`),
          lte: new Date(`${fecha}T${horario.horaFin}`),
        },
      },
      select: { fechaHora: true, duracionMin: true },
    })

    return { disponible: true, horario, citasOcupadas: citasDelDia }
  }
}
