import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { IsIn } from 'class-validator'
import { EstadoCita, EstadoMensaje, TipoMensaje } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

export class ResolverMensajeDto {
  @IsIn([EstadoMensaje.ENVIADO, EstadoMensaje.OMITIDO])
  estado: EstadoMensaje
}

// E3 item 41a: cola de mensajes pendientes — canal MANUAL ASISTIDO.
// El sistema encola (cron diario o boton), el staff abre wa.me con la
// plantilla del consultorio y marca enviado/omitido. La integracion con
// WhatsApp Business API queda pausada hasta decision del owner.
@Injectable()
export class MensajesService {
  constructor(private prisma: PrismaService) {}

  // Los resueltos se acumulan sin techo: el tab "Resueltos" filtra por rango de
  // fechas (resueltoAt) para no traer todo el historico cada vez. Rango local:
  // [desde 00:00, hasta+1dia 00:00) — mismo criterio que Reportes.
  findAll(consultorioId: number, estado?: EstadoMensaje, desde?: string, hasta?: string) {
    let resueltoAt: { gte: Date; lt: Date } | undefined
    if (desde && hasta) {
      const ini = new Date(`${desde}T00:00:00`)
      const fin = new Date(`${hasta}T00:00:00`)
      fin.setDate(fin.getDate() + 1)
      resueltoAt = { gte: ini, lt: fin }
    }
    return this.prisma.mensajePendiente.findMany({
      where: { consultorioId, ...(estado && { estado }), ...(resueltoAt && { resueltoAt }) },
      include: {
        paciente: { select: { id: true, nombre: true, apellido: true, telefono: true, pais: true, deudaTotal: true } },
        cita: { select: { id: true, fechaHora: true, estado: true, doctor: { select: { nombre: true } } } },
        resueltoPor: { select: { nombre: true } },
      },
      orderBy: [{ estado: 'asc' }, { creadoAt: 'desc' }],
      take: 200,
    })
  }

  // Encola recordatorios para las citas activas de HOY y MANANA (uno por
  // cita, garantizado por @@unique(citaId, tipo)) y avisos de deuda para
  // pacientes con saldo (como mucho uno cada 7 dias por paciente).
  async generar(consultorioId: number) {
    const hoy = new Date()
    const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
    const finManana = new Date(inicioHoy.getTime() + 2 * 24 * 60 * 60 * 1000)

    const citas = await this.prisma.cita.findMany({
      where: {
        consultorioId,
        deletedAt: null,
        estado: { in: [EstadoCita.PENDIENTE, EstadoCita.CONFIRMADA] },
        fechaHora: { gte: inicioHoy, lt: finManana },
        paciente: { deletedAt: null, telefono: { not: null } },
      },
      select: { id: true, pacienteId: true, fechaHora: true },
    })

    const { count: recordatorios } = await this.prisma.mensajePendiente.createMany({
      data: citas.map((cita) => ({
        consultorioId,
        pacienteId: cita.pacienteId,
        citaId: cita.id,
        tipo: TipoMensaje.RECORDATORIO,
        detalle: `Cita ${cita.fechaHora.toLocaleDateString('es-BO')} ${cita.fechaHora.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false })}`,
      })),
      skipDuplicates: true, // una cita se encola una sola vez (unique citaId+tipo)
    })

    const hace7dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const deudores = await this.prisma.paciente.findMany({
      where: {
        consultorioId,
        deletedAt: null,
        deudaTotal: { gt: 0 },
        telefono: { not: null },
        // sin aviso de deuda reciente (cualquiera sea su estado)
        mensajesPendientes: { none: { tipo: TipoMensaje.DEUDA, creadoAt: { gte: hace7dias } } },
      },
      select: { id: true, deudaTotal: true },
    })

    if (deudores.length > 0) {
      await this.prisma.mensajePendiente.createMany({
        data: deudores.map((d) => ({
          consultorioId,
          pacienteId: d.id,
          tipo: TipoMensaje.DEUDA,
          detalle: `Deuda ${Number(d.deudaTotal).toFixed(2)}`,
        })),
      })
    }

    return { recordatorios, avisosDeuda: deudores.length }
  }

  async resolver(consultorioId: number, id: number, estado: EstadoMensaje, usuarioId: number) {
    const mensaje = await this.prisma.mensajePendiente.findFirst({
      where: { id, consultorioId },
    })
    if (!mensaje) throw new NotFoundException('Mensaje no encontrado')
    if (mensaje.estado !== EstadoMensaje.PENDIENTE) {
      throw new BadRequestException('El mensaje ya fue resuelto')
    }
    return this.prisma.mensajePendiente.update({
      where: { id },
      data: { estado, resueltoAt: new Date(), resueltoPorId: usuarioId },
      include: { paciente: { select: { nombre: true, apellido: true } } },
    })
  }

  pendientesCount(consultorioId: number) {
    return this.prisma.mensajePendiente.count({
      where: { consultorioId, estado: EstadoMensaje.PENDIENTE },
    })
  }
}
