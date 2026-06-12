import { Injectable, NotFoundException } from '@nestjs/common'
import { IsString, IsNotEmpty, IsOptional, IsEmail, IsISO8601, IsIn, IsBoolean } from 'class-validator'
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

  @IsString() @IsOptional()
  telefono?: string

  @IsString() @IsOptional()
  whatsapp?: string

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
}

export class UpdatePacienteDto extends PartialType(CreatePacienteDto) {
  // E3 item 11: el staff puede marcar/desmarcar el prepago manualmente
  // (ademas del auto-flag al tercer no-show)
  @IsBoolean() @IsOptional()
  requierePrepago?: boolean
}

@Injectable()
export class PacientesService {
  constructor(private prisma: PrismaService) {}

  async findAll(consultorioId: number, search?: string) {
    return this.prisma.paciente.findMany({
      where: {
        consultorioId,
        deletedAt: null,
        ...(search && {
          OR: [
            { nombre: { contains: search, mode: 'insensitive' } },
            { apellido: { contains: search, mode: 'insensitive' } },
            { dni: { contains: search } },
            { whatsapp: { contains: search } },
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
        whatsapp: true,
        email: true,
        deudaTotal: true,
        requierePrepago: true,
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
      },
    })
    if (!paciente) throw new NotFoundException('Paciente no encontrado')

    // E3 item 11: contador de inasistencias historicas del paciente
    const noShows = await this.prisma.cita.count({
      where: { pacienteId: id, consultorioId, deletedAt: null, estado: EstadoCita.NO_ASISTIO },
    })
    return { ...paciente, noShows }
  }

  async create(consultorioId: number, dto: CreatePacienteDto) {
    return this.prisma.paciente.create({
      data: {
        ...dto,
        consultorioId,
        fechaNacimiento: dto.fechaNacimiento ? new Date(dto.fechaNacimiento) : undefined,
      },
    })
  }

  async update(consultorioId: number, id: number, dto: UpdatePacienteDto) {
    await this.findOne(consultorioId, id)
    return this.prisma.paciente.update({
      where: { id },
      data: {
        ...dto,
        fechaNacimiento: dto.fechaNacimiento ? new Date(dto.fechaNacimiento) : undefined,
      },
    })
  }

  async softDelete(consultorioId: number, id: number) {
    await this.findOne(consultorioId, id)
    return this.prisma.paciente.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
  }
}
