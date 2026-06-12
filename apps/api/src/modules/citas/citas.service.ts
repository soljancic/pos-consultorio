import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { transicionValida } from '@pos/types'
import { EstadoCita, EstadoCobro, OrigenCita, TipoDisponibilidad, Prisma } from '@prisma/client'
import { IsString, IsInt, IsOptional, IsISO8601, IsEnum } from 'class-validator'

export class CreateCitaDto {
  @IsInt()
  pacienteId: number

  @IsInt()
  doctorId: number

  @IsInt()
  servicioId: number

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

export class ReprogramarCitaDto {
  @IsISO8601()
  fechaHora: string

  @IsInt() @IsOptional()
  doctorId?: number

  @IsString() @IsOptional()
  notasSecretaria?: string
}

// Estados que dejan el cobro sin efecto: el servicio no se presto
const ESTADOS_ANULAN_COBRO: EstadoCita[] = [EstadoCita.CANCELADA, EstadoCita.NO_ASISTIO]

// E3 item 11: con esta cantidad de no-shows el paciente queda marcado
// requierePrepago automaticamente (override por env)
const NO_SHOWS_PARA_PREPAGO = Number(process.env.NO_SHOWS_PREPAGO ?? 3)

// Una cita ya en curso o cerrada no se mueve de horario
const ESTADOS_REPROGRAMABLES: EstadoCita[] = [
  EstadoCita.PENDIENTE,
  EstadoCita.CONFIRMADA,
  EstadoCita.LLEGO,
]

@Injectable()
export class CitasService {
  constructor(private prisma: PrismaService) {}

