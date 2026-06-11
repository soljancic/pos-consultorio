import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common'
import { IsString, IsOptional, IsISO8601 } from 'class-validator'
import { promises as fs } from 'fs'
import { join, resolve, extname } from 'path'
import { PrismaService } from '../../prisma/prisma.service'
import { EstadoCita } from '@prisma/client'

export class UpsertAtencionDto {
  @IsString() @IsOptional()
  motivo?: string

  @IsString() @IsOptional()
  diagnostico?: string

  @IsString() @IsOptional()
  tratamiento?: string

  @IsString() @IsOptional()
  evolucion?: string

  @IsISO8601() @IsOptional()
  proximoControl?: string
}

// La atencion solo se registra cuando el servicio se esta prestando o ya se presto
const ESTADOS_ATENDIBLES: EstadoCita[] = [
  EstadoCita.EN_ATENCION,
  EstadoCita.ATENDIDA,
  EstadoCita.COBRADO,
  EstadoCita.CON_DEUDA,
]

// Adjuntos de historia clinica (E2-M4 f2): disco local mientras el deploy
// este diferido; la carpeta se define por env para el dia del hosting
const MIMES_ADJUNTO = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_ADJUNTO_BYTES = 5 * 1024 * 1024
const MAX_ADJUNTOS_POR_ATENCION = 10

export type AdjuntoMeta = {
  nombre: string
  archivo: string // ruta relativa a UPLOADS_DIR
  tipo: string
  tamano: number
  subidoAt: string
}

@Injectable()
export class AtencionesService {
  constructor(private prisma: PrismaService) {}

  private get uploadsDir() {
    return resolve(process.env.UPLOADS_DIR ?? join(process.cwd(), 'uploads'))
  }

  // E2-M4: guard duro de historia clinica — escribe el ADMIN o el doctor
  // de la cita (via Doctor.usuarioId); la UI ya lo ocultaba, ahora el
  // backend lo garantiza. Publico: RecetasService aplica el mismo guard.
  async citaConGuardDeEscritura(
    consultorioId: number,
    citaId: number,
    usuarioId: number,
    rol: string,
  ) {
    const cita = await this.prisma.cita.findFirst({
      where: { id: citaId, consultorioId, deletedAt: null },
      include: { atencion: true },
    })
    if (!cita) throw new NotFoundException('Cita no encontrada')

    if (rol !== 'ADMIN') {
      if (rol !== 'DOCTOR') {
        throw new ForbiddenException('Solo el doctor o el administrador registran la atencion')
      }
      const propio = await this.prisma.doctor.findFirst({
        where: { consultorioId, usuarioId },
        select: { id: true },
      })
      if (propio?.id !== cita.doctorId) {
        throw new ForbiddenException('Solo puede registrar atenciones de sus propias citas')
      }
    }
    return cita
  }

  // Linea de tiempo de historia clinica (E2-M4 f2): todas las atenciones del
  // paciente, mas recientes primero; q busca en los campos clinicos
  async findByPaciente(consultorioId: number, pacienteId: number, q?: string) {
    const paciente = await this.prisma.paciente.findFirst({
      where: { id: pacienteId, consultorioId, deletedAt: null },
      select: { id: true },
    })
    if (!paciente) throw new NotFoundException('Paciente no encontrado')

    return this.prisma.atencion.findMany({
      where: {
        cita: { consultorioId, pacienteId, deletedAt: null },
        ...(q && {
          OR: [
            { motivo: { contains: q, mode: 'insensitive' as const } },
            { diagnostico: { contains: q, mode: 'insensitive' as const } },
            { tratamiento: { contains: q, mode: 'insensitive' as const } },
            { evolucion: { contains: q, mode: 'insensitive' as const } },
          ],
        }),
      },
      include: {
        cita: {
          select: {
            id: true,
            fechaHora: true,
            estado: true,
            doctor: { select: { nombre: true } },
            servicio: { select: { nombre: true } },
          },
        },
      },
      orderBy: { cita: { fechaHora: 'desc' } },
    })
  }

  async findByCita(consultorioId: number, citaId: number) {
    const atencion = await this.prisma.atencion.findFirst({
      where: { citaId, cita: { consultorioId, deletedAt: null } },
    })
    if (!atencion) throw new NotFoundException('La cita no tiene atencion registrada')
    return atencion
  }

  async upsert(
    consultorioId: number,
    citaId: number,
    dto: UpsertAtencionDto,
    usuarioId: number,
    rol: string,
  ) {
    const cita = await this.citaConGuardDeEscritura(consultorioId, citaId, usuarioId, rol)

    if (!ESTADOS_ATENDIBLES.includes(cita.estado)) {
      throw new BadRequestException(
        `No se puede registrar atencion en una cita ${cita.estado}`,
      )
    }

    const data = {
      motivo: dto.motivo,
      diagnostico: dto.diagnostico,
      tratamiento: dto.tratamiento,
      evolucion: dto.evolucion,
      proximoControl: dto.proximoControl ? new Date(dto.proximoControl) : null,
    }

    const [atencion] = await this.prisma.$transaction([
      this.prisma.atencion.upsert({
        where: { citaId },
        create: { citaId, ...data },
        update: data,
      }),
      this.prisma.log.create({
        data: {
          consultorioId,
          usuarioId,
          entidad: 'Atencion',
          entidadId: citaId,
          accion: cita.atencion ? 'UPDATE' : 'CREATE',
          payloadAntes: cita.atencion
            ? { diagnostico: cita.atencion.diagnostico, tratamiento: cita.atencion.tratamiento }
            : undefined,
          payloadDespues: { diagnostico: dto.diagnostico, tratamiento: dto.tratamiento },
        },
      }),
    ])

    return atencion
  }

