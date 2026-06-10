import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { transicionValida } from '@pos/types'
import { EstadoCita, Prisma } from '@prisma/client'
import { IsString, IsNotEmpty, IsOptional, IsISO8601, IsEnum } from 'class-validator'

export class CreateCitaDto {
  @IsString() @IsNotEmpty()
  pacienteId: string

  @IsString() @IsNotEmpty()
  doctorId: string

  @IsString() @IsNotEmpty()
  servicioId: string

  @IsISO8601()
  fechaHora: string

  @IsString() @IsOptional()
  notasSecretaria?: string
}

export class CambiarEstadoDto {
  @IsEnum(EstadoCita)
  estado: EstadoCita

  @IsString() @IsOptional()
  motivo?: string
}

@Injectable()
export class CitasService {
  constructor(private prisma: PrismaService) {}

  async findByFecha(consultorioId: string, fecha: string, doctorId?: string, hasta?: string) {
    // "fecha" es el dia calendario LOCAL del consultorio (server en el mismo
    // timezone para el MVP). Con rango UTC, una cita de las 21:00 local en
    // GMT-4 caia en el dia UTC siguiente y desaparecia de la agenda.
    // "hasta" (opcional, inclusive) habilita rangos: vista semanal.
    const inicio = new Date(`${fecha}T00:00:00`)
    const finDia = new Date(`${hasta ?? fecha}T00:00:00`)
    const fin = new Date(finDia.getTime() + 24 * 60 * 60 * 1000 - 1)

    return this.prisma.cita.findMany({
      where: {
        consultorioId,
        deletedAt: null,
        fechaHora: { gte: inicio, lte: fin },
        ...(doctorId && { doctorId }),
      },
      include: {
        paciente: { select: { id: true, nombre: true, apellido: true, whatsapp: true, deudaTotal: true } },
        doctor: { select: { id: true, nombre: true, colorAgenda: true } },
        servicio: { select: { id: true, nombre: true, precioBase: true, duracionMin: true } },
        cobro: { select: { id: true, total: true, saldoPendiente: true, estado: true } },
      },
      orderBy: { fechaHora: 'asc' },
    })
  }

  async create(consultorioId: string, usuarioId: string, dto: CreateCitaDto) {
    const servicio = await this.prisma.servicio.findFirst({
      where: { id: dto.servicioId, consultorioId },
    })
    if (!servicio) throw new NotFoundException('Servicio no encontrado')

    const fechaHora = new Date(dto.fechaHora)
    const fechaFin = new Date(fechaHora.getTime() + servicio.duracionMin * 60 * 1000)

    await this.verificarDisponibilidad(consultorioId, dto.doctorId, fechaHora, fechaFin)

    const cita = await this.prisma.cita.create({
      data: {
        consultorioId,
        pacienteId: dto.pacienteId,
        doctorId: dto.doctorId,
        servicioId: dto.servicioId,
        fechaHora,
        duracionMin: servicio.duracionMin,
        notasSecretaria: dto.notasSecretaria,
        createdById: usuarioId,
      },
      include: {
        paciente: { select: { nombre: true, apellido: true } },
        doctor: { select: { nombre: true } },
        servicio: { select: { nombre: true, precioBase: true } },
      },
    })

    // Crear cobro pendiente asociado a la cita
    await this.prisma.cobro.create({
      data: {
        citaId: cita.id,
        consultorioId,
        total: servicio.precioBase,
        saldoPendiente: servicio.precioBase,
      },
    })

    return cita
  }

  async cambiarEstado(
    consultorioId: string,
    citaId: string,
    dto: CambiarEstadoDto,
    usuarioId: string,
  ) {
    const cita = await this.prisma.cita.findFirst({
      where: { id: citaId, consultorioId, deletedAt: null },
      include: { cobro: { select: { saldoPendiente: true } } },
    })
    if (!cita) throw new NotFoundException('Cita no encontrada')

    if (!transicionValida(cita.estado, dto.estado)) {
      throw new BadRequestException(
        `Transicion invalida: ${cita.estado} -> ${dto.estado}`,
      )
    }

    // COBRADO solo lo alcanza registrarPago cuando el saldo llega a cero;
    // marcarlo a mano con saldo pendiente dejaria la cita fuera de Deudores
    // con plata sin cobrar.
    if (
      dto.estado === EstadoCita.COBRADO &&
      cita.cobro &&
      cita.cobro.saldoPendiente.gt(0)
    ) {
      throw new BadRequestException(
        'El cobro tiene saldo pendiente: registre el pago en lugar de marcar Cobrado',
      )
    }

    const citaActualizada = await this.prisma.$transaction(async (tx) => {
      const actualizada = await tx.cita.update({
        where: { id: citaId },
        data: { estado: dto.estado },
      })

      // La deuda del paciente nace cuando el servicio fue prestado (ATENDIDA).
      // La maquina de estados garantiza que ATENDIDA se alcanza una sola vez.
      if (dto.estado === EstadoCita.ATENDIDA && cita.cobro) {
        await tx.paciente.update({
          where: { id: cita.pacienteId },
          data: { deudaTotal: { increment: cita.cobro.saldoPendiente } },
        })
      }

      await tx.log.create({
        data: {
          consultorioId,
          usuarioId,
          entidad: 'Cita',
          entidadId: citaId,
          accion: 'STATE_CHANGE',
          payloadAntes: { estado: cita.estado },
          payloadDespues: { estado: dto.estado, motivo: dto.motivo },
        },
      })

      return actualizada
    })

    return citaActualizada
  }

  private async verificarDisponibilidad(
    consultorioId: string,
    doctorId: string,
    inicio: Date,
    fin: Date,
    excludeCitaId?: string,
  ) {
    // El fin de cada cita existente depende de su duracion, que Prisma no
    // puede sumar en el where: traemos las candidatas de una ventana acotada
    // y verificamos el solapamiento real (inicioA < finB && finA > inicioB).
    const VENTANA_MS = 12 * 60 * 60 * 1000 // ninguna cita dura mas de 12h
    const candidatas = await this.prisma.cita.findMany({
      where: {
        consultorioId,
        doctorId,
        deletedAt: null,
        estado: { notIn: [EstadoCita.CANCELADA, EstadoCita.NO_ASISTIO] },
        id: excludeCitaId ? { not: excludeCitaId } : undefined,
        fechaHora: {
          lt: fin,
          gte: new Date(inicio.getTime() - VENTANA_MS),
        },
      } as Prisma.CitaWhereInput,
      select: { fechaHora: true, duracionMin: true },
    })

    const conflicto = candidatas.some((c) => {
      const finExistente = new Date(c.fechaHora.getTime() + c.duracionMin * 60 * 1000)
      return c.fechaHora < fin && finExistente > inicio
    })

    if (conflicto) {
      throw new ConflictException('El doctor ya tiene una cita en ese horario')
    }
  }
}
