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

  // ISO 3166-1 alfa-2; si no viene, queda el default del schema (BO)
  @Matches(/^[A-Z]{2}$/, { message: 'pais debe ser codigo ISO de 2 letras' })
  @IsOptional()
  pais?: string

  @IsEmail() @IsOptional()
  email?: string

  // Token del link precargado: si viene, la reserva se asocia a ESE paciente
  // (mas confiable que el match por telefono)
  @IsString() @IsOptional() @MaxLength(40)
  token?: string
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

  // El portal no ofrece horas que ya pasaron: fechas previas a hoy quedan
  // vacias y hoy se corta a la hora actual del server (TZ del consultorio)
  private filtrarSlotsPasados(fecha: string, slots: string[]) {
    const ahora = new Date()
    const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`
    const dia = fecha.slice(0, 10)
    if (dia < hoy) return []
    if (dia > hoy) return slots
    const horaActual = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`
    return slots.filter((s) => s > horaActual)
  }

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
        select: {
          id: true, nombre: true, especialidad: true, colorAgenda: true,
          // Calendario f2: lista vacia = atiende todos los servicios
          servicios: { select: { id: true } },
        },
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
      doctores: doctores.map(({ servicios: s, ...d }) => ({
        ...d,
        servicioIds: s.map((x) => x.id),
      })),
      servicios,
    }
  }

  // Precarga del link con token opaco (?p=): devuelve SOLO los datos de
  // contacto del paciente dueno del token. El token es aleatorio (18 bytes),
  // no enumerable; 404 generico si no matchea.
  async prefill(slug: string, token: string) {
    const c = await this.consultorioPorSlug(slug)
    const paciente = await this.prisma.paciente.findFirst({
      where: { consultorioId: c.id, portalToken: token, deletedAt: null },
      select: { nombre: true, apellido: true, telefono: true, pais: true, email: true },
    })
    if (!paciente) throw new NotFoundException('Link no disponible')
    return paciente
  }

  async slots(slug: string, doctorId: number, servicioId: number, fecha: string) {
    const c = await this.consultorioPorSlug(slug)
    const servicio = await this.prisma.servicio.findFirst({
      where: { id: servicioId, consultorioId: c.id, activo: true },
    })
    if (!servicio) throw new NotFoundException('Servicio no encontrado')

    // Calendario f2: el doctor solo ofrece slots de sus servicios
    if (!(await this.doctores.atiendeServicio(doctorId, servicioId))) {
      return { slots: [] as string[], duracionMin: servicio.duracionMin, modo: 'no-atiende-servicio' }
    }

    const disp = await this.doctores.getDisponibilidad(c.id, doctorId, fecha, servicio.duracionMin)
    // Solo horas libres futuras: nada de citas ni nombres
    return {
      slots: this.filtrarSlotsPasados(fecha, disp.slots),
      duracionMin: servicio.duracionMin,
      modo: disp.modo ?? 'calendario',
    }
  }

  async reservar(slug: string, dto: ReservaPortalDto) {
    const c = await this.consultorioPorSlug(slug)

    // El slot debe seguir libre (la creacion revalida solape y horario igual)
    const servicio = await this.prisma.servicio.findFirst({
      where: { id: dto.servicioId, consultorioId: c.id, activo: true },
    })
    if (!servicio) throw new NotFoundException('Servicio no encontrado')
    if (!(await this.doctores.atiendeServicio(dto.doctorId, dto.servicioId))) {
      throw new ConflictException('Ese profesional no atiende el servicio elegido')
    }
    const disp = await this.doctores.getDisponibilidad(c.id, dto.doctorId, dto.fecha, servicio.duracionMin)
    if (!this.filtrarSlotsPasados(dto.fecha, disp.slots).includes(dto.hora)) {
      throw new ConflictException('Ese horario ya no esta disponible')
    }

    // Match de paciente: por token del link precargado si viene; si no, por
    // telefono (no se confirma ni revela si existia)
    let paciente = dto.token
      ? await this.prisma.paciente.findFirst({
          where: { consultorioId: c.id, portalToken: dto.token, deletedAt: null },
          select: { id: true },
        })
      : null

    // El token identifica al paciente con certeza: si corrigio sus datos en
    // el form, el kardex se sincroniza. Con match por telefono NO se pisa
    // nada (otra persona puede reservar con el telefono de un paciente).
    if (paciente) {
      await this.prisma.paciente.update({
        where: { id: paciente.id },
        data: {
          nombre: dto.nombre,
          apellido: dto.apellido,
          telefono: dto.telefono,
          ...(dto.pais && { pais: dto.pais }),
          ...(dto.email && { email: dto.email }),
        },
      })
    }

    if (!paciente) {
      paciente = await this.prisma.paciente.findFirst({
        where: { consultorioId: c.id, deletedAt: null, telefono: dto.telefono },
        select: { id: true },
      })
    }
    if (!paciente) {
      paciente = await this.prisma.paciente.create({
        data: {
          consultorioId: c.id,
          nombre: dto.nombre,
          apellido: dto.apellido,
          telefono: dto.telefono,
          pais: dto.pais,
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
