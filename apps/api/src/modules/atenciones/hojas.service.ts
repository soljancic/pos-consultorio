import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { IsObject } from 'class-validator'
import { MAX_HOJAS_POR_ATENCION, type TrazosHoja } from '@pos/types'
import { Prisma } from '@prisma/client'
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
    // El count de arriba es de mejor esfuerzo: no bloquea, asi que dos altas
    // concurrentes pueden pasarlo juntas y superar el tope por 1. Se acepta
    // (no vale la pena una transaccion serializable por esto); lo que si se
    // resuelve es el choque de `orden` — ver crearConReintento.

    return this.crearConReintento(consultorioId, citaId, cita.atencion.id, trazos, usuarioId)
  }

  /**
   * Postgres corre en READ COMMITTED: una transaccion no evita que dos
   * requests concurrentes para la misma atencion (doble tap en "+ Hoja" en
   * la tablet, o un retry de cliente) lean el mismo maximo y calculen el
   * mismo `orden`. La guarda real es el `@@unique([atencionId, orden])` de
   * Prisma; ante ese choque (P2002) se reintenta una sola vez con una
   * lectura fresca del maximo — nunca se asume que alcanza con sumarle 1
   * al `orden` que ya fallo.
   */
  private async crearConReintento(
    consultorioId: number,
    citaId: number,
    atencionId: number,
    trazos: TrazosHoja,
    usuarioId: number,
  ) {
    const intentar = async () => {
      // Incluye las borradas a proposito: siguen ocupando su `orden` por el @@unique.
      const todas = await this.prisma.hojaManuscrita.findMany({
        where: { atencionId },
        select: { orden: true },
      })
      const orden = siguienteOrden(todas.map((h) => h.orden))

      const [hoja] = await this.prisma.$transaction([
        this.prisma.hojaManuscrita.create({
          data: { atencionId, orden, trazos: trazos as object },
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

    try {
      return await intentar()
    } catch (e) {
      if (!this.esChoqueDeOrden(e)) throw e
      try {
        return await intentar()
      } catch (e2) {
        if (!this.esChoqueDeOrden(e2)) throw e2
        throw new ConflictException('No se pudo crear la hoja: reintenta')
      }
    }
  }

  private esChoqueDeOrden(e: unknown): e is Prisma.PrismaClientKnownRequestError {
    return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
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
