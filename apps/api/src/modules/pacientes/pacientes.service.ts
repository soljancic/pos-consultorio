import { randomBytes } from 'crypto'
import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common'
import { IsString, IsNotEmpty, IsOptional, IsEmail, IsISO8601, IsIn, IsBoolean, IsInt, Matches, ValidateIf, validateSync } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import { PartialType } from '@nestjs/swagger'
import { EstadoCita } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { parseWorkbook, buildWorkbook, buildSample, type FilaPaciente } from './pacientes.xlsx'

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

  async findAll(
    consultorioId: number,
    opts: { search?: string; incluirInactivos?: boolean; page?: number; limit?: number } = {},
  ) {
    const page = Math.max(1, opts.page ?? 1)
    const limit = Math.min(100, Math.max(1, opts.limit ?? 50))
    const search = opts.search?.trim()
    const where = {
      consultorioId,
      deletedAt: null,
      ...(opts.incluirInactivos ? {} : { activo: true }),
      ...(search && {
        OR: [
          { nombre: { contains: search, mode: 'insensitive' as const } },
          { apellido: { contains: search, mode: 'insensitive' as const } },
          { dni: { contains: search } },
          { telefono: { contains: search } },
        ],
      }),
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.paciente.findMany({
        where,
        orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, nombre: true, apellido: true, dni: true, telefono: true,
          pais: true, email: true, deudaTotal: true, requierePrepago: true,
          activo: true, createdAt: true,
        },
      }),
      this.prisma.paciente.count({ where }),
    ])
    return { items, total }
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

  private async validarCategoriaSeguro(
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
      await this.validarCategoriaSeguro(consultorioId, dto.aseguradoraId!, dto.categoriaSeguroId!)
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
      await this.validarCategoriaSeguro(consultorioId, dto.aseguradoraId!, dto.categoriaSeguroId!)
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

  private validarFila(fila: FilaPaciente): { dto?: CreatePacienteDto; error?: string } {
    if (!fila.nombre?.trim() || !fila.apellido?.trim()) return { error: 'nombre y apellido son obligatorios' }
    const limpio: FilaPaciente = {}
    for (const [k, v] of Object.entries(fila)) {
      const val = typeof v === 'string' ? v.trim() : v
      if (val !== undefined && val !== '') (limpio as Record<string, unknown>)[k] = k === 'pais' ? String(val).toUpperCase() : val
    }
    const dto = plainToInstance(CreatePacienteDto, limpio)
    const errs = validateSync(dto, { whitelist: true, forbidNonWhitelisted: false })
    if (errs.length) return { error: errs.map((e) => Object.values(e.constraints ?? {}).join(', ')).join('; ') }
    return { dto }
  }

  async importXlsx(consultorioId: number, usuarioId: number, buffer: Buffer, actualizarExistentes: boolean) {
    const filas = await parseWorkbook(buffer)
    let creados = 0, actualizados = 0, omitidos = 0
    const errores: Array<{ fila: number; motivo: string }> = []

    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < filas.length; i++) {
        const nroFila = i + 2 // +1 header, +1 base-1
        const { dto, error } = this.validarFila(filas[i])
        if (error || !dto) { errores.push({ fila: nroFila, motivo: error ?? 'fila invalida' }); continue }

        const existente = dto.dni?.trim()
          ? await tx.paciente.findFirst({ where: { consultorioId, dni: dto.dni.trim(), deletedAt: null }, select: { id: true } })
          : await tx.paciente.findFirst({
              where: { consultorioId, deletedAt: null,
                nombre: { equals: dto.nombre, mode: 'insensitive' },
                apellido: { equals: dto.apellido, mode: 'insensitive' } },
              select: { id: true },
            })

        const data = {
          ...dto,
          ...(dto.fechaNacimiento ? { fechaNacimiento: new Date(dto.fechaNacimiento) } : {}),
        }

        if (existente) {
          if (!actualizarExistentes) { omitidos++; continue }
          await tx.paciente.update({ where: { id: existente.id }, data })
          actualizados++
        } else {
          await tx.paciente.create({ data: { ...data, consultorioId } })
          creados++
        }
      }

      await tx.log.create({
        data: {
          consultorioId, usuarioId, entidad: 'paciente_import', entidadId: 0,
          accion: 'CREATE',
          payloadDespues: { creados, actualizados, omitidos, errores: errores.length } as object,
        },
      })
    })

    return { creados, actualizados, omitidos, errores }
  }

  async exportXlsx(consultorioId: number) {
    const pacientes = await this.prisma.paciente.findMany({
      where: { consultorioId, deletedAt: null },
      orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
      select: { nombre: true, apellido: true, dni: true, telefono: true, pais: true,
        email: true, sexo: true, fechaNacimiento: true, direccion: true, notas: true },
    })
    return buildWorkbook(
      pacientes.map((p) => ({
        nombre: p.nombre, apellido: p.apellido, dni: p.dni ?? '', telefono: p.telefono ?? '',
        pais: p.pais ?? '', email: p.email ?? '', sexo: p.sexo ?? '',
        fechaNacimiento: p.fechaNacimiento ? p.fechaNacimiento.toISOString().slice(0, 10) : '',
        direccion: p.direccion ?? '', notas: p.notas ?? '',
      })),
    )
  }

  async sampleXlsx() { return buildSample() }

  async softDelete(consultorioId: number, id: number) {
    await this.findOne(consultorioId, id)
    return this.prisma.paciente.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
  }
}
