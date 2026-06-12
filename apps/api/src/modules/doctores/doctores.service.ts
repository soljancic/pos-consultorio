import { Injectable, NotFoundException } from '@nestjs/common'
import { IsString, IsNotEmpty, IsOptional, IsInt, IsNumber, Min, Max, IsBoolean, Matches, IsArray } from 'class-validator'
import { PartialType } from '@nestjs/swagger'
import { EstadoCita, TipoDisponibilidad } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

export class CreateDoctorDto {
  @IsString() @IsNotEmpty()
  nombre: string

  @IsString() @IsOptional()
  especialidad?: string

  // E4 item 21: % de comision sobre pagos netos (0-100)
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) @IsOptional()
  comisionPct?: number

  @IsString() @IsOptional()
  colorAgenda?: string

  @IsString() @IsOptional()
  usuarioId?: number
}

export class UpdateDoctorDto extends PartialType(CreateDoctorDto) {
  @IsBoolean() @IsOptional()
  activo?: boolean
}

// Calendario f2: que servicios atiende el doctor. Lista vacia = todos.
export class SetServiciosDto {
  @IsArray() @IsInt({ each: true })
  servicioIds: number[]
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

  findAll(consultorioId: number, incluirInactivos = false) {
    return this.prisma.doctor.findMany({
      where: { consultorioId, ...(incluirInactivos ? {} : { activo: true }) },
      include: {
        horarios: { where: { activo: true }, orderBy: { diaSemana: 'asc' } },
        servicios: { select: { id: true } },
      },
      orderBy: { nombre: 'asc' },
    })
  }

  // Calendario f2: set completo de servicios del doctor (sin lista = todos)
  async setServicios(consultorioId: number, doctorId: number, servicioIds: number[]) {
    const doctor = await this.prisma.doctor.findFirst({ where: { id: doctorId, consultorioId } })
    if (!doctor) throw new NotFoundException('Doctor no encontrado')

    // Solo servicios del propio tenant
    const validos = await this.prisma.servicio.findMany({
      where: { id: { in: servicioIds }, consultorioId },
      select: { id: true },
    })
    return this.prisma.doctor.update({
      where: { id: doctorId },
      data: { servicios: { set: validos.map((s) => ({ id: s.id })) } },
      include: { servicios: { select: { id: true, nombre: true } } },
    })
  }

  // true si el doctor atiende ese servicio (sin lista asignada = atiende todos)
  async atiendeServicio(doctorId: number, servicioId: number) {
    const total = await this.prisma.servicio.count({ where: { doctores: { some: { id: doctorId } } } })
    if (total === 0) return true
    const match = await this.prisma.servicio.count({
      where: { id: servicioId, doctores: { some: { id: doctorId } } },
    })
    return match > 0
  }

  create(consultorioId: number, dto: CreateDoctorDto) {
    return this.prisma.doctor.create({ data: { ...dto, consultorioId } })
  }

  async update(consultorioId: number, id: number, dto: UpdateDoctorDto) {
    const d = await this.prisma.doctor.findFirst({ where: { id, consultorioId } })
    if (!d) throw new NotFoundException()
    return this.prisma.doctor.update({ where: { id }, data: dto })
  }

  async addHorario(consultorioId: number, doctorId: number, dto: CreateHorarioDto) {
    const doctor = await this.prisma.doctor.findFirst({ where: { id: doctorId, consultorioId } })
    if (!doctor) throw new NotFoundException()
    return this.prisma.horarioAtencion.create({ data: { ...dto, doctorId } })
  }

  // Reescrito sobre el Calendario de Atencion (E2.5a): slots concretos a
  // partir de los bloques DISPONIBLE del dia, descontando citas reales y
  // bloqueos. Base del portal publico de agendamiento (E2.5b).
  async getDisponibilidad(
    consultorioId: number,
    doctorId: number,
    fecha: string,
    duracionMin = 30,
  ) {
    const doctor = await this.prisma.doctor.findFirst({
      where: { id: doctorId, consultorioId },
    })
    if (!doctor) throw new NotFoundException('Doctor no encontrado')

    const clave = new Date(`${fecha.slice(0, 10)}T00:00:00Z`)
    const bloquesDia = await this.prisma.disponibilidad.findMany({
      where: { consultorioId, doctorId, fecha: clave, deletedAt: null },
      orderBy: { horaInicio: 'asc' },
    })
    const disponibles = bloquesDia.filter((b) => b.tipo === TipoDisponibilidad.DISPONIBLE)
    const bloqueos = bloquesDia.filter((b) => b.tipo !== TipoDisponibilidad.DISPONIBLE)

    if (disponibles.length === 0) {
      const tieneCalendario = await this.prisma.disponibilidad.count({
        where: { consultorioId, doctorId, deletedAt: null, tipo: TipoDisponibilidad.DISPONIBLE },
      })
      // sin-calendario = modo legacy: las citas internas se aceptan igual,
      // pero no hay slots que ofrecer (el portal exigira calendario)
      return {
        disponible: false,
        slots: [] as string[],
        modo: tieneCalendario > 0 ? 'sin-horario-ese-dia' : 'sin-calendario',
      }
    }

    // Citas reales del dia LOCAL (canceladas/no-show liberan el lugar)
    const inicioLocal = new Date(`${fecha.slice(0, 10)}T00:00:00`)
    const finLocal = new Date(inicioLocal.getTime() + 86_400_000)
    const citas = await this.prisma.cita.findMany({
      where: {
        consultorioId,
        doctorId,
        deletedAt: null,
        estado: { notIn: [EstadoCita.CANCELADA, EstadoCita.NO_ASISTIO] },
        fechaHora: { gte: inicioLocal, lt: finLocal },
      },
      select: { fechaHora: true, duracionMin: true },
    })

    const aMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
    const aHHMM = (m: number) =>
      `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

    const ocupados: Array<[number, number]> = [
      ...citas.map((c): [number, number] => {
        const ini = c.fechaHora.getHours() * 60 + c.fechaHora.getMinutes()
        return [ini, ini + c.duracionMin]
      }),
      ...bloqueos.map((b): [number, number] => [aMin(b.horaInicio), aMin(b.horaFin)]),
    ]

    const slots: string[] = []
    for (const b of disponibles) {
      for (let t = aMin(b.horaInicio); t + duracionMin <= aMin(b.horaFin); t += duracionMin) {
        const fin = t + duracionMin
        const choca = ocupados.some(([oIni, oFin]) => t < oFin && fin > oIni)
        if (!choca) slots.push(aHHMM(t))
      }
    }

    return { disponible: slots.length > 0, slots, duracionMin, modo: 'calendario' }
  }
}
