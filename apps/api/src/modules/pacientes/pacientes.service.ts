import { randomBytes } from 'crypto'
import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common'
import { IsString, IsNotEmpty, IsOptional, IsEmail, IsISO8601, IsIn, IsBoolean, IsInt, Matches, ValidateIf } from 'class-validator'
import { PartialType } from '@nestjs/swagger'
import { EstadoCita } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

export class CreatePacienteDto {
  @IsString() @IsNotEmpty()
  nombre: string

  @IsString() @IsNotEmpty()
  apellido: string

  @IsString() @IsOptional()
  dni?: string

  // unico numero de contacto: sirve para llamadas y WhatsApp
  @IsString() @IsOptional()
  telefono?: string

  // ISO 3166-1 alfa-2 (prefijo internacional para wa.me)
  @Matches(/^[A-Z]{2}$/, { message: 'pais debe ser codigo ISO de 2 letras' })
  @IsOptional()
  pais?: string

  @IsEmail() @IsOptional()
  email?: string

  @IsISO8601() @IsOptional()
  fechaNacimiento?: string

  @IsIn(['M', 'F', 'X']) @IsOptional()
  sexo?: string

  @IsString() @IsOptional()
  direccion?: string

  @IsString() @IsOptional()
  notas?: string

  @IsBoolean() @IsOptional()
  tieneSeguro?: boolean

  @ValidateIf((o) => o.tieneSeguro === true)
  @IsInt()
  aseguradoraId?: number

  @ValidateIf((o) => o.tieneSeguro === true)
  @IsInt()
  categoriaSeguroId?: number

  @IsString() @IsOptional()
  codigoSeguro?: string
}

export class UpdatePacienteDto extends PartialType(CreatePacienteDto) {
  // E3 item 11: el staff puede marcar/desmarcar el prepago manualmente
  // (ademas del auto-flag al tercer no-show)
  @IsBoolean() @IsOptional()
  requierePrepago?: boolean
}

export class SetActivoDto {
  @IsBoolean()
  activo: boolean
}

@Injectable()
export class PacientesService {
  constructor(private prisma: PrismaService) {}

  async findAll(consultorioId: number, search?: string, incluirInactivos = false) {
    return this.prisma.paciente.findMany({
      where: {
        consultorioId,
        deletedAt: null,
        // Por defecto solo activos (grid limpio). Los archivados aparecen al
        // buscar (incluirInactivos), marcados con su flag `activo`.
        ...(incluirInactivos ? {} : { activo: true }),
        ...(search && {
          OR: [
            { nombre: { contains: search, mode: 'insensitive' } },
            { apellido: { contains: search, mode: 'insensitive' } },
            { dni: { contains: search } },
            { telefono: { contains: search } },
          ],
        }),
      },
      orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
      select: {
        id: true,
        nombre: true,
        apellido: true,
        dni: true,
        telefono: true,
        pais: true,
        email: true,
        deudaTotal: true,
        requierePrepago: true,
        activo: true,
        createdAt: true,
      },
    })
  }

  async findOne(consultorioId: number, id: number) {
    const paciente = await this.prisma.paciente.findFirst({
      where: { id, consultorioId, deletedAt: null },
      include: {
        citas: {
          where: { deletedAt: null },
          orderBy: { fechaHora: 'desc' },
          take: 10,
          include: {
            doctor: { select: { nombre: true } },
            servicio: { select: { nombre: true } },
            cobro: { select: { id: true, total: true, saldoPendiente: true, estado: true } },
            atencion: {
              select: { motivo: true, diagnostico: true, tratamiento: true, evolucion: true, proximoControl: true },
            },
          },
        },
        aseguradora: { select: { id: true, nombre: true } },
        categoriaSeguro: { select: { id: true, nombre: true, aseguradoraId: true } },
      },
    })
    if (!paciente) throw new NotFoundException('Paciente no encontrado')

    // E3 item 11: contador de inasistencias historicas del paciente
    const noShows = await this.prisma.cita.count({
      where: { pacienteId: id, consultorioId, deletedAt: null, estado: EstadoCita.NO_ASISTIO },
    })
    return { ...paciente, noShows }
  }

