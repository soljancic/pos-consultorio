import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator'
import { PartialType } from '@nestjs/swagger'
import { PrismaService } from '../../prisma/prisma.service'

export class CreateTipoGastoDto {
  @IsString() @IsNotEmpty()
  nombre: string
}

export class UpdateTipoGastoDto extends PartialType(CreateTipoGastoDto) {
  @IsBoolean() @IsOptional()
  activo?: boolean
}

@Injectable()
export class TiposGastoService {
  constructor(private prisma: PrismaService) {}

  findAll(consultorioId: number, incluirInactivos = false) {
    return this.prisma.tipoGasto.findMany({
      where: { consultorioId, ...(incluirInactivos ? {} : { activo: true }) },
      orderBy: { nombre: 'asc' },
    })
  }

  create(consultorioId: number, dto: CreateTipoGastoDto) {
    return this.prisma.tipoGasto.create({ data: { ...dto, consultorioId } })
  }

  async update(consultorioId: number, id: number, dto: UpdateTipoGastoDto) {
    const t = await this.prisma.tipoGasto.findFirst({ where: { id, consultorioId } })
    if (!t) throw new NotFoundException()
    // No inactivar un tipo con gastos no borrados
    if (dto.activo === false) {
      const enUso = await this.prisma.gasto.count({
        where: { consultorioId, tipoGastoId: id, deletedAt: null },
      })
      if (enUso > 0) throw new ConflictException('No se puede inactivar: hay gastos con este tipo')
    }
    return this.prisma.tipoGasto.update({ where: { id }, data: dto })
  }

  // Eliminar si no esta usado; si la FK lo impide (hay gastos, incluso
  // borrados, que lo referencian) se desactiva en su lugar y se avisa.
  async remove(consultorioId: number, id: number) {
    const t = await this.prisma.tipoGasto.findFirst({ where: { id, consultorioId } })
    if (!t) throw new NotFoundException()
    // Cuenta TODOS los gastos (la FK es RESTRICT y el soft delete no borra filas)
    const enUso = await this.prisma.gasto.count({ where: { tipoGastoId: id } })
    if (enUso > 0) {
      const tipo = await this.prisma.tipoGasto.update({ where: { id }, data: { activo: false } })
      return { eliminado: false, enUso: true, tipo }
    }
    await this.prisma.tipoGasto.delete({ where: { id } })
    return { eliminado: true }
  }
}
