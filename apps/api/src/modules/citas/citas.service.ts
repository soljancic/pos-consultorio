import { randomBytes } from 'crypto'
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { MailService } from '../mail/mail.service'
import { NotificacionesService } from '../notificaciones/notificaciones.service'
import { transicionValida } from '@pos/types'
import { descontarStockDeCobro, restituirStockDeCobro } from '../cobros/stock.helper'
import { EstadoCita, EstadoCobro, EstadoLiquidacion, OrigenCita, TipoDisponibilidad, Prisma, TipoNotificacion } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { IsString, IsInt, IsOptional, IsISO8601, IsEnum, IsBoolean } from 'class-validator'

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

  // Cita manual: enviar al paciente el email de confirmacion. El front lo
  // marca por defecto si la cita es a futuro (>1h) y lo desmarca para
  // walk-ins (<=1h). Sin email del paciente, el envio simplemente no ocurre.
  @IsBoolean() @IsOptional()
  enviarConfirmacion?: boolean

  // Cobertura: usar el seguro del paciente en esta cita. La aseguradora/categoria
  // se toman del paciente (no del body). codigoSeguro override opcional.
  @IsBoolean() @IsOptional()
  usaSeguro?: boolean

  @IsString() @IsOptional()
  codigoSeguro?: string
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

  // Cambio de servicio al reprogramar: recalcula duracion y cobro
  @IsInt() @IsOptional()
  servicioId?: number

  @IsString() @IsOptional()
  notasSecretaria?: string
}

export class EditarCitaDto {
  @IsInt() @IsOptional()
  servicioId?: number

  @IsBoolean() @IsOptional()
  usaSeguro?: boolean

