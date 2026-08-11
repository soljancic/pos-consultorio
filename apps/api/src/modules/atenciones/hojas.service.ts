import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { IsObject } from 'class-validator'
import { MAX_HOJAS_POR_ATENCION } from '@pos/types'
import { PrismaService } from '../../prisma/prisma.service'
import { AtencionesService } from './atenciones.service'
import { siguienteOrden, validarTrazos } from './manuscrito.validator'

export class GuardarHojaDto {
  // El shape fino lo valida validarTrazos(); class-validator solo garantiza que
  // llegue un objeto (sin decorador, el ValidationPipe global tira 400).
  @IsObject()
  trazos: unknown
}

@Injectable()
export class HojasService {
  constructor(
    private prisma: PrismaService,
    private atenciones: AtencionesService,
  ) {}

  /** Lectura abierta al staff del consultorio, igual que el resto de la atencion. */
  async listar(consultorioId: number, citaId: number) {
    const atencion = await this.prisma.atencion.findFirst({
      where: { citaId, cita: { consultorioId, deletedAt: null } },
      select: { id: true },
    })
    if (!atencion) return []
    return this.prisma.hojaManuscrita.findMany({
      where: { atencionId: atencion.id, deletedAt: null },
      orderBy: { orden: 'asc' },
    })
  }

  async crear(
    consultorioId: number,
    citaId: number,
    dto: GuardarHojaDto,
    usuarioId: number,
    rol: string,
  ) {
    const cita = await this.atenciones.citaConGuardDeEscritura(consultorioId, citaId, usuarioId, rol)
    if (!cita.atencion) {
      throw new BadRequestException('Registre la atención antes de escribir a mano')
    }

    const trazos = this.parsear(dto.trazos)

    const vivas = await this.prisma.hojaManuscrita.count({
      where: { atencionId: cita.atencion.id, deletedAt: null },
    })
    if (vivas >= MAX_HOJAS_POR_ATENCION) {
      throw new BadRequestException(`Máximo ${MAX_HOJAS_POR_ATENCION} hojas por atención`)
    }

    // Incluye las borradas a proposito: siguen ocupando su `orden` por el @@unique.
    const todas = await this.prisma.hojaManuscrita.findMany({
      where: { atencionId: cita.atencion.id },
      select: { orden: true },
    })
    const orden = siguienteOrden(todas.map((h) => h.orden))

    const [hoja] = await this.prisma.$transaction([
      this.prisma.hojaManuscrita.create({
        data: { atencionId: cita.atencion.id, orden, trazos: trazos as object },
      }),
      this.prisma.log.create({
        data: {
          consultorioId,
          usuarioId,
          entidad: 'HojaManuscrita',
          entidadId: citaId,
          accion: 'CREATE',
          payloadDespues: { orden, trazos: trazos.strokes.length },
        },
      }),
    ])
    return hoja
  }

  async actualizar(
    consultorioId: number,
    citaId: number,
    hojaId: number,
    dto: GuardarHojaDto,
    usuarioId: number,
    rol: string,
  ) {
    const hoja = await this.hojaConGuardDeEscritura(consultorioId, citaId, hojaId, usuarioId, rol)
    const trazos = this.parsear(dto.trazos)

    const [actualizada] = await this.prisma.$transaction([
      this.prisma.hojaManuscrita.update({
        where: { id: hoja.id },
        data: { trazos: trazos as object },
      }),
      this.prisma.log.create({
        data: {
          consultorioId,
          usuarioId,
          entidad: 'HojaManuscrita',
          entidadId: citaId,
          accion: 'UPDATE',
          payloadDespues: { hojaId: hoja.id, orden: hoja.orden, trazos: trazos.strokes.length },
        },
      }),
    ])
    return actualizada
  }

  async eliminar(
    consultorioId: number,
    citaId: number,
    hojaId: number,
    usuarioId: number,
    rol: string,
  ) {
    const hoja = await this.hojaConGuardDeEscritura(consultorioId, citaId, hojaId, usuarioId, rol)

    // Borrado soft: la fila queda y sigue ocupando su `orden`.
    const [borrada] = await this.prisma.$transaction([
      this.prisma.hojaManuscrita.update({
        where: { id: hoja.id },
        data: { deletedAt: new Date() },
      }),
      this.prisma.log.create({
        data: {
          consultorioId,
          usuarioId,
          entidad: 'HojaManuscrita',
          entidadId: citaId,
          accion: 'DELETE',
          payloadAntes: { hojaId: hoja.id, orden: hoja.orden },
        },
      }),
    ])
    return borrada
  }

  /**
   * Guard de escritura + resolucion de la hoja dentro de la cita. El where
   * cruza citaId y consultorioId: una hoja de otro tenant no se encuentra.
   * Publico: lo usa TranscripcionService.
   */
  async hojaConGuardDeEscritura(
    consultorioId: number,
    citaId: number,
    hojaId: number,
    usuarioId: number,
    rol: string,
  ) {
    await this.atenciones.citaConGuardDeEscritura(consultorioId, citaId, usuarioId, rol)
    const hoja = await this.prisma.hojaManuscrita.findFirst({
      where: {
        id: hojaId,
        deletedAt: null,
        atencion: { citaId, cita: { consultorioId, deletedAt: null } },
      },
    })
    if (!hoja) throw new NotFoundException('Hoja no encontrada')
    return hoja
  }

  private parsear(valor: unknown) {
    try {
      return validarTrazos(valor)
    } catch (e) {
      throw new BadRequestException((e as Error).message)
    }
  }
}
