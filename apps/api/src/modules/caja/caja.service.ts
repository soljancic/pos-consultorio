import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { IsNumber, Min, IsString, IsOptional } from 'class-validator'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../prisma/prisma.service'

export class CerrarCajaDto {
  // Arqueo ciego: el efectivo contado se declara SIN ver el esperado
  @IsNumber() @Min(0)
  montoDeclarado: number

  @IsString() @IsOptional()
  notasCierre?: string
}

export class RevisarCajaDto {
  @IsString() @IsOptional()
  nota?: string
}

// El dia de caja es el dia LOCAL del negocio (server en el timezone del
// consultorio para el MVP). Con fecha UTC, despues de las 20:00 GMT-4 los
// cobros caian en la caja del dia siguiente.
export function diaCajaLocal(): { clave: Date; inicioLocal: Date; finLocal: Date } {
  const ahora = new Date()
  const y = ahora.getFullYear()
  const m = String(ahora.getMonth() + 1).padStart(2, '0')
  const d = String(ahora.getDate()).padStart(2, '0')
  const diaStr = `${y}-${m}-${d}`
  return {
    // Clave para la columna @db.Date (se persiste como dia calendario)
    clave: new Date(`${diaStr}T00:00:00Z`),
    // Rango de instantes reales del dia local (para filtrar citas/pagos)
    inicioLocal: new Date(`${diaStr}T00:00:00`),
    finLocal: new Date(new Date(`${diaStr}T00:00:00`).getTime() + 24 * 60 * 60 * 1000),
  }
}

@Injectable()
export class CajaService {
  constructor(private prisma: PrismaService) {}