  async agregarAdjunto(
    consultorioId: number,
    citaId: number,
    usuarioId: number,
    rol: string,
    file: Express.Multer.File,
  ) {
    const cita = await this.citaConGuardDeEscritura(consultorioId, citaId, usuarioId, rol)
    if (!cita.atencion) {
      throw new BadRequestException('Registre la atencion antes de adjuntar archivos')
    }
    if (!MIMES_ADJUNTO.includes(file.mimetype)) {
      throw new BadRequestException('Solo se aceptan imagenes (JPG, PNG, WebP) o PDF')
    }
    if (file.size > MAX_ADJUNTO_BYTES) {
      throw new BadRequestException('El archivo supera el maximo de 5 MB')
    }

    const existentes = (cita.atencion.adjuntos as AdjuntoMeta[] | null) ?? []
    if (existentes.length >= MAX_ADJUNTOS_POR_ATENCION) {
      throw new BadRequestException(`Maximo ${MAX_ADJUNTOS_POR_ATENCION} adjuntos por atencion`)
    }

    // Nombre en disco controlado por el server; el original queda solo como metadato
    const nombreOriginal = file.originalname.normalize('NFC').slice(0, 120)
    const ext = extname(nombreOriginal).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.bin'
    const relativo = join(
      `consultorio-${consultorioId}`,
      `cita-${citaId}`,
      `${Date.now()}-${existentes.length}${ext}`,
    )
    const destino = resolve(this.uploadsDir, relativo)
    if (!destino.startsWith(this.uploadsDir)) {
      throw new BadRequestException('Ruta de adjunto invalida')
    }
    await fs.mkdir(join(destino, '..'), { recursive: true })
    await fs.writeFile(destino, file.buffer)

    const nuevo: AdjuntoMeta = {
      nombre: nombreOriginal,
      archivo: relativo,
      tipo: file.mimetype,
      tamano: file.size,
      subidoAt: new Date().toISOString(),
    }
    const adjuntos = [...existentes, nuevo]

    const [atencion] = await this.prisma.$transaction([
      this.prisma.atencion.update({ where: { citaId }, data: { adjuntos } }),
      this.prisma.log.create({
        data: {
          consultorioId,
          usuarioId,
          entidad: 'Atencion',
          entidadId: citaId,
          accion: 'UPDATE',
          payloadDespues: { adjunto: nuevo.nombre, tipo: nuevo.tipo, tamano: nuevo.tamano },
        },
      }),
    ])
    return atencion
  }

  // Lectura abierta al staff (igual que findByCita); el indice identifica al
  // adjunto dentro del JSON de la atencion
  async obtenerAdjunto(consultorioId: number, citaId: number, indice: number) {
    const atencion = await this.findByCita(consultorioId, citaId)
    const adjuntos = (atencion.adjuntos as AdjuntoMeta[] | null) ?? []
    const meta = adjuntos[indice]
    if (!meta) throw new NotFoundException('Adjunto no encontrado')

    const ruta = resolve(this.uploadsDir, meta.archivo)
    if (!ruta.startsWith(this.uploadsDir)) {
      throw new NotFoundException('Adjunto no encontrado')
    }
    try {
      await fs.access(ruta)
    } catch {
      throw new NotFoundException('El archivo del adjunto ya no existe en el servidor')
    }
    return { ruta, meta }
  }

  async eliminarAdjunto(
    consultorioId: number,
    citaId: number,
    indice: number,
    usuarioId: number,
    rol: string,
  ) {
    const cita = await this.citaConGuardDeEscritura(consultorioId, citaId, usuarioId, rol)
    const adjuntos = (cita.atencion?.adjuntos as AdjuntoMeta[] | null) ?? []
    const meta = adjuntos[indice]
    if (!meta) throw new NotFoundException('Adjunto no encontrado')

    const restantes = adjuntos.filter((_, i) => i !== indice)
    const [atencion] = await this.prisma.$transaction([
      this.prisma.atencion.update({ where: { citaId }, data: { adjuntos: restantes } }),
      this.prisma.log.create({
        data: {
          consultorioId,
          usuarioId,
          entidad: 'Atencion',
          entidadId: citaId,
          accion: 'DELETE',
          payloadAntes: { adjunto: meta.nombre, archivo: meta.archivo },
        },
      }),
    ])

    // Borrado fisico best-effort: la referencia ya salio de la historia
    const ruta = resolve(this.uploadsDir, meta.archivo)
    if (ruta.startsWith(this.uploadsDir)) {
      await fs.unlink(ruta).catch(() => undefined)
    }
    return atencion
  }
}