  async findByFecha(
    consultorioId: number,
    fecha: string,
    doctorId?: number,
    hasta?: string,
    rol?: string,
    usuarioId?: number,
  ) {
    // E2-M4: la agenda del rol DOCTOR se fuerza en el backend (su doctor
    // vinculado via Doctor.usuarioId); el filtro de la UI era solo UX.
    if (rol === 'DOCTOR' && usuarioId) {
      const propio = await this.prisma.doctor.findFirst({
        where: { consultorioId, usuarioId },
        select: { id: true },
      })
      doctorId = propio?.id ?? -1 // sin doctor vinculado: agenda vacia
    }

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
        paciente: { select: { id: true, nombre: true, apellido: true, telefono: true, pais: true, deudaTotal: true } },
        doctor: { select: { id: true, nombre: true, colorAgenda: true } },
        servicio: { select: { id: true, nombre: true, precioBase: true, duracionMin: true } },
        cobro: { select: { id: true, total: true, saldoPendiente: true, estado: true } },
      },
      orderBy: { fechaHora: 'asc' },
    })
  }

  async create(
    consultorioId: number,
    usuarioId: number,
    dto: CreateCitaDto,
    origen: OrigenCita = OrigenCita.INTERNO,
  ) {
    const servicio = await this.prisma.servicio.findFirst({
      where: { id: dto.servicioId, consultorioId },
    })
    if (!servicio) throw new NotFoundException('Servicio no encontrado')

    const fechaHora = new Date(dto.fechaHora)
    const fechaFin = new Date(fechaHora.getTime() + servicio.duracionMin * 60 * 1000)

    await this.verificarDisponibilidad(consultorioId, dto.doctorId, fechaHora, fechaFin)
    await this.verificarHorarioAtencion(consultorioId, dto.doctorId, fechaHora, fechaFin)

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
        origen,
        // Las reservas del portal nacen SOLICITADA: la secretaria revisa los
        // datos y las acepta (PENDIENTE) o las cancela. Las manuales no.
        estado: origen === OrigenCita.PORTAL ? EstadoCita.SOLICITADA : EstadoCita.PENDIENTE,
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
    consultorioId: number,
    citaId: number,
    dto: CambiarEstadoDto,
    usuarioId: number,
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

    // Cancelar/no-asistio con pagos registrados requiere anular los pagos
    // primero (asiento de reversa, E2-M1): el dinero ya entro a la caja.
    if (ESTADOS_ANULAN_COBRO.includes(dto.estado)) {
      const pagos = await this.prisma.pago.count({ where: { cobro: { citaId } } })
      if (pagos > 0) {
        throw new ConflictException(
          'La cita tiene pagos registrados: anule los pagos antes de cancelarla',
        )
      }
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

      // El cobro de una cita cancelada/no-show no es deuda ni cuenta abierta
      if (ESTADOS_ANULAN_COBRO.includes(dto.estado) && cita.cobro) {
        await tx.cobro.update({
          where: { citaId },
          data: { estado: EstadoCobro.ANULADO },
        })
      }

      // Reabrir (CANCELADA/NO_ASISTIO -> PENDIENTE) revive el cobro
      if (
        dto.estado === EstadoCita.PENDIENTE &&
        ESTADOS_ANULAN_COBRO.includes(cita.estado) &&
        cita.cobro
      ) {
        await tx.cobro.update({
          where: { citaId },
          data: { estado: EstadoCobro.PENDIENTE },
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

      // E3 item 11: al tercer no-show el paciente queda marcado con
      // requierePrepago (alerta al agendar; NO bloquea, regla del proyecto)
      if (dto.estado === EstadoCita.NO_ASISTIO) {
        const noShows = await tx.cita.count({
          where: {
            pacienteId: cita.pacienteId,
            consultorioId,
            deletedAt: null,
            estado: EstadoCita.NO_ASISTIO,
          },
        })
        if (noShows >= NO_SHOWS_PARA_PREPAGO) {
          const paciente = await tx.paciente.findUnique({
            where: { id: cita.pacienteId },
            select: { requierePrepago: true },
          })
          if (paciente && !paciente.requierePrepago) {
            await tx.paciente.update({
              where: { id: cita.pacienteId },
              data: { requierePrepago: true },
            })
            await tx.log.create({
              data: {
                consultorioId,
                usuarioId,
                entidad: 'Paciente',
                entidadId: cita.pacienteId,
                accion: 'UPDATE',
                payloadDespues: { requierePrepago: true, motivo: `${noShows} inasistencias` },
              },
            })
          }
        }
      }

      return actualizada
    })

    return citaActualizada
  }

  // E3: barrido de citas vencidas — PENDIENTE/CONFIRMADA cuya hora paso hace
  // mas de NO_SHOW_GRACIA_HORAS se marcan NO_ASISTIO (mismo camino que el
  // boton manual: anula cobros sin pagos, loggea y alimenta el contador).
  // Lo dispara el cron y tambien POST /citas/no-shows/procesar (ADMIN).
  async procesarNoShows(consultorioId?: number) {
    const gracia = Number(process.env.NO_SHOW_GRACIA_HORAS ?? 2)
    const limite = new Date(Date.now() - gracia * 3600 * 1000)
    const vencidas = await this.prisma.cita.findMany({
      where: {
        ...(consultorioId && { consultorioId }),
        deletedAt: null,
        estado: { in: [EstadoCita.PENDIENTE, EstadoCita.CONFIRMADA] },
        fechaHora: { lt: limite },
      },
      select: { id: true, consultorioId: true, createdById: true },
      take: 200,
    })

    let procesadas = 0
    for (const cita of vencidas) {
      try {
        // El log queda a nombre de quien agendo (no hay usuario "sistema")
        await this.cambiarEstado(
          cita.consultorioId,
          cita.id,
          { estado: EstadoCita.NO_ASISTIO, motivo: 'Auto: no se presento' },
          cita.createdById,
        )
        procesadas += 1
      } catch {
        // Con pagos registrados u otra condicion el barrido no fuerza nada:
        // queda para revision manual
      }
    }
    return { procesadas, revisadas: vencidas.length }
  }

  // Reprogramar = editar fecha/hora/doctor en el lugar (decision owner
  // 2026-06-10): la cita conserva su id y su cobro; el cambio queda en logs.
  async reprogramar(
    consultorioId: number,
    citaId: number,
    dto: ReprogramarCitaDto,
    usuarioId: number,
  ) {
    const cita = await this.prisma.cita.findFirst({
      where: { id: citaId, consultorioId, deletedAt: null },
    })
    if (!cita) throw new NotFoundException('Cita no encontrada')
    if (!ESTADOS_REPROGRAMABLES.includes(cita.estado)) {
      throw new BadRequestException(
        `No se puede reprogramar una cita en estado ${cita.estado}`,
      )
    }

    const doctorId = dto.doctorId ?? cita.doctorId
    const fechaHora = new Date(dto.fechaHora)
    const fechaFin = new Date(fechaHora.getTime() + cita.duracionMin * 60 * 1000)
    await this.verificarDisponibilidad(consultorioId, doctorId, fechaHora, fechaFin, citaId)
    await this.verificarHorarioAtencion(consultorioId, doctorId, fechaHora, fechaFin)

    return this.prisma.$transaction(async (tx) => {
      const actualizada = await tx.cita.update({
        where: { id: citaId },
        data: {
          fechaHora,
          doctorId,
          // la cita movida vuelve a PENDIENTE: hay que re-confirmar con el paciente
          estado: EstadoCita.PENDIENTE,
          ...(dto.notasSecretaria !== undefined && { notasSecretaria: dto.notasSecretaria }),
        },
      })

      await tx.log.create({
        data: {
          consultorioId,
          usuarioId,
          entidad: 'Cita',
          entidadId: citaId,
          accion: 'UPDATE',
          payloadAntes: {
            fechaHora: cita.fechaHora.toISOString(),
            doctorId: cita.doctorId,
            estado: cita.estado,
          },
          payloadDespues: {
            fechaHora: fechaHora.toISOString(),
            doctorId,
            estado: EstadoCita.PENDIENTE,
            motivo: 'reprogramacion',
          },
        },
      })

      return actualizada
    })
  }

  // Calendario de Atencion (E2.5a): bloqueos siempre rechazan; si el doctor
  // tiene horarios DISPONIBLE configurados, la cita debe caer dentro de uno.
  // Doctor sin calendario = modo legacy (acepta cualquier horario).
  private async verificarHorarioAtencion(
    consultorioId: number,
    doctorId: number,
    inicio: Date,
    fin: Date,
  ) {
    // Dia calendario LOCAL del negocio → clave @db.Date (UTC midnight)
    const diaStr = `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}-${String(inicio.getDate()).padStart(2, '0')}`
    const clave = new Date(`${diaStr}T00:00:00Z`)
    const hhmm = (d: Date) =>
      `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    const iniStr = hhmm(inicio)
    const finStr = hhmm(fin)

    const bloquesDia = await this.prisma.disponibilidad.findMany({
      where: { consultorioId, doctorId, fecha: clave, deletedAt: null },
      select: { tipo: true, horaInicio: true, horaFin: true },
    })

    const bloqueo = bloquesDia.find(
      (b) =>
        b.tipo !== TipoDisponibilidad.DISPONIBLE &&
        iniStr < b.horaFin &&
        finStr > b.horaInicio,
    )
    if (bloqueo) {
      throw new ConflictException(
        `El doctor tiene un bloqueo (${bloqueo.tipo}) en ese horario`,
      )
    }

    const tieneCalendario = await this.prisma.disponibilidad.count({
      where: { consultorioId, doctorId, deletedAt: null, tipo: TipoDisponibilidad.DISPONIBLE },
    })
    if (tieneCalendario === 0) return

    const dentro = bloquesDia.some(
      (b) =>
        b.tipo === TipoDisponibilidad.DISPONIBLE &&
        b.horaInicio <= iniStr &&
        b.horaFin >= finStr,
    )
    if (!dentro) {
      throw new BadRequestException('La cita esta fuera del horario de atencion del doctor')
    }
  }

  private async verificarDisponibilidad(
    consultorioId: number,
    doctorId: number,
    inicio: Date,
    fin: Date,
    excludeCitaId?: number,
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