  async getHoy(consultorioId: number) {
    const { clave: hoy, inicioLocal, finLocal } = diaCajaLocal()

    const caja = await this.prisma.cajaDiaria.findUnique({
      where: { consultorioId_fecha: { consultorioId, fecha: hoy } },
    })

    const pagos = await this.prisma.pago.findMany({
      where: {
        cobro: { consultorioId },
        createdAt: { gte: inicioLocal, lt: finLocal },
      },
      include: {
        cobro: {
          include: {
            cita: {
              include: {
                paciente: { select: { nombre: true, apellido: true } },
                doctor: { select: { nombre: true } },
                servicio: { select: { nombre: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    // MVP: "Total del dia. Total por forma de pago. Nuevas deudas. Pagos de deuda"
    // Pago cuya cita es de un dia local anterior a hoy = cobro de deuda vieja
    const pagosDeudaAnterior = pagos
      .filter((p) => new Date(p.cobro.cita.fechaHora) < inicioLocal)
      .reduce((acc, p) => acc + Number(p.monto), 0)

    // Nuevas deudas: saldo pendiente de cobros de citas de HOY (dia local) ya prestadas
    const cobrosHoy = await this.prisma.cobro.findMany({
      where: {
        consultorioId,
        saldoPendiente: { gt: 0 },
        cita: {
          fechaHora: { gte: inicioLocal, lt: finLocal },
          estado: { in: ['ATENDIDA', 'CON_DEUDA'] },
          deletedAt: null,
        },
      },
      select: { saldoPendiente: true },
    })
    const nuevasDeudas = cobrosHoy.reduce((acc, c) => acc + Number(c.saldoPendiente), 0)

    // Egresos del dia (E2-M8): solo CAJA_EFECTIVO descuenta del arqueo;
    // el resto (banco/otro) se informa pero no toca el efectivo fisico
    const { egresosEfectivo, egresosTotales } = await this.egresosDelDia(consultorioId)

    return { caja, pagos, pagosDeudaAnterior, nuevasDeudas, egresosEfectivo, egresosTotales }
  }

  private async egresosDelDia(consultorioId: number) {
    const { clave: hoy } = diaCajaLocal()
    const gastos = await this.prisma.gasto.findMany({
      where: { consultorioId, fecha: hoy, deletedAt: null },
      select: { monto: true, cuenta: true },
    })
    const egresosTotales = gastos.reduce((acc, g) => acc + Number(g.monto), 0)
    const egresosEfectivo = gastos
      .filter((g) => g.cuenta === 'CAJA_EFECTIVO')
      .reduce((acc, g) => acc + Number(g.monto), 0)
    return { egresosEfectivo, egresosTotales }
  }

  // Cierre con arqueo ciego (E2-M2): solo el efectivo participa (QR/tarjeta/
  // vales son rastreables). Diferencia 0 se auto-aprueba; si no, queda
  // pendiente de revision del ADMIN. El esperado se snapshotea: una reversa
  // posterior del mismo dia puede mover totalEfectivo.
  async cerrar(consultorioId: number, usuarioId: number, dto: CerrarCajaDto) {
    const { clave: hoy } = diaCajaLocal()

    const caja = await this.prisma.cajaDiaria.findUnique({
      where: { consultorioId_fecha: { consultorioId, fecha: hoy } },
    })
    if (!caja) throw new NotFoundException('No hay caja con movimientos hoy')
    if (caja.cerrada) throw new BadRequestException('La caja de hoy ya esta cerrada')

    const declarado = new Decimal(dto.montoDeclarado)
    // El esperado es el efectivo NETO: cobros menos gastos en efectivo del dia
    const { egresosEfectivo } = await this.egresosDelDia(consultorioId)
    const esperado = caja.totalEfectivo.minus(egresosEfectivo)
    const diferencia = declarado.minus(esperado)
    const sinDiferencia = diferencia.isZero()

    const [actualizada] = await this.prisma.$transaction([
      this.prisma.cajaDiaria.update({
        where: { consultorioId_fecha: { consultorioId, fecha: hoy } },
        data: {
          cerrada: true,
          cierreAt: new Date(),
          usuarioCierreId: usuarioId,
          montoDeclarado: declarado,
          montoEsperado: esperado,
          diferencia,
          notasCierre: dto.notasCierre,
          ...(sinDiferencia && {
            revisadaPorId: usuarioId,
            revisadaAt: new Date(),
            notasRevision: 'auto: sin diferencia',
          }),
        },
      }),
      this.prisma.log.create({
        data: {
          consultorioId,
          usuarioId,
          entidad: 'CajaDiaria',
          entidadId: caja.id,
          accion: 'UPDATE',
          payloadAntes: { cerrada: false, totalEfectivo: esperado.toString() },
          payloadDespues: {
            cerrada: true,
            montoDeclarado: declarado.toString(),
            diferencia: diferencia.toString(),
            autoAprobada: sinDiferencia,
          },
        },
      }),
    ])

    return actualizada
  }

  // Revision del ADMIN para cierres con diferencia (alerta, no bloquea)
  async revisar(consultorioId: number, cajaId: number, dto: RevisarCajaDto, usuarioId: number) {
    const caja = await this.prisma.cajaDiaria.findFirst({
      where: { id: cajaId, consultorioId },
    })
    if (!caja) throw new NotFoundException('Caja no encontrada')
    if (!caja.cerrada) throw new BadRequestException('La caja no esta cerrada')
    if (caja.revisadaAt) throw new BadRequestException('La caja ya fue revisada')

    const [actualizada] = await this.prisma.$transaction([
      this.prisma.cajaDiaria.update({
        where: { id: cajaId },
        data: {
          revisadaPorId: usuarioId,
          revisadaAt: new Date(),
          notasRevision: dto.nota,
        },
      }),
      this.prisma.log.create({
        data: {
          consultorioId,
          usuarioId,
          entidad: 'CajaDiaria',
          entidadId: cajaId,
          accion: 'UPDATE',
          payloadAntes: { diferencia: caja.diferencia?.toString() ?? null, revisada: false },
          payloadDespues: { revisada: true, nota: dto.nota ?? null },
        },
      }),
    ])

    return actualizada
  }

  async getHistorial(consultorioId: number, desde: string, hasta: string) {
    return this.prisma.cajaDiaria.findMany({
      where: {
        consultorioId,
        fecha: { gte: new Date(desde), lte: new Date(hasta) },
      },
      orderBy: { fecha: 'desc' },
    })
  }
}
