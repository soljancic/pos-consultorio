import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { EstadoLiquidacion, Prisma } from '@prisma/client'
import { IsEnum, IsNotEmpty, IsString, ValidateIf } from 'class-validator'
import { LiquidacionFiltersDto } from './dto/liquidacion-filters.dto'

export class CambiarEstadoLiquidacionDto {
  @IsEnum(EstadoLiquidacion)
  estado: EstadoLiquidacion

  @ValidateIf((o) => o.estado === EstadoLiquidacion.RECHAZADO)
  @IsString()
  @IsNotEmpty()
  motivo?: string
}

const TRANSICIONES: Record<EstadoLiquidacion, EstadoLiquidacion[]> = {
  PENDIENTE: [EstadoLiquidacion.FACTURADO, EstadoLiquidacion.RECHAZADO],
  FACTURADO: [EstadoLiquidacion.PAGADO, EstadoLiquidacion.RECHAZADO],
  PAGADO: [],
  RECHAZADO: [EstadoLiquidacion.PENDIENTE],
}

@Injectable()
export class LiquidacionesService {
  constructor(private prisma: PrismaService) {}

  private whereBase(consultorioId: number, f: LiquidacionFiltersDto): Prisma.LiquidacionItemWhereInput {
    return {
      consultorioId,
      ...(f.aseguradoraId ? { aseguradoraId: f.aseguradoraId } : {}),
      ...(f.pacienteId ? { pacienteId: f.pacienteId } : {}),
      ...(f.desde || f.hasta ? {
        fecha: {
          ...(f.desde ? { gte: new Date(`${f.desde}T00:00:00Z`) } : {}),
          ...(f.hasta ? (() => { const hastaExcl = new Date(`${f.hasta}T00:00:00Z`); hastaExcl.setUTCDate(hastaExcl.getUTCDate() + 1); return { lt: hastaExcl } })() : {}),
        },
      } : {}),
    }
  }

  async findAll(consultorioId: number, f: LiquidacionFiltersDto) {
    const base = this.whereBase(consultorioId, f)
    const where: Prisma.LiquidacionItemWhereInput = { ...base, ...(f.estado ? { estado: f.estado } : {}) }

    const includeRow = {
      aseguradora: { select: { id: true, nombre: true } },
      paciente: { select: { id: true, nombre: true, apellido: true } },
      servicio: { select: { id: true, nombre: true } },
      categoriaSeguro: { select: { id: true, nombre: true } },
    }
    const orderBy = [{ fecha: 'desc' as const }, { id: 'desc' as const }]

    // Totales por estado sobre el filtro base (sin el estado puntual): para el panel de resumen
    const porEstado = await this.prisma.liquidacionItem.groupBy({
      by: ['estado'], where: base, _sum: { montoAseguradora: true }, _count: { _all: true },
    })
    const totales = { pendiente: 0, facturado: 0, pagado: 0, rechazado: 0, cantidad: 0 }
    for (const g of porEstado) {
      const monto = Number(g._sum.montoAseguradora ?? 0)
      totales.cantidad += g._count._all
      if (g.estado === 'PENDIENTE') totales.pendiente = monto
      else if (g.estado === 'FACTURADO') totales.facturado = monto
      else if (g.estado === 'PAGADO') totales.pagado = monto
      else if (g.estado === 'RECHAZADO') totales.rechazado = monto
    }

    if (f.export === '1') {
      const rows = await this.prisma.liquidacionItem.findMany({ where, include: includeRow, orderBy })
      return { rows, total: rows.length, page: 1, pageSize: rows.length, totales }
    }
    const page = f.page ?? 1
    const pageSize = f.pageSize ?? 25
    const [rows, total] = await Promise.all([
      this.prisma.liquidacionItem.findMany({ where, include: includeRow, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.liquidacionItem.count({ where }),
    ])
    return { rows, total, page, pageSize, totales }
  }

  async cambiarEstado(
    consultorioId: number,
    usuarioId: number,
    id: number,
    dto: CambiarEstadoLiquidacionDto,
  ) {
    const item = await this.prisma.liquidacionItem.findFirst({ where: { id, consultorioId } })
    if (!item) throw new NotFoundException(`LiquidacionItem ${id} no encontrado`)

    if (!TRANSICIONES[item.estado].includes(dto.estado)) {
      throw new BadRequestException(
        `Transición inválida: ${item.estado} → ${dto.estado}. Permitidas: ${TRANSICIONES[item.estado].join(', ') || 'ninguna'}`,
      )
    }

    const data: Prisma.LiquidacionItemUpdateInput = { estado: dto.estado }
    if (dto.estado === EstadoLiquidacion.FACTURADO) data.facturadoAt = new Date()
    else if (dto.estado === EstadoLiquidacion.PAGADO) data.pagadoAt = new Date()
    else if (dto.estado === EstadoLiquidacion.RECHAZADO) data.rechazoMotivo = dto.motivo
    else if (dto.estado === EstadoLiquidacion.PENDIENTE) data.rechazoMotivo = null

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.liquidacionItem.update({ where: { id }, data })
      await tx.log.create({
        data: {
          consultorioId,
          usuarioId,
          entidad: 'LiquidacionItem',
          entidadId: id,
          accion: 'UPDATE',
          payloadAntes: { estado: item.estado },
          payloadDespues: {
            estado: dto.estado,
            ...(dto.motivo !== undefined ? { motivo: dto.motivo } : {}),
          },
        },
      })
      return updated
    })
  }
}