  @IsString() @IsOptional()
  codigoSeguro?: string
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

// Citas en las que aun se puede editar servicio / cobertura
const ESTADOS_EDITABLES: EstadoCita[] = [
  EstadoCita.PENDIENTE,
  EstadoCita.CONFIRMADA,
  EstadoCita.LLEGO,
  EstadoCita.EN_ATENCION,
  EstadoCita.ATENDIDA,
]

// El portal permite mover citas aun en SOLICITADA (link reusable); no LLEGO
// (el paciente ya esta en el consultorio).
const ESTADOS_REPROGRAMABLES_PORTAL: EstadoCita[] = [
  EstadoCita.PENDIENTE,
  EstadoCita.CONFIRMADA,
  EstadoCita.SOLICITADA,
]

// El paciente puede cancelar desde el link mientras la cita siga "viva":
// los mismos estados que admiten reprogramacion por el portal.
const ESTADOS_CANCELABLES_PORTAL = ESTADOS_REPROGRAMABLES_PORTAL

@Injectable()
export class CitasService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private notificaciones: NotificacionesService,
  ) {}

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

    // Cargar el consultorio para saber si trabaja con aseguradoras
    const consultorio = await this.prisma.consultorio.findUnique({
      where: { id: consultorioId },
      select: { trabajaConAseguradoras: true },
    })

    // Cargar el paciente para datos de seguro
    const paciente = await this.prisma.paciente.findFirst({
      where: { id: dto.pacienteId, consultorioId },
      select: { tieneSeguro: true, aseguradoraId: true, categoriaSeguroId: true, codigoSeguro: true },
    })
    if (!paciente) throw new NotFoundException('Paciente no encontrado')

    // Precio particular base (override del doctor o precioBase del servicio)
    const override = await this.prisma.doctorServicioPrecio.findUnique({
      where: { doctorId_servicioId: { doctorId: dto.doctorId, servicioId: dto.servicioId } },
      select: { precio: true },
    })
    const precioParticular = override?.precio ?? servicio.precioBase

    // ¿corresponde usar seguro? requiere flag on + consultorio + paciente con seguro + tarifa
    let cobertura: {
      categoriaSeguroId: number; aseguradoraId: number;
      montoPaciente: Prisma.Decimal; montoAseguradora: Prisma.Decimal; codigoSeguro: string | null
    } | null = null

    if (dto.usaSeguro && consultorio?.trabajaConAseguradoras && paciente.tieneSeguro && paciente.categoriaSeguroId && paciente.aseguradoraId) {
      const tarifa = await this.prisma.tarifaCobertura.findFirst({
        where: { consultorioId, categoriaSeguroId: paciente.categoriaSeguroId, servicioId: dto.servicioId, activa: true },
        select: { montoPaciente: true, montoAseguradora: true },
      })
      if (tarifa) {
        cobertura = {
          categoriaSeguroId: paciente.categoriaSeguroId,
          aseguradoraId: paciente.aseguradoraId,
          montoPaciente: tarifa.montoPaciente,
          montoAseguradora: tarifa.montoAseguradora,
          codigoSeguro: dto.codigoSeguro ?? paciente.codigoSeguro ?? null,
        }
      }
      // sin tarifa => fallback particular (cobertura queda null)
    }

    const totalCobro = cobertura ? cobertura.montoPaciente : precioParticular

    const cita = await this.prisma.$transaction(async (tx) => {
      const c = await tx.cita.create({
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
          ...(cobertura ? {
            usaSeguro: true,
            categoriaSeguroId: cobertura.categoriaSeguroId,
            montoPaciente: cobertura.montoPaciente,
            montoAseguradora: cobertura.montoAseguradora,
            codigoSeguro: cobertura.codigoSeguro,
          } : {}),
        },
        include: {
          paciente: { select: { nombre: true, apellido: true } },
          doctor: { select: { nombre: true } },
          servicio: { select: { nombre: true, precioBase: true } },
        },
      })

      await tx.cobro.create({
        data: {
          citaId: c.id,
          consultorioId,
          total: totalCobro,
          saldoPendiente: totalCobro,
          // El servicio se guarda como linea del cobro: asi SUM(detalles) = bruto
          // (servicio + productos) y el descuento/venta mixta quedan consistentes.
          // Tambien habilita a futuro varios servicios por visita.
          detalles: {
            create: {
              consultorioId,
              servicioId: dto.servicioId,
              descripcion: c.servicio.nombre,
              cantidad: 1,
              precioVenta: totalCobro,
              precioCosto: 0,
              subtotal: totalCobro,
            },
          },
        },
      })

      if (cobertura && cobertura.montoAseguradora.gt(0)) {
        await tx.liquidacionItem.create({
          data: {
            consultorioId,
            citaId: c.id,
            aseguradoraId: cobertura.aseguradoraId,
            categoriaSeguroId: cobertura.categoriaSeguroId,
            pacienteId: dto.pacienteId,
            servicioId: dto.servicioId,
            fecha: fechaHora,
            montoAseguradora: cobertura.montoAseguradora,
            codigoSeguro: cobertura.codigoSeguro,
          },
        })
      }

      return c
    })

    // Centro de notificaciones: una reserva del portal (SOLICITADA) avisa a la
    // bandeja admin. Fire-and-forget: nunca bloquea la creacion de la cita.
    if (origen === OrigenCita.PORTAL) {
      void this.notificaciones.emitirEventoCita(
        consultorioId,
        cita.id,
        TipoNotificacion.NUEVA_CITA,
        { admin: true, doctor: false },
      )
    }

    // Cita manual con confirmacion pedida: avisamos al paciente por email
    // (mismo correo que la aceptacion del portal). Fire-and-forget: nunca
    // bloquea la creacion; si el paciente no tiene email, no envia nada.
    if (origen === OrigenCita.INTERNO && dto.enviarConfirmacion) {
      void this.notificarReservaAceptada(cita.id)
    }

    return cita
  }

  // Datos comunes que necesitan los emails de cita (confirmacion /
  // reprogramacion / cancelacion).
  private datosEmailCita(citaId: number) {
    return this.prisma.cita.findUnique({
      where: { id: citaId },
      include: {
        paciente: { select: { nombre: true, email: true } },
        doctor: { select: { nombre: true } },
        servicio: { select: { nombre: true, duracionMin: true } },
        consultorio: {
          select: {
            nombre: true, direccion: true, telefono: true, slug: true,
            timezone: true, ubicacionUrl: true, pais: true,
          },
        },
      },
    })
  }

  // Fecha/hora en la zona horaria del consultorio (no la del server)
  private fechaHoraLocal(d: Date, tz: string) {
    const f = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz })
    return {
      fecha: f.charAt(0).toUpperCase() + f.slice(1),
      hora: d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }),
    }
  }

  // Email de confirmacion ('confirmada') o de reprogramacion ('reprogramada')
  // al paciente, con un .ics adjunto para agregar la cita al calendario.
  // Privado y tolerante: sin email cargado no hace nada.
  private async notificarReservaAceptada(
    citaId: number,
    modo: 'confirmada' | 'reprogramada' = 'confirmada',
  ) {
    const cita = await this.datosEmailCita(citaId)
    if (!cita?.paciente.email) return

    // El email ofrece reprogramar/cancelar por link: aseguramos un token opaco
    // (perezoso, igual que tokenReprogramacion) si la cita aun no tenia uno.
    let token = cita.portalToken
    if (!token && cita.consultorio.slug) {
      token = randomBytes(18).toString('base64url')
      await this.prisma.cita.update({ where: { id: citaId }, data: { portalToken: token } })
    }

    const { fecha, hora } = this.fechaHoraLocal(cita.fechaHora, cita.consultorio.timezone)

    const ics = this.mail.buildICS({
      citaId: cita.id,
      consultorio: cita.consultorio.nombre,
      servicio: cita.servicio.nombre,
      doctor: cita.doctor.nombre,
      inicio: cita.fechaHora,
      duracionMin: cita.duracionMin,
      direccion: cita.consultorio.direccion,
      ubicacionUrl: cita.consultorio.ubicacionUrl,
      attendeeEmail: cita.paciente.email,
      attendeeNombre: cita.paciente.nombre,
      // al reprogramar subimos SEQUENCE para que el calendario actualice el evento
      secuencia: modo === 'reprogramada' ? 1 : 0,
    })

    await this.mail.enviar(
      cita.paciente.email,
      modo === 'reprogramada'
        ? `Tu cita en ${cita.consultorio.nombre} fue reprogramada`
        : `Tu cita en ${cita.consultorio.nombre} está confirmada`,
      this.mail.htmlReservaAceptada({
        nombre: cita.paciente.nombre,
        consultorio: cita.consultorio.nombre,
        direccion: cita.consultorio.direccion,
        telefono: cita.consultorio.telefono,
        ubicacionUrl: cita.consultorio.ubicacionUrl,
        pais: cita.consultorio.pais,
        fecha,
        hora,
        servicio: cita.servicio.nombre,
        doctor: cita.doctor.nombre,
        slug: cita.consultorio.slug,
        token,
        modo,
      }),
      cita.consultorio.nombre,
      [{ filename: 'invite.ics', content: Buffer.from(ics, 'utf-8'), contentType: 'text/calendar; charset=utf-8; method=REQUEST' }],
    )
  }

  // Aviso al paciente de que su cita se cancelo (consultorio o portal). Sin
  // .ics (la version simple no remueve el evento del calendario).
  private async notificarCitaCancelada(citaId: number) {
    const cita = await this.datosEmailCita(citaId)
    if (!cita?.paciente.email) return
    const { fecha, hora } = this.fechaHoraLocal(cita.fechaHora, cita.consultorio.timezone)
    await this.mail.enviar(
      cita.paciente.email,
      `Tu cita en ${cita.consultorio.nombre} fue cancelada`,
      this.mail.htmlCitaCancelada({
        nombre: cita.paciente.nombre,
        consultorio: cita.consultorio.nombre,
        direccion: cita.consultorio.direccion,
        telefono: cita.consultorio.telefono,
        ubicacionUrl: cita.consultorio.ubicacionUrl,
        pais: cita.consultorio.pais,
        fecha,
        hora,
        servicio: cita.servicio.nombre,
        doctor: cita.doctor.nombre,
        slug: cita.consultorio.slug,
      }),
      cita.consultorio.nombre,
    )
  }

  async cambiarEstado(
    consultorioId: number,
    citaId: number,
    dto: CambiarEstadoDto,
    usuarioId: number,
  ) {
    const cita = await this.prisma.cita.findFirst({
      where: { id: citaId, consultorioId, deletedAt: null },
      include: {
        cobro: { select: { saldoPendiente: true, estado: true } },
        liquidacion: { select: { id: true, estado: true } },
      },
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

    // Prepago total: al atender, si el cobro ya esta saldado, la cita queda
    // COBRADO directo (no hay nada que cobrar al terminar la atencion).
    const estadoFinal =
      dto.estado === EstadoCita.ATENDIDA && cita.cobro?.estado === EstadoCobro.COMPLETO
        ? EstadoCita.COBRADO
        : dto.estado

    const citaActualizada = await this.prisma.$transaction(async (tx) => {
      const actualizada = await tx.cita.update({
        where: { id: citaId },
        data: { estado: estadoFinal },
      })

      // La deuda del paciente nace cuando el servicio fue prestado (ATENDIDA).
      // La maquina de estados garantiza que ATENDIDA se alcanza una sola vez.
      if (dto.estado === EstadoCita.ATENDIDA && cita.cobro) {
        await tx.paciente.update({
          where: { id: cita.pacienteId },
          data: { deudaTotal: { increment: cita.cobro.saldoPendiente } },
        })
      }

      // Confirmacion de venta con productos: al salir de ATENDIDA hacia
      // COBRADO/CON_DEUDA se descuenta el stock de las lineas de producto.
      if (
        cita.estado === EstadoCita.ATENDIDA &&
        (estadoFinal === EstadoCita.COBRADO || estadoFinal === EstadoCita.CON_DEUDA) &&
        cita.cobro
      ) {
        const cobroRow = await tx.cobro.findUnique({ where: { citaId }, select: { id: true } })
        if (cobroRow) await descontarStockDeCobro(tx, consultorioId, cobroRow.id, usuarioId)
      }

      // El cobro de una cita cancelada/no-show no es deuda ni cuenta abierta
      if (ESTADOS_ANULAN_COBRO.includes(dto.estado) && cita.cobro) {
        await tx.cobro.update({
          where: { citaId },
          data: { estado: EstadoCobro.ANULADO },
        })
      }

      // Reabrir (CANCELADA/NO_ASISTIO -> PENDIENTE) revive el cobro segun los
      // pagos vivos: si quedo plata retenida, el saldo sigue reducido.
      if (
        dto.estado === EstadoCita.PENDIENTE &&
        ESTADOS_ANULAN_COBRO.includes(cita.estado) &&
        cita.cobro
      ) {
        const total = await tx.cobro.findUnique({
          where: { citaId }, select: { total: true, saldoPendiente: true },
        })
        const estadoCobro = !total
          ? EstadoCobro.PENDIENTE
          : total.saldoPendiente.lte(0)
            ? EstadoCobro.COMPLETO
            : total.saldoPendiente.lt(total.total)
              ? EstadoCobro.PARCIAL
              : EstadoCobro.PENDIENTE
        await tx.cobro.update({ where: { citaId }, data: { estado: estadoCobro } })
        // Reabrir restituye el stock que se habia descontado al confirmar
        const cobroReabrir = await tx.cobro.findUnique({ where: { citaId }, select: { id: true } })
        if (cobroReabrir) await restituirStockDeCobro(tx, consultorioId, cobroReabrir.id, usuarioId)
      }

      // Al cancelar: si hay LiquidacionItem PENDIENTE, eliminarlo (el servicio
      // no se presto; no se factura a la aseguradora). Si ya esta FACTURADO o
      // PAGADO (caso de borde: no deberia ocurrir en un flujo normal) se deja
      // intacto y se registra en el log para revision manual.
      if (dto.estado === EstadoCita.CANCELADA && cita.liquidacion) {
        if (cita.liquidacion.estado === EstadoLiquidacion.PENDIENTE) {
          await tx.liquidacionItem.delete({ where: { id: cita.liquidacion.id } })
        } else {
          await tx.log.create({
            data: {
              consultorioId,
              usuarioId,
              entidad: 'LiquidacionItem',
              entidadId: cita.liquidacion.id,
              accion: 'UPDATE',
              payloadDespues: {
                motivo: 'cancelacion con liquidacion no-PENDIENTE',
                estado: cita.liquidacion.estado,
                citaId,
              },
            },
          })
        }
      }

      // Solo auditamos los cambios de estado con valor de auditoria: cancelacion
      // y no-show. Las transiciones de rutina (confirmar, llego, en atencion,
      // atendida, cobrado, etc.) NO se loguean para no inflar la actividad sin
      // aportar nada. La reprogramacion tiene su propio log en reprogramar().
      if (dto.estado === EstadoCita.CANCELADA || dto.estado === EstadoCita.NO_ASISTIO) {
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
      }

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

    // Centro de notificaciones (fire-and-forget): cancelacion avisa a admin +
    // doctor de la cita; "llego" avisa solo al doctor (paciente en espera).
    if (dto.estado === EstadoCita.CANCELADA) {
      void this.notificaciones.emitirEventoCita(
        consultorioId,
        citaId,
        TipoNotificacion.CITA_CANCELADA,
        { admin: true, doctor: true },
      )
      // Aviso al paciente por email (fire-and-forget)
      void this.notificarCitaCancelada(citaId)
    } else if (dto.estado === EstadoCita.LLEGO) {
      void this.notificaciones.emitirEventoCita(
        consultorioId,
        citaId,
        TipoNotificacion.PACIENTE_EN_ESPERA,
        { admin: false, doctor: true },
      )
    }

    // Reserva del portal aceptada (SOLICITADA -> PENDIENTE): se avisa al
    // paciente por email. Fire-and-forget: el envio nunca bloquea ni rompe
    // el cambio de estado (MailService loguea sus propios errores).
    if (cita.estado === EstadoCita.SOLICITADA && dto.estado === EstadoCita.PENDIENTE) {
      void this.notificarReservaAceptada(citaId)
    }

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
      include: {
        cobro: true,
        liquidacion: { select: { id: true, estado: true, aseguradoraId: true } },
      },
    })
    if (!cita) throw new NotFoundException('Cita no encontrada')
    if (!ESTADOS_REPROGRAMABLES.includes(cita.estado)) {
      throw new BadRequestException(
        `No se puede reprogramar una cita en estado ${cita.estado}`,
      )
    }

    // Cambio de servicio (decision owner 2026-06-12): nueva duracion y el
    // cobro se recalcula al precio del nuevo servicio respetando lo pagado
    const servicioNuevo =
      dto.servicioId && dto.servicioId !== cita.servicioId
        ? await this.prisma.servicio.findFirst({
            where: { id: dto.servicioId, consultorioId, activo: true },
          })
        : null
    if (dto.servicioId && dto.servicioId !== cita.servicioId && !servicioNuevo) {
      throw new NotFoundException('Servicio no encontrado')
    }

    const doctorId = dto.doctorId ?? cita.doctorId
    const duracionMin = servicioNuevo?.duracionMin ?? cita.duracionMin
    const fechaHora = new Date(dto.fechaHora)
    const fechaFin = new Date(fechaHora.getTime() + duracionMin * 60 * 1000)
    await this.verificarDisponibilidad(consultorioId, doctorId, fechaHora, fechaFin, citaId)
    await this.verificarHorarioAtencion(consultorioId, doctorId, fechaHora, fechaFin)

    // Al cambiar de servicio el cobro se recalcula al precio override del doctor
    // para el servicio nuevo (si existe); si no, al precioBase del servicio
    let precioServicioNuevo = servicioNuevo?.precioBase ?? null
    if (servicioNuevo) {
      const ov = await this.prisma.doctorServicioPrecio.findUnique({
        where: { doctorId_servicioId: { doctorId, servicioId: servicioNuevo.id } },
        select: { precio: true },
      })
      if (ov) precioServicioNuevo = ov.precio
    }

    // Si la cita usa seguro y hay cambio de servicio, necesitamos el aseguradoraId
    // del paciente para poder crear un nuevo LiquidacionItem si no habia uno previo.
    let pacienteAseguradoraId: number | null = null
    if (servicioNuevo && cita.usaSeguro) {
      const pac = await this.prisma.paciente.findUnique({
        where: { id: cita.pacienteId },
        select: { aseguradoraId: true },
      })
      pacienteAseguradoraId = pac?.aseguradoraId ?? null
    }

    const reprogramada = await this.prisma.$transaction(async (tx) => {
      const actualizada = await tx.cita.update({
        where: { id: citaId },
        data: {
          fechaHora,
          doctorId,
          // la cita movida vuelve a PENDIENTE: hay que re-confirmar con el paciente
          estado: EstadoCita.PENDIENTE,
          ...(servicioNuevo && {
            servicioId: servicioNuevo.id,
            duracionMin: servicioNuevo.duracionMin,
          }),
          ...(dto.notasSecretaria !== undefined && { notasSecretaria: dto.notasSecretaria }),
        },
      })

      if (servicioNuevo && cita.cobro && cita.cobro.estado !== EstadoCobro.ANULADO) {
        if (cita.usaSeguro && cita.categoriaSeguroId) {
          // Cita con seguro: buscar tarifa para la nueva combinacion categoria + servicio
          const tarifa = await tx.tarifaCobertura.findFirst({
            where: {
              consultorioId,
              categoriaSeguroId: cita.categoriaSeguroId,
              servicioId: servicioNuevo.id,
              activa: true,
            },
            select: { montoPaciente: true, montoAseguradora: true },
          })

          if (tarifa) {
            // Tarifa encontrada: recalcular con montos de cobertura
            const pagado = cita.cobro.total.minus(cita.cobro.saldoPendiente)
            const nuevoSaldo = tarifa.montoPaciente.minus(pagado)
            if (nuevoSaldo.lt(0)) {
              throw new BadRequestException(
                'Los pagos registrados superan el precio del nuevo servicio: anule pagos antes de cambiarlo',
              )
            }
            await tx.cobro.update({
              where: { citaId },
              data: { total: tarifa.montoPaciente, saldoPendiente: nuevoSaldo },
            })
            // Actualizar snapshot de cobertura en la cita
            await tx.cita.update({
              where: { id: citaId },
              data: {
                montoPaciente: tarifa.montoPaciente,
                montoAseguradora: tarifa.montoAseguradora,
              },
            })
            // Upsert o delete del LiquidacionItem segun montoAseguradora
            if (tarifa.montoAseguradora.gt(0)) {
              if (cita.liquidacion) {
                await tx.liquidacionItem.update({
                  where: { id: cita.liquidacion.id },
                  data: {
                    montoAseguradora: tarifa.montoAseguradora,
                    servicioId: servicioNuevo.id,
                    fecha: fechaHora,
                  },
                })
              } else if (pacienteAseguradoraId) {
                // No habia item previo (montoAseguradora era 0 en la creacion): crear
                await tx.liquidacionItem.create({
                  data: {
                    consultorioId,
                    citaId,
                    aseguradoraId: pacienteAseguradoraId,
                    categoriaSeguroId: cita.categoriaSeguroId,
                    pacienteId: cita.pacienteId,
                    servicioId: servicioNuevo.id,
                    fecha: fechaHora,
                    montoAseguradora: tarifa.montoAseguradora,
                    codigoSeguro: cita.codigoSeguro,
                  },
                })
              }
            } else if (cita.liquidacion) {
              // Nueva tarifa tiene montoAseguradora=0: eliminar el item existente
              await tx.liquidacionItem.delete({ where: { id: cita.liquidacion.id } })
            }
          } else {
            // Sin tarifa para el nuevo servicio: revertir a particular
            const pagado = cita.cobro.total.minus(cita.cobro.saldoPendiente)
            const nuevoSaldo = precioServicioNuevo!.minus(pagado)
            if (nuevoSaldo.lt(0)) {
              throw new BadRequestException(
                'Los pagos registrados superan el precio del nuevo servicio: anule pagos antes de cambiarlo',
              )
            }
            await tx.cobro.update({
              where: { citaId },
              data: { total: precioServicioNuevo!, saldoPendiente: nuevoSaldo },
            })
            // Limpiar snapshot de seguro en la cita
            await tx.cita.update({
              where: { id: citaId },
              data: {
                usaSeguro: false,
                categoriaSeguroId: null,
                codigoSeguro: null,
                montoPaciente: null,
                montoAseguradora: null,
              },
            })
            // Eliminar LiquidacionItem si existe
            if (cita.liquidacion) {
              await tx.liquidacionItem.delete({ where: { id: cita.liquidacion.id } })
            }
          }
        } else {
          // Cita particular: logica original inalterada
          const pagado = cita.cobro.total.minus(cita.cobro.saldoPendiente)
          const nuevoSaldo = precioServicioNuevo!.minus(pagado)
          if (nuevoSaldo.lt(0)) {
            throw new BadRequestException(
              'Los pagos registrados superan el precio del nuevo servicio: anule pagos antes de cambiarlo',
            )
          }
          await tx.cobro.update({
            where: { citaId },
            data: { total: precioServicioNuevo!, saldoPendiente: nuevoSaldo },
          })
        }
      }

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
            servicioId: cita.servicioId,
            estado: cita.estado,
          },
          payloadDespues: {
            fechaHora: fechaHora.toISOString(),
            doctorId,
            servicioId: servicioNuevo?.id ?? cita.servicioId,
            estado: EstadoCita.PENDIENTE,
            motivo: 'reprogramacion',
          },
        },
      })

      return actualizada
    })

    // Centro de notificaciones (fire-and-forget): reprogramacion avisa a admin +
    // doctor de la cita.
    void this.notificaciones.emitirEventoCita(
      consultorioId,
      citaId,
      TipoNotificacion.CITA_REPROGRAMADA,
      { admin: true, doctor: true },
    )

    // Aviso al paciente con la nueva fecha/hora + .ics actualizado
    void this.notificarReservaAceptada(citaId, 'reprogramada')

    return reprogramada
  }

  // Editar una cita antes del cobro: cambia servicio y/o prende-apaga el seguro,
  // recalculando el cobro en Modelo-A (actualiza la linea de servicio + total =
  // SUM(detalles vivos) - descuento, preservando productos), ajusta la deuda solo
  // en ATENDIDA y maneja el LiquidacionItem. Espeja la resolucion de cobertura de
  // create(). Los productos se editan aparte (PUT /cobros/:id/lineas).
  async editarCita(
    consultorioId: number,
    citaId: number,
    dto: EditarCitaDto,
    usuarioId: number,
  ) {
    const cita = await this.prisma.cita.findFirst({
      where: { id: citaId, consultorioId, deletedAt: null },
      include: {
        cobro: true,
        liquidacion: { select: { id: true, estado: true } },
        paciente: {
          select: {
            id: true, tieneSeguro: true, aseguradoraId: true,
            categoriaSeguroId: true, codigoSeguro: true,
          },
        },
      },
    })
    if (!cita) throw new NotFoundException('Cita no encontrada')
    if (!ESTADOS_EDITABLES.includes(cita.estado as EstadoCita)) {
      throw new BadRequestException(`No se puede editar una cita en estado ${cita.estado}`)
    }
    if (!cita.cobro || cita.cobro.estado === EstadoCobro.ANULADO) {
      throw new BadRequestException('El cobro de la cita no admite edicion')
    }

    // Servicio final (el del dto si cambia, si no el actual). Valida que exista.
    const cambiaServicio = dto.servicioId != null && dto.servicioId !== cita.servicioId
    const servicio = await this.prisma.servicio.findFirst({
      where: { id: cambiaServicio ? dto.servicioId! : cita.servicioId, consultorioId, ...(cambiaServicio && { activo: true }) },
      select: { id: true, nombre: true, precioBase: true, duracionMin: true },
    })
    if (!servicio) throw new NotFoundException('Servicio no encontrado')

    // Precio particular = override del doctor de la cita o precioBase
    const override = await this.prisma.doctorServicioPrecio.findUnique({
      where: { doctorId_servicioId: { doctorId: cita.doctorId, servicioId: servicio.id } },
      select: { precio: true },
    })
    const precioParticular = override?.precio ?? servicio.precioBase

    // Resolver cobertura segun el usaSeguro final
    const usaSeguroFinal = dto.usaSeguro ?? cita.usaSeguro
    let cobertura:
      | { categoriaSeguroId: number; aseguradoraId: number; montoPaciente: Decimal; montoAseguradora: Decimal; codigoSeguro: string | null }
      | null = null
    if (usaSeguroFinal) {
      const consultorio = await this.prisma.consultorio.findUnique({
        where: { id: consultorioId }, select: { trabajaConAseguradoras: true },
      })
      const p = cita.paciente
      if (!consultorio?.trabajaConAseguradoras || !p.tieneSeguro || !p.categoriaSeguroId || !p.aseguradoraId) {
        throw new BadRequestException('El paciente no tiene un seguro configurado para usar cobertura')
      }
      const tarifa = await this.prisma.tarifaCobertura.findFirst({
        where: { consultorioId, categoriaSeguroId: p.categoriaSeguroId, servicioId: servicio.id, activa: true },
        select: { montoPaciente: true, montoAseguradora: true },
      })
      if (!tarifa) {
        throw new BadRequestException('No hay tarifa de seguro para este servicio con la categoria del paciente')
      }
      cobertura = {
        categoriaSeguroId: p.categoriaSeguroId,
        aseguradoraId: p.aseguradoraId,
        montoPaciente: tarifa.montoPaciente,
        montoAseguradora: tarifa.montoAseguradora,
        codigoSeguro: dto.codigoSeguro ?? p.codigoSeguro ?? null,
      }
    }
    const servicioMonto = cobertura ? cobertura.montoPaciente : precioParticular

    const oldSaldo = cita.cobro.saldoPendiente
    const pagado = cita.cobro.total.minus(oldSaldo)
    const esAtendida = cita.estado === EstadoCita.ATENDIDA
    const cobroId = cita.cobro.id

    const fresco = await this.prisma.$transaction(async (tx) => {
      // 1. Actualizar (o crear, auto-heal de cobros legacy) la linea de servicio
      const lineaServicio = await tx.detalleCobro.findFirst({
        where: { cobroId, consultorioId, servicioId: { not: null } }, select: { id: true },
      })
      if (lineaServicio) {
        await tx.detalleCobro.update({
          where: { id: lineaServicio.id },
          data: { servicioId: servicio.id, descripcion: servicio.nombre, precioVenta: servicioMonto, subtotal: servicioMonto },
        })
      } else {
        await tx.detalleCobro.create({
          data: {
            consultorioId, cobroId, servicioId: servicio.id, descripcion: servicio.nombre,
            cantidad: 1, precioVenta: servicioMonto, precioCosto: 0, subtotal: servicioMonto,
          },
        })
      }

      // 2. Recomputar total = SUM(detalles vivos) - descuento (recortado al bruto)
      const agg = await tx.detalleCobro.aggregate({
        where: { cobroId, consultorioId, devueltoAt: null }, _sum: { subtotal: true },
      })
      const bruto = agg._sum.subtotal ?? new Decimal(0)
      const descuento = cita.cobro!.descuento.gt(bruto) ? bruto : cita.cobro!.descuento
      const nuevoTotal = bruto.minus(descuento)
      const nuevoSaldo = nuevoTotal.minus(pagado)
      if (nuevoSaldo.lt(0)) {
        throw new BadRequestException('Los pagos registrados superan el nuevo total: anule pagos antes de editar')
      }
      const nuevoEstadoCobro = nuevoSaldo.lte(0)
        ? EstadoCobro.COMPLETO
        : pagado.gt(0) ? EstadoCobro.PARCIAL : EstadoCobro.PENDIENTE
      await tx.cobro.update({
        where: { id: cobroId },
        data: { total: nuevoTotal, descuento, saldoPendiente: nuevoSaldo, estado: nuevoEstadoCobro },
      })

      // 3. Deuda del paciente: solo si la cita ya genero deuda (ATENDIDA)
      if (esAtendida) {
        const deltaSaldo = nuevoSaldo.minus(oldSaldo)
        if (!deltaSaldo.isZero()) {
          await tx.paciente.update({
            where: { id: cita.pacienteId },
            data: { deudaTotal: { increment: deltaSaldo } },
          })
        }
      }

      // 4. Snapshot de cobertura + servicio en la cita
      await tx.cita.update({
        where: { id: citaId },
        data: {
          ...(cambiaServicio && { servicioId: servicio.id, duracionMin: servicio.duracionMin }),
          usaSeguro: !!cobertura,
          categoriaSeguroId: cobertura?.categoriaSeguroId ?? null,
          montoPaciente: cobertura?.montoPaciente ?? null,
          montoAseguradora: cobertura?.montoAseguradora ?? null,
          codigoSeguro: cobertura?.codigoSeguro ?? null,
        },
      })

      // 5. LiquidacionItem: upsert si hay cobertura con monto > 0; borrar el PENDIENTE si no
      if (cobertura && cobertura.montoAseguradora.gt(0)) {
        if (cita.liquidacion) {
          await tx.liquidacionItem.update({
            where: { id: cita.liquidacion.id },
            data: {
              montoAseguradora: cobertura.montoAseguradora, servicioId: servicio.id,
              categoriaSeguroId: cobertura.categoriaSeguroId, aseguradoraId: cobertura.aseguradoraId,
              codigoSeguro: cobertura.codigoSeguro, fecha: cita.fechaHora,
            },
          })
        } else {
          await tx.liquidacionItem.create({
            data: {
              consultorioId, citaId, aseguradoraId: cobertura.aseguradoraId,
              categoriaSeguroId: cobertura.categoriaSeguroId, pacienteId: cita.pacienteId,
              servicioId: servicio.id, fecha: cita.fechaHora,
              montoAseguradora: cobertura.montoAseguradora, codigoSeguro: cobertura.codigoSeguro,
            },
          })
        }
      } else if (cita.liquidacion && cita.liquidacion.estado === EstadoLiquidacion.PENDIENTE) {
        await tx.liquidacionItem.delete({ where: { id: cita.liquidacion.id } })
      }

      // 6. Log
      await tx.log.create({
        data: {
          consultorioId, usuarioId, entidad: 'Cita', entidadId: citaId, accion: 'UPDATE',
          payloadDespues: {
            evento: 'editar-cita',
            servicioId: servicio.id,
            usaSeguro: !!cobertura,
            total: nuevoTotal.toString(),
            saldo: nuevoSaldo.toString(),
          },
        },
      })

      return tx.cita.findFirst({
        where: { id: citaId, consultorioId },
        include: { cobro: { include: { detalles: { orderBy: { id: 'asc' } } } } },
      })
    })

    return fresco
  }

  // Detalle de una cita: expone campos de cobertura (usaSeguro, montoPaciente,
  // montoAseguradora) ademas de cobro, paciente, doctor y servicio.
  async findOne(consultorioId: number, citaId: number) {
    const cita = await this.prisma.cita.findFirst({
      where: { id: citaId, consultorioId, deletedAt: null },
      select: {
        id: true,
        fechaHora: true,
        duracionMin: true,
        estado: true,
        notasSecretaria: true,
        usaSeguro: true,
        montoPaciente: true,
        montoAseguradora: true,
        codigoSeguro: true,
        categoriaSeguroId: true,
        paciente: { select: { id: true, nombre: true, apellido: true, telefono: true, pais: true, deudaTotal: true } },
        doctor: { select: { id: true, nombre: true, colorAgenda: true } },
        servicio: { select: { id: true, nombre: true, precioBase: true, duracionMin: true } },
        cobro: { select: { id: true, total: true, saldoPendiente: true, estado: true } },
      },
    })
    if (!cita) throw new NotFoundException('Cita no encontrada')
    return cita
  }

  // Token opaco para el link de auto-reprogramacion (espejo de
  // pacientes.portalToken): perezoso e idempotente. Solo para citas que se
  // pueden mover; una cita atendida/cancelada no genera link.
  async tokenReprogramacion(consultorioId: number, citaId: number) {
    const cita = await this.prisma.cita.findFirst({
      where: { id: citaId, consultorioId, deletedAt: null },
      select: { id: true, estado: true, portalToken: true },
    })
    if (!cita) throw new NotFoundException('Cita no encontrada')
    if (!ESTADOS_REPROGRAMABLES_PORTAL.includes(cita.estado)) {
      throw new BadRequestException(
        `No se puede reprogramar una cita en estado ${cita.estado}`,
      )
    }
    if (cita.portalToken) return { token: cita.portalToken }

    const actualizada = await this.prisma.cita.update({
      where: { id: citaId },
      data: { portalToken: randomBytes(18).toString('base64url') },
      select: { portalToken: true },
    })
    return { token: actualizada.portalToken }
  }

  // Reprogramacion iniciada por el paciente desde el link publico. El token
  // identifica la cita exacta; servicio queda fijo (misma cita), solo cambia
  // doctor + fecha/hora. Vuelve a SOLICITADA: la secretaria reconfirma.
  // El caller (PortalService) ya valido que el doctor atiende el servicio.
  async reprogramarPorToken(
    consultorioId: number,
    token: string,
    dto: { doctorId: number; fecha: string; hora: string },
  ) {
    const cita = await this.prisma.cita.findFirst({
      where: { consultorioId, portalToken: token, deletedAt: null },
      include: { doctor: true, servicio: true },
    })
    if (!cita) throw new NotFoundException('Link no disponible')
    if (!ESTADOS_REPROGRAMABLES_PORTAL.includes(cita.estado)) {
      throw new ConflictException('Esta cita ya no se puede reprogramar')
    }

    const fechaHora = new Date(`${dto.fecha.slice(0, 10)}T${dto.hora}:00`)
    const fechaFin = new Date(fechaHora.getTime() + cita.duracionMin * 60 * 1000)
    await this.verificarDisponibilidad(consultorioId, dto.doctorId, fechaHora, fechaFin, cita.id)
    await this.verificarHorarioAtencion(consultorioId, dto.doctorId, fechaHora, fechaFin)

    const reprogramada = await this.prisma.$transaction(async (tx) => {
      const actualizada = await tx.cita.update({
        where: { id: cita.id },
        data: {
          fechaHora,
          doctorId: dto.doctorId,
          // pedido del paciente: vuelve a SOLICITADA para que la secretaria lo acepte
          estado: EstadoCita.SOLICITADA,
        },
        include: { doctor: true, servicio: true },
      })

      await tx.log.create({
        data: {
          consultorioId,
          usuarioId: cita.createdById,
          entidad: 'Cita',
          entidadId: cita.id,
          accion: 'UPDATE',
          payloadAntes: {
            fechaHora: cita.fechaHora.toISOString(),
            doctorId: cita.doctorId,
            estado: cita.estado,
          },
          payloadDespues: {
            fechaHora: fechaHora.toISOString(),
            doctorId: dto.doctorId,
            estado: EstadoCita.SOLICITADA,
            motivo: 'reprogramacion-portal',
          },
        },
      })

      return actualizada
    })

    // Avisa a admin + doctor que el paciente pidio reprogramar
    void this.notificaciones.emitirEventoCita(
      consultorioId,
      cita.id,
      TipoNotificacion.CITA_REPROGRAMADA,
      { admin: true, doctor: true },
    )

    return {
      fecha: dto.fecha.slice(0, 10),
      hora: dto.hora,
      doctor: reprogramada.doctor?.nombre,
      servicio: reprogramada.servicio?.nombre,
    }
  }

  // Cancelacion iniciada por el paciente desde el link del email. El token
  // identifica la cita exacta; cancela al instante (estado CANCELADA), libera
  // el horario y avisa al consultorio. El caller (PortalService) ya derivo el
  // consultorio del slug. Idempotente solo en el sentido de fallar limpio si
  // la cita ya no se puede cancelar.
  async cancelarPorToken(consultorioId: number, token: string) {
    const cita = await this.prisma.cita.findFirst({
      where: { consultorioId, portalToken: token, deletedAt: null },
      include: {
        doctor: true,
        servicio: true,
        cobro: { select: { estado: true } },
        liquidacion: { select: { id: true, estado: true } },
      },
    })
    if (!cita) throw new NotFoundException('Link no disponible')
    if (!ESTADOS_CANCELABLES_PORTAL.includes(cita.estado)) {
      throw new ConflictException('Esta cita ya no se puede cancelar')
    }
    if (!transicionValida(cita.estado, EstadoCita.CANCELADA)) {
      throw new ConflictException('Esta cita ya no se puede cancelar')
    }

    // Con pagos registrados el dinero ya entro a la caja: el paciente no puede
    // cancelar solo, debe coordinar con el consultorio (anular pagos primero).
    const pagos = await this.prisma.pago.count({ where: { cobro: { citaId: cita.id } } })
    if (pagos > 0) {
      throw new ConflictException(
        'La cita tiene un pago registrado: comunicate con el consultorio para cancelarla',
      )
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.cita.update({
        where: { id: cita.id },
        data: { estado: EstadoCita.CANCELADA },
      })

      // El cobro de una cita cancelada no es deuda ni cuenta abierta
      if (cita.cobro && cita.cobro.estado !== EstadoCobro.ANULADO) {
        await tx.cobro.update({
          where: { citaId: cita.id },
          data: { estado: EstadoCobro.ANULADO },
        })
      }

      // LiquidacionItem PENDIENTE: eliminar (servicio no prestado).
      // FACTURADO/PAGADO: dejar y loguear (caso de borde, revision manual).
      if (cita.liquidacion) {
        if (cita.liquidacion.estado === EstadoLiquidacion.PENDIENTE) {
          await tx.liquidacionItem.delete({ where: { id: cita.liquidacion.id } })
        } else {
          await tx.log.create({
            data: {
              consultorioId,
              usuarioId: cita.createdById,
              entidad: 'LiquidacionItem',
              entidadId: cita.liquidacion.id,
              accion: 'UPDATE',
              payloadDespues: {
                motivo: 'cancelacion-portal con liquidacion no-PENDIENTE',
                estado: cita.liquidacion.estado,
                citaId: cita.id,
              },
            },
          })
        }
      }

      await tx.log.create({
        data: {
          consultorioId,
          usuarioId: cita.createdById,
          entidad: 'Cita',
          entidadId: cita.id,
          accion: 'STATE_CHANGE',
          payloadAntes: { estado: cita.estado },
          payloadDespues: { estado: EstadoCita.CANCELADA, motivo: 'cancelacion-portal' },
        },
      })
    })

    // Avisa a admin + doctor que el paciente cancelo desde el link
    void this.notificaciones.emitirEventoCita(
      consultorioId,
      cita.id,
      TipoNotificacion.CITA_CANCELADA,
      { admin: true, doctor: true },
    )

    // Confirmacion de la cancelacion al paciente por email
    void this.notificarCitaCancelada(cita.id)

    return {
      cancelada: true,
      // ISO; el frontend la formatea con su locale/timezone (igual que el contexto)
      fechaHora: cita.fechaHora.toISOString(),
      doctor: cita.doctor?.nombre,
      servicio: cita.servicio?.nombre,
    }
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
