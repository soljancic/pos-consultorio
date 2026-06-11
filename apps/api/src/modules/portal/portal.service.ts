import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { IsInt, IsISO8601, IsString, IsNotEmpty, IsOptional, IsEmail, Matches, MaxLength } from 'class-validator'
import { OrigenCita, Rol } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { CitasService } from '../citas/citas.service'
import { DoctoresService } from '../doctores/doctores.service'

export class ReservaPortalDto {
  @IsInt()
  doctorId: number

  @IsInt()
  servicioId: number

  @IsISO8601()
  fecha: string

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'hora debe ser HH:mm' })
  hora: string

  @IsString() @IsNotEmpty() @MaxLength(60)
  nombre: string

  @IsString() @IsNotEmpty() @MaxLength(60)
  apellido: string

  @IsString() @IsNotEmpty() @MaxLength(30)
  telefono: string

  @IsEmail() @IsOptional()
  email?: string
}

// Portal publico de reservas (E2.5b). REGLA CRITICA: el consultorioId se
// deriva SIEMPRE del slug en el server; las respuestas no exponen datos de
// pacientes ni de la agenda (solo horas libres).
@Injectable()
export class PortalService {
  constructor(
    private prisma: PrismaService,
    private citas: CitasService,
    private doctores: DoctoresService,
  ) {}

  private async consultorioPorSlug(slug: string) {
    const consultorio = await this.prisma.consultorio.findUnique({ where: { slug } })
    if (!consultorio || !consultorio.activo || !consultorio.portalActivo) {
      throw new NotFoundException('Portal no disponible')
    }
    return consultorio
  }

  async info(slug: string) {
    const c = await this.consultorioPorSlug(slug)
    const [doctores, servicios] = await Promise.all([
      this.prisma.doctor.findMany({
        where: { consultorioId: c.id, activo: true },
        select: { id: true, nombre: true, especialidad: true, colorAgenda: true },
        orderBy: { nombre: 'asc' },
      }),
      this.prisma.servicio.findMany({
        where: { consultorioId: c.id, activo: true },
        select: { id: true, nombre: true, duracionMin: true },
        orderBy: { nombre: 'asc' },
      }),
    ])
    return {
      consultorio: { nombre: c.nombre, logoUrl: c.logoUrl },
      doctores,
      servicios,
    }
  }

  async slots(slug: string, doctorId: number, servicioId: number, fecha: string) {
    const c = await this.consultorioPorSlug(slug)
    const servicio = await this.prisma.servicio.findFirst({
      where: { id: servicioId, consultorioId: c.id, activo: true },
    })
    if (!servicio) throw new NotFoundException('Servicio no encontrado')

    const disp = await this.doctores.getDisponibilidad(c.id, doctorId, fecha, servicio.duracionMin)
    // Solo horas libres: nada de citas ni nombres
    return { slots: disp.slots, duracionMin: servicio.duracionMin, modo: disp.modo ?? 'calendario' }
  }

  async reservar(slug: string, dto: ReservaPortalDto) {
    const c = await this.consultorioPorSlug(slug)

    // El slot debe seguir libre (la creacion revalida solape y horario igual)
    const servicio = await this.prisma.servicio.findFirst({
      where: { id: dto.servicioId, consultorioId: c.id, activo: true },
    })
    if (!servicio) throw new NotFoundException('Servicio no encontrado')
    const disp = await this.doctores.getDisponibilidad(c.id, dto.doctorId, dto.fecha, servicio.duracionMin)
    if (!disp.slots.includes(dto.hora)) {
      throw new ConflictException('Ese horario ya no esta disponible')
    }

    // Match de paciente por telefono (no se confirma ni revela si existia)
    let paciente = await this.prisma.paciente.findFirst({
      where: {
        consultorioId: c.id,
        deletedAt: null,
        OR: [{ telefono: dto.telefono }, { whatsapp: dto.telefono }],
      },
      select: { id: true },
    })
    if (!paciente) {
      paciente = await this.prisma.paciente.create({
        data: {
          consultorioId: c.id,
          nombre: dto.nombre,
          apellido: dto.apellido,
          telefono: dto.telefono,
          email: dto.email,
        },
        select: { id: true },
      })
    }

    // La cita necesita un createdBy: se atribuye al primer ADMIN del tenant
    const admin = await this.prisma.usuario.findFirst({
      where: { consultorioId: c.id, rol: Rol.ADMIN, activo: true },
      orderBy: { id: 'asc' },
      select: { id: true },
    })
    if (!admin) throw new NotFoundException('Portal no disponible')

    const fechaHora = new Date(`${dto.fecha.slice(0, 10)}T${dto.hora}:00`).toISOString()
    const cita = await this.citas.create(
      c.id,
      admin.id,
      {
        pacienteId: paciente.id,
        doctorId: dto.doctorId,
        servicioId: dto.servicioId,
        fechaHora,
        notasSecretaria: 'Reserva del portal',
      },
      OrigenCita.PORTAL,
    )

    // Confirmacion minima, sin ids internos de mas
    return {
      reservada: true,
      fecha: dto.fecha.slice(0, 10),
      hora: dto.hora,
      doctor: cita.doctor?.nombre,
      servicio: cita.servicio?.nombre,
    }
  }
}
