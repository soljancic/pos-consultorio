import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { IsNumber, Min, IsString, IsOptional } from 'class-validator'
import { Decimal } from '@prisma/client/runtime/library'
import { PrismaService } from '../../prisma/prisma.service'
import { MailService } from '../mail/mail.service'

export class AbrirCajaDto {
  // Caja chica con la que arranca la jornada
  @IsNumber() @Min(0)
  montoInicial: number

  @IsString() @IsOptional()
  notasApertura?: string
}

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
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  // Chip global del shell: sin montos, solo el estado del turno de hoy
  async getEstado(consultorioId: number) {
    const { clave: hoy } = diaCajaLocal()
    const caja = await this.prisma.cajaDiaria.findUnique({
      where: { consultorioId_fecha: { consultorioId, fecha: hoy } },
      select: { cerrada: true },
    })
    return {
      existe: !!caja,
      abierta: !!caja && !caja.cerrada,
      cerrada: !!caja && caja.cerrada,
    }
  }

  async getHoy(consultorioId: number, rol?: string) {
    const { clave: hoy, inicioLocal, finLocal } = diaCajaLocal()

    let caja: Record<string, unknown> | null = await this.prisma.cajaDiaria.findUnique({
      where: { consultorioId_fecha: { consultorioId, fecha: hoy } },
    })

    // Arqueo ciego ESTRICTO (mejora anotada en E2-M2): mientras el turno
    // este abierto, quien no es ADMIN no ve los agregados de efectivo (con
    // ellos se deduce el esperado y el conteo deja de ser ciego). Los pagos
    // individuales siguen visibles: son la operacion del dia.
    const ocultarEfectivo = !!caja && !caja.cerrada && rol !== 'ADMIN'
    if (ocultarEfectivo) {
      caja = { ...caja, montoInicial: null, totalEfectivo: null, totalGeneral: null }
    }

    const pagos = await this.prisma.pago.findMany({
      where: {
        cobro: { consultorioId },
        createdAt: { gte: inicioLocal, lt: finLocal },
      },
      include: {
        tipoCuenta: { select: { id: true, nombre: true, esEfectivo: true } },
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

    // Desglose por forma de pago (cuenta): reemplaza las columnas fijas. Neto
    // de reversas (pagos negativos). El efectivo se enmascara igual que el total.
    const porCuenta = new Map<number, { id: number; nombre: string; esEfectivo: boolean; total: number }>()
    for (const p of pagos) {
      const tc = p.tipoCuenta
      const acc = porCuenta.get(tc.id) ?? { id: tc.id, nombre: tc.nombre, esEfectivo: tc.esEfectivo, total: 0 }
      acc.total += Number(p.monto)
      porCuenta.set(tc.id, acc)
    }
    const desglosePagos = Array.from(porCuenta.values()).map((c) => ({
      ...c,
      total: ocultarEfectivo && c.esEfectivo ? null : c.total,
    }))

    // MVP: "Total del dia. Total por forma de pago. Nuevas deudas. Pagos de deuda"
    // Pago cuya cita es de un dia local anterior a hoy = cobro de deuda vieja
    const pagosDeudaAnterior = pagos
      .filter((p) => new Date(p.cobro.cita!.fechaHora) < inicioLocal)
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

    return { caja, pagos, desglosePagos, pagosDeudaAnterior, nuevasDeudas, egresosEfectivo, egresosTotales }
  }

  private async egresosDelDia(consultorioId: number) {
    const { clave: hoy } = diaCajaLocal()
    const gastos = await this.prisma.gasto.findMany({
      where: { consultorioId, fecha: hoy, deletedAt: null },
      select: { monto: true, tipoCuenta: { select: { esEfectivo: true } } },
    })
    const egresosTotales = gastos.reduce((acc, g) => acc + Number(g.monto), 0)
    const egresosEfectivo = gastos
      .filter((g) => g.tipoCuenta.esEfectivo)
      .reduce((acc, g) => acc + Number(g.monto), 0)
    return { egresosEfectivo, egresosTotales }
  }

  // Apertura del turno (E2-M9): la jornada arranca declarando la caja chica.
  // Sin caja abierta no se cobra ni se registra gastos (guards en cobros y
  // gastos); el arqueo contempla el monto inicial.
  async abrir(consultorioId: number, usuarioId: number, dto: AbrirCajaDto) {
    const { clave: hoy } = diaCajaLocal()
    const existente = await this.prisma.cajaDiaria.findUnique({
      where: { consultorioId_fecha: { consultorioId, fecha: hoy } },
    })
    if (existente) {
      throw new BadRequestException(
        existente.cerrada ? 'La caja de hoy ya fue cerrada' : 'La caja de hoy ya esta abierta',
      )
    }

    const [caja] = await this.prisma.$transaction([
      this.prisma.cajaDiaria.create({
        data: {
          consultorioId,
          fecha: hoy,
          usuarioAperturaId: usuarioId,
          abiertaAt: new Date(),
          montoInicial: new Decimal(dto.montoInicial),
          notasApertura: dto.notasApertura,
        },
      }),
      this.prisma.log.create({
        data: {
          consultorioId,
          usuarioId,
          entidad: 'CajaDiaria',
          entidadId: 0,
          accion: 'CREATE',
          payloadDespues: { montoInicial: dto.montoInicial, notas: dto.notasApertura ?? null },
        },
      }),
    ])
    return caja
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
    if (!caja) throw new NotFoundException('No hay caja abierta hoy')
    if (caja.cerrada) throw new BadRequestException('La caja de hoy ya esta cerrada')

    const declarado = new Decimal(dto.montoDeclarado)
    // Esperado = caja chica inicial + cobros en efectivo - gastos en efectivo
    const { egresosEfectivo } = await this.egresosDelDia(consultorioId)
    const esperado = caja.montoInicial.plus(caja.totalEfectivo).minus(egresosEfectivo)
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

    // Resumen del turno por email (fire-and-forget): un fallo de Resend NO
    // rompe ni demora el cierre; queda en el log del server
    this.enviarResumenCierre(consultorioId, caja, esperado, declarado, diferencia, egresosEfectivo, usuarioId)
      .catch(() => {})

    return actualizada
  }

  // Envia el resumen del cierre al email configurado en el consultorio (si lo
  // hay). Toda la aritmetica monetaria ya esta hecha con Decimal; aca solo se
  // formatea para mostrar.
  private async enviarResumenCierre(
    consultorioId: number,
    caja: {
      montoInicial: Decimal; totalEfectivo: Decimal
      abiertaAt: Date | null; usuarioAperturaId: number
    },
    esperado: Decimal,
    declarado: Decimal,
    diferencia: Decimal,
    egresosEfectivo: number,
    usuarioCierreId: number,
  ) {
    const consultorio = await this.prisma.consultorio.findUnique({
      where: { id: consultorioId },
      select: { nombre: true, moneda: true, emailCierreCaja: true },
    })
    if (!consultorio?.emailCierreCaja) return

    const { inicioLocal, finLocal } = diaCajaLocal()
    const [abrioUser, cerroUser, pagosTurno] = await Promise.all([
      this.prisma.usuario.findUnique({ where: { id: caja.usuarioAperturaId }, select: { nombre: true } }),
      this.prisma.usuario.findUnique({ where: { id: usuarioCierreId }, select: { nombre: true } }),
      this.prisma.pago.findMany({
        where: { cobro: { consultorioId }, createdAt: { gte: inicioLocal, lt: finLocal } },
        select: { monto: true, tipoCuenta: { select: { nombre: true } } },
      }),
    ])

    const monto = (v: Decimal | number) => Number(v).toFixed(2)
    // Ingresos por forma de pago (cuenta), neto de reversas
    const porCuenta = new Map<string, number>()
    for (const p of pagosTurno) {
      porCuenta.set(p.tipoCuenta.nombre, (porCuenta.get(p.tipoCuenta.nombre) ?? 0) + Number(p.monto))
    }
    const cuentas = Array.from(porCuenta.entries()).map(([nombre, total]) => ({ nombre, total: total.toFixed(2) }))
    const cantidadCobros = pagosTurno.length
    const hora = (d: Date) => d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false })
    const fechaTurno = inicioLocal.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' })

    const html = this.mail.htmlCierreCaja({
      consultorio: consultorio.nombre,
      fecha: fechaTurno,
      abrioPor: abrioUser?.nombre ?? '—',
      cerroPor: cerroUser?.nombre ?? '—',
      horaApertura: caja.abiertaAt ? hora(caja.abiertaAt) : '—',
      horaCierre: hora(new Date()),
      moneda: consultorio.moneda,
      montoInicial: monto(caja.montoInicial),
      cuentas,
      gastos: monto(egresosEfectivo),
      esperado: monto(esperado),
      contado: monto(declarado),
      diferencia: monto(diferencia),
      hayDiferencia: !diferencia.isZero(),
      cantidadCobros,
    })
    await this.mail.enviar(
      consultorio.emailCierreCaja,
      `Cierre de caja · ${fechaTurno} · ${consultorio.nombre}`,
      html,
      consultorio.nombre,
    )
  }

  // Reabrir el turno de HOY ya cerrado (solo ADMIN): vuelve a aceptar
  // cobros/gastos. El arqueo anterior se descarta (al re-cerrar se declara
  // de nuevo) pero sus valores quedan en el log.
  async reabrir(consultorioId: number, usuarioId: number) {
    const { clave: hoy } = diaCajaLocal()
    const caja = await this.prisma.cajaDiaria.findUnique({
      where: { consultorioId_fecha: { consultorioId, fecha: hoy } },
    })
    if (!caja) throw new NotFoundException('Hoy no se abrio caja')
    if (!caja.cerrada) throw new BadRequestException('La caja de hoy no esta cerrada')

    const [actualizada] = await this.prisma.$transaction([
      this.prisma.cajaDiaria.update({
        where: { consultorioId_fecha: { consultorioId, fecha: hoy } },
        data: {
          cerrada: false,
          cierreAt: null,
          usuarioCierreId: null,
          montoDeclarado: null,
          montoEsperado: null,
          diferencia: null,
          notasCierre: null,
          revisadaPorId: null,
          revisadaAt: null,
          notasRevision: null,
        },
      }),
      this.prisma.log.create({
        data: {
          consultorioId,
          usuarioId,
          entidad: 'CajaDiaria',
          entidadId: caja.id,
          accion: 'UPDATE',
          payloadAntes: {
            cerrada: true,
            montoDeclarado: caja.montoDeclarado?.toString(),
            diferencia: caja.diferencia?.toString(),
          },
          payloadDespues: { cerrada: false, motivo: 'reapertura' },
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
