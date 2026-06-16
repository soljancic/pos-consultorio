import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { TipoNotificacion, Prisma } from '@prisma/client'
import { JwtPayload } from '../../common/decorators/current-user.decorator'

// Destinos de un evento de cita: la bandeja admin (compartida) y/o el doctor.
interface DestinosEvento {
  admin: boolean
  doctor: boolean
}

@Injectable()
export class NotificacionesService {
  constructor(private prisma: PrismaService) {}

  // Filtro de visibilidad por rol. DOCTOR ve solo las suyas (destinoUsuarioId =
  // su Usuario.id); cualquier otro rol ve la bandeja admin compartida (null).
  private whereVisible(user: JwtPayload): Prisma.NotificacionWhereInput {
    if (user.rol === 'DOCTOR') {
      return { consultorioId: user.consultorioId, destinoUsuarioId: user.sub }
    }
    return { consultorioId: user.consultorioId, destinoUsuarioId: null }
  }

  private fmtFecha(d: Date): string {
    return d.toLocaleDateString('es-BO')
  }

  private fmtHora(d: Date): string {
    return d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  // Dia calendario LOCAL de la cita (para el deep-link a la agenda, que carga
  // por dia local). No usar UTC: mantiene la cita en su dia visible.
  private ymd(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  private textoEvento(
    tipo: TipoNotificacion,
    cita: { paciente: { nombre: string; apellido: string }; servicio: { nombre: string }; fechaHora: Date },
  ): { titulo: string; mensaje: string } {
    const quien = `${cita.paciente.nombre} ${cita.paciente.apellido}`
    const servicio = cita.servicio.nombre
    const cuando = `${this.fmtFecha(cita.fechaHora)} ${this.fmtHora(cita.fechaHora)}`
    switch (tipo) {
      case TipoNotificacion.NUEVA_CITA:
        return { titulo: 'Nueva solicitud de cita', mensaje: `${quien} solicitó ${servicio} para el ${cuando}` }
      case TipoNotificacion.CITA_CANCELADA:
        return { titulo: 'Cita cancelada', mensaje: `${quien} · ${servicio} del ${cuando}` }
      case TipoNotificacion.CITA_REPROGRAMADA:
        return { titulo: 'Cita reprogramada', mensaje: `${quien} · ${servicio} → ${cuando}` }
      case TipoNotificacion.PACIENTE_EN_ESPERA:
        return { titulo: 'Paciente en espera', mensaje: `${quien} llegó para ${servicio} (${this.fmtHora(cita.fechaHora)})` }
    }
  }

  // Emite una notificacion de evento de cita. Fire-and-forget: se llama con void
  // desde CitasService y NUNCA debe romper la operacion de la cita, por eso todo
  // va dentro de try/catch. Crea hasta 2 filas (admin + doctor).
  async emitirEventoCita(
    consultorioId: number,
    citaId: number,
    tipo: TipoNotificacion,
    destinos: DestinosEvento,
  ): Promise<void> {
    try {
      const cita = await this.prisma.cita.findFirst({
        where: { id: citaId, consultorioId },
        include: {
          paciente: { select: { nombre: true, apellido: true } },
          servicio: { select: { nombre: true } },
          doctor: { select: { usuarioId: true } },
        },
      })
      if (!cita) return
      const { titulo, mensaje } = this.textoEvento(tipo, cita)

      const filas: Prisma.NotificacionCreateManyInput[] = []
      if (destinos.admin) {
        filas.push({ consultorioId, tipo, titulo, mensaje, citaId, destinoUsuarioId: null })
      }
      // Solo si el doctor tiene Usuario vinculado: si no, no hay destinatario.
      if (destinos.doctor && cita.doctor.usuarioId) {
        filas.push({ consultorioId, tipo, titulo, mensaje, citaId, destinoUsuarioId: cita.doctor.usuarioId })
      }
      if (filas.length > 0) {
        await this.prisma.notificacion.createMany({ data: filas })
      }
    } catch {
      // Best-effort: un fallo de notificacion no afecta la operacion de negocio.
    }
  }

  async findAll(user: JwtPayload) {
    const items = await this.prisma.notificacion.findMany({
      where: this.whereVisible(user),
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { cita: { select: { fechaHora: true } } },
    })
    return items.map((n) => ({
      id: n.id,
      tipo: n.tipo,
      titulo: n.titulo,
      mensaje: n.mensaje,
      citaId: n.citaId,
      citaFecha: n.cita ? this.ymd(n.cita.fechaHora) : null,
      leida: n.leidaAt !== null,
      createdAt: n.createdAt,
    }))
  }

  async noLeidasCount(user: JwtPayload): Promise<number> {
    return this.prisma.notificacion.count({
      where: { ...this.whereVisible(user), leidaAt: null },
    })
  }

  async marcarLeida(user: JwtPayload, id: number): Promise<{ ok: true }> {
    const res = await this.prisma.notificacion.updateMany({
      where: { ...this.whereVisible(user), id, leidaAt: null },
      data: { leidaAt: new Date() },
    })
    if (res.count === 0) {
      const existe = await this.prisma.notificacion.count({
        where: { ...this.whereVisible(user), id },
      })
      if (existe === 0) throw new NotFoundException('Notificación no encontrada')
    }
    return { ok: true }
  }

  async marcarTodasLeidas(user: JwtPayload): Promise<{ marcadas: number }> {
    const res = await this.prisma.notificacion.updateMany({
      where: { ...this.whereVisible(user), leidaAt: null },
      data: { leidaAt: new Date() },
    })
    return { marcadas: res.count }
  }

  // Cron diario: borra (DELETE real) las leidas con mas de 7 dias. Las no leidas
  // nunca se purgan automaticamente.
  async purgarViejas(): Promise<number> {
    const limite = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const res = await this.prisma.notificacion.deleteMany({
      where: { leidaAt: { not: null, lt: limite } },
    })
    return res.count
  }
}
