import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

export class CreateDoctorDto {
  nombre: string
  especialidad?: string
  colorAgenda?: string
  usuarioId?: string
}

export class CreateHorarioDto {
  diaSemana: number
  horaInicio: string
  horaFin: string
}

@Injectable()
export class DoctoresService {
  constructor(private prisma: PrismaService) {}

  findAll(consultorioId: string) {
    return this.prisma.doctor.findMany({
      where: { consultorioId, activo: true },
      include: { horarios: { where: { activo: true }, orderBy: { diaSemana: 'asc' } } },
      orderBy: { nombre: 'asc' },
    })
  }

  create(consultorioId: string, dto: CreateDoctorDto) {
    return this.prisma.doctor.create({ data: { ...dto, consultorioId } })
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
