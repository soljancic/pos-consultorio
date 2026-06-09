import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

export class CreatePacienteDto {
  nombre: string
  apellido: string
  dni?: string
  telefono?: string
  whatsapp?: string
  email?: string
  fechaNacimiento?: string
  notas?: string
}

export class UpdatePacienteDto extends CreatePacienteDto {}

@Injectable()
export class PacientesService {
  constructor(private prisma: PrismaService) {}

  async findAll(consultorioId: string, search?: string) {
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
        createdAt: true,
      },
    })
  }

  async findOne(consultorioId: string, id: string) {
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
            cobro: { select: { total: true, saldoPendiente: true, estado: true } },
          },
        },
      },
    })
    if (!paciente) throw new NotFoundException('Paciente no encontrado')
    return paciente
  }

  async create(consultorioId: string, dto: CreatePacienteDto) {
    return this.prisma.paciente.create({
      data: {
        ...dto,
        consultorioId,
        fechaNacimiento: dto.fechaNacimiento ? new Date(dto.fechaNacimiento) : undefined,
      },
    })
  }

  async update(consultorioId: string, id: string, dto: UpdatePacienteDto) {
    await this.findOne(consultorioId, id)
    return this.prisma.paciente.update({
      where: { id },
      data: {
        ...dto,
        fechaNacimiento: dto.fechaNacimiento ? new Date(dto.fechaNacimiento) : undefined,
      },
    })
  }

  async softDelete(consultorioId: string, id: string) {
    await this.findOne(consultorioId, id)
    return this.prisma.paciente.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
  }
}