  private async validarCategoriaseguro(
    consultorioId: number,
    aseguradoraId: number,
    categoriaSeguroId: number,
  ) {
    const cat = await this.prisma.categoriaSeguro.findFirst({
      where: { id: categoriaSeguroId, consultorioId, aseguradoraId },
    })
    if (!cat) {
      throw new BadRequestException(
        'La categoria de seguro no corresponde a la aseguradora o al consultorio.',
      )
    }
  }

  async create(consultorioId: number, dto: CreatePacienteDto) {
    const nombre = dto.nombre.trim()
    const apellido = dto.apellido.trim()

    // Nombre + apellido NO se repiten (decision del owner): bloquea el alta.
    // El CI/telefono/correo NO bloquean (pueden ser familiares); solo avisan
    // via coincidencias().
    const duplicado = await this.prisma.paciente.findFirst({
      where: {
        consultorioId,
        deletedAt: null,
        nombre: { equals: nombre, mode: 'insensitive' },
        apellido: { equals: apellido, mode: 'insensitive' },
      },
      select: { id: true },
    })
    if (duplicado) {
      throw new ConflictException('Ya existe un paciente con ese nombre y apellido.')
    }

    // Seguro: validar pertenencia al consultorio + aseguradora
    let seguroData: {
      tieneSeguro?: boolean
      aseguradoraId?: number | null
      categoriaSeguroId?: number | null
      codigoSeguro?: string | null
    } = {}

    if (dto.tieneSeguro === true) {
      await this.validarCategoriaseguro(consultorioId, dto.aseguradoraId!, dto.categoriaSeguroId!)
      seguroData = {
        tieneSeguro: true,
        aseguradoraId: dto.aseguradoraId,
        categoriaSeguroId: dto.categoriaSeguroId,
        codigoSeguro: dto.codigoSeguro ?? null,
      }
    } else if (dto.tieneSeguro === false) {
      seguroData = {
        tieneSeguro: false,
        aseguradoraId: null,
        categoriaSeguroId: null,
        codigoSeguro: null,
      }
    }

    const { tieneSeguro: _ts, aseguradoraId: _aid, categoriaSeguroId: _csid, codigoSeguro: _cs, ...rest } = dto

    return this.prisma.paciente.create({
      data: {
        ...rest,
        nombre,
        apellido,
        consultorioId,
        fechaNacimiento: dto.fechaNacimiento ? new Date(dto.fechaNacimiento) : undefined,
        ...seguroData,
      },
    })
  }

  // Avisos (no bloqueantes) de CI/telefono/correo ya usados por otro paciente
  // del consultorio. Pueden ser familiares (un nino con el telefono del padre).
  async coincidencias(
    consultorioId: number,
    q: { dni?: string; telefono?: string; email?: string; excluirId?: number },
  ) {
    const dni = q.dni?.trim()
    const telefono = q.telefono?.trim()
    const email = q.email?.trim()
    // Al editar se excluye al propio paciente (no se avisa de si mismo).
    const base = {
      consultorioId,
      deletedAt: null,
      ...(q.excluirId ? { id: { not: q.excluirId } } : {}),
    }
    const [dniM, telM, emailM] = await Promise.all([
      dni
        ? this.prisma.paciente.findFirst({ where: { ...base, dni }, select: { id: true } })
        : null,
      telefono
        ? this.prisma.paciente.findFirst({ where: { ...base, telefono }, select: { id: true } })
        : null,
      email
        ? this.prisma.paciente.findFirst({
            where: { ...base, email: { equals: email, mode: 'insensitive' } },
            select: { id: true },
          })
        : null,
    ])
    return { dni: !!dniM, telefono: !!telM, email: !!emailM }
  }

