import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator'
import { PartialType } from '@nestjs/swagger'
import { PrismaService } from '../../prisma/prisma.service'

export class CreateTipoCuentaDto {
  @IsString() @IsNotEmpty()
  nombre: string

  @IsBoolean() @IsOptional()
  esEfectivo?: boolean
}

export class UpdateTipoCuentaDto extends PartialType(CreateTipoCuentaDto) {
  @IsBoolean() @IsOptional()
  activo?: boolean
}

@Injectable()
export class TiposCuentaService {
  constructor(private prisma: PrismaService) {}

  findAll(consultorioId: number, incluirInactivos = false) {
    return this.prisma.tipoCuenta.findMany({
      where: { consultorioId, ...(incluirInactivos ? {} : { activo: true }) },
      orderBy: { nombre: 'asc' },
    })
  }

  async create(consultorioId: number, dto: CreateTipoCuentaDto) {
    return this.prisma.$transaction(async (tx) => {
      // Solo 0 o 1 cuenta con esEfectivo por consultorio: la nueva desplaza
      if (dto.esEfectivo) {
        await tx.tipoCuenta.updateMany({
          where: { consultorioId, esEfectivo: true },
          data: { esEfectivo: false },
        })
      }
      return tx.tipoCuenta.create({ data: { ...dto, consultorioId } })
    })
  }

  async update(consultorioId: number, id: number, dto: UpdateTipoCuentaDto) {
    const t = await this.prisma.tipoCuenta.findFirst({ where: { id, consultorioId } })
    if (!t) throw new NotFoundException()
    if (dto.activo === false) {
      const enUso = await this.prisma.gasto.count({
        where: { consultorioId, tipoCuentaId: id, deletedAt: null },
      })
      if (enUso > 0) throw new ConflictException('No se puede inactivar: hay gastos con esta cuenta')
    }
    return this.prisma.$transaction(async (tx) => {
      if (dto.esEfectivo) {
        await tx.tipoCuenta.updateMany({
          where: { consultorioId, esEfectivo: true, id: { not: id } },
          data: { esEfectivo: false },
        })
      }
      return tx.tipoCuenta.update({ where: { id }, data: dto })
    })
  }

  // Eliminar si no esta usada; si la FK lo impide (hay gastos, incluso
  // borrados, que la referencian) se desactiva en su lugar y se avisa.
  async remove(consultorioId: number, id: number) {
    const t = await this.prisma.tipoCuenta.findFirst({ where: { id, consultorioId } })
    if (!t) throw new NotFoundException()
    // Cuenta TODOS los gastos (la FK es RESTRICT y el soft delete no borra filas)
    const enUso = await this.prisma.gasto.count({ where: { tipoCuentaId: id } })
    if (enUso > 0) {
      const tipo = await this.prisma.tipoCuenta.update({ where: { id }, data: { activo: false } })
      return { eliminado: false, enUso: true, tipo }
    }
    await this.prisma.tipoCuenta.delete({ where: { id } })
    return { eliminado: true }
  }
}
