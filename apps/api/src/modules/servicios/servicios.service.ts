import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

export class CreateServicioDto {
  nombre: string
  descripcion?: string
  duracionMin: number
  precioBase: number
}

@Injectable()
export class ServiciosService {
  constructor(private prisma: PrismaService) {}

  findAll(consultorioId: string) {
    return this.prisma.servicio.findMany({ where: { consultorioId, activo: true }, orderBy: { nombre: 'asc' } })
  }

  create(consultorioId: string, dto: CreateServicioDto) {
    return this.prisma.servicio.create({ data: { ...dto, consultorioId } })
  }

  async update(consultorioId: string, id: string, dto: Partial<CreateServicioDto>) {
    const s = await this.prisma.servicio.findFirst({ where: { id, consultorioId } })
    if (!s) throw new NotFoundException()
    return this.prisma.servicio.update({ where: { id }, data: dto })
  }

  async remove(consultorioId: string, id: string) {
    const s = await this.prisma.servicio.findFirst({ where: { id, consultorioId } })
    if (!s) throw new NotFoundException()
    return this.prisma.servicio.update({ where: { id }, data: { activo: false } })
  }
}