  async update(consultorioId: number, id: number, dto: UpdatePacienteDto) {
    const actual = await this.findOne(consultorioId, id)

    // Mismo bloqueo que al crear: nombre + apellido no se repiten, excluyendo
    // al propio paciente que se esta editando.
    const nombre = (dto.nombre ?? actual.nombre).trim()
    const apellido = (dto.apellido ?? actual.apellido).trim()
    const duplicado = await this.prisma.paciente.findFirst({
      where: {
        consultorioId,
        deletedAt: null,
        id: { not: id },
        nombre: { equals: nombre, mode: 'insensitive' },
        apellido: { equals: apellido, mode: 'insensitive' },
      },
      select: { id: true },
    })
    if (duplicado) {
      throw new ConflictException('Ya existe un paciente con ese nombre y apellido.')
    }

    // Seguro: validar pertenencia al consultorio + aseguradora
    let seguroData: {
      tieneSeguro?: boolean
      aseguradoraId?: number | null
      categoriaSeguroId?: number | null
      codigoSeguro?: string | null
    } = {}

    if (dto.tieneSeguro === true) {
      await this.validarCategoriaseguro(consultorioId, dto.aseguradoraId!, dto.categoriaSeguroId!)
      seguroData = {
        tieneSeguro: true,
        aseguradoraId: dto.aseguradoraId,
        categoriaSeguroId: dto.categoriaSeguroId,
        codigoSeguro: dto.codigoSeguro ?? null,
      }
    } else if (dto.tieneSeguro === false) {
      seguroData = {
        tieneSeguro: false,
        aseguradoraId: null,
        categoriaSeguroId: null,
        codigoSeguro: null,
      }
    }

    const { tieneSeguro: _ts, aseguradoraId: _aid, categoriaSeguroId: _csid, codigoSeguro: _cs, ...rest } = dto

    return this.prisma.paciente.update({
      where: { id },
      data: {
        ...rest,
        ...(dto.nombre !== undefined && { nombre }),
        ...(dto.apellido !== undefined && { apellido }),
        fechaNacimiento: dto.fechaNacimiento ? new Date(dto.fechaNacimiento) : undefined,
        ...seguroData,
      },
    })
  }

  // Archivar (activo:false) / reactivar (activo:true). No bloquea por deuda ni
  // citas futuras (el front solo avisa); el historial se conserva. Se audita.
  async setActivo(consultorioId: number, id: number, activo: boolean, usuarioId: number) {
    await this.findOne(consultorioId, id) // valida tenant + existencia
    const [paciente] = await this.prisma.$transaction([
      this.prisma.paciente.update({ where: { id }, data: { activo } }),
      this.prisma.log.create({
        data: {
          consultorioId,
          usuarioId,
          entidad: 'Paciente',
          entidadId: id,
          accion: 'UPDATE',
          // El detalle archivar/reactivar queda en el payload (auditable).
          payloadDespues: { activo },
        },
      }),
    ])
    return paciente
  }

  // Token opaco para el link de reserva precargado del portal: aleatorio e
  // impredecible (capability URL), se crea la primera vez que se pide.
  // Idempotente: siempre devuelve el mismo token del paciente.
  async portalToken(consultorioId: number, id: number) {
    const paciente = await this.prisma.paciente.findFirst({
      where: { id, consultorioId, deletedAt: null },
      select: { id: true, portalToken: true },
    })
    if (!paciente) throw new NotFoundException('Paciente no encontrado')
    if (paciente.portalToken) return { token: paciente.portalToken }

    const actualizado = await this.prisma.paciente.update({
      where: { id },
      data: { portalToken: randomBytes(18).toString('base64url') },
      select: { portalToken: true },
    })
    return { token: actualizado.portalToken }
  }

  async softDelete(consultorioId: number, id: number) {
    await this.findOne(consultorioId, id)
    return this.prisma.paciente.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
  }
}
