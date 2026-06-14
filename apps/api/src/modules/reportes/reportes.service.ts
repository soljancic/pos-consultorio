import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

// Item 29: reporte mensual + desglose por doctor (ADMIN).
// Convencion de fechas del proyecto: el mes es calendario LOCAL del
// consultorio (el server corre en su timezone), igual que caja/agenda.
@Injectable()
export class ReportesService {
  constructor(private prisma: PrismaService) {}

  async mensual(consultorioId: number, mes?: string) {
    const hoy = new Date()
    const mesNorm = mes ?? `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mesNorm)) {
      throw new BadRequestException('mes debe tener formato YYYY-MM')
    }
    const inicio = new Date(`${mesNorm}-01T00:00:00`)
    const fin = new Date(inicio)
    fin.setMonth(fin.getMonth() + 1)

    const [pagos, citas, gastos] = await Promise.all([
      // Pagos del mes con su doctor; las reversas (monto negativo) netean solas
      this.prisma.pago.findMany({
        where: {
          createdAt: { gte: inicio, lt: fin },
          cobro: { consultorioId },
        },
        select: {
          monto: true,
          tipoCuenta: { select: { nombre: true } },
          cobro: { select: { cita: { select: { doctorId: true } } } },
        },
      }),
      this.prisma.cita.findMany({
        where: {
          consultorioId,
          deletedAt: null,
          fechaHora: { gte: inicio, lt: fin },
        },
        select: { estado: true, doctorId: true, pacienteId: true },
      }),
      this.prisma.gasto.groupBy({
        by: ['tipoGastoId'],
        where: { consultorioId, deletedAt: null, fecha: { gte: inicio, lt: fin } },
        _sum: { monto: true },
      }),
    ])

    const doctores = await this.prisma.doctor.findMany({
      where: { consultorioId },
      select: { id: true, nombre: true, comisionPct: true },
    })
    const infoDoctor = new Map(doctores.map((d) => [d.id, d]))

    const tiposGasto = await this.prisma.tipoGasto.findMany({
      where: { consultorioId },
      select: { id: true, nombre: true },
    })
    const nombreTipo = new Map(tiposGasto.map((t) => [t.id, t.nombre]))

    // Ingresos totales y por forma de pago
    let ingresosTotal = 0
    const porFormaPago: Record<string, number> = {}
    const ingresosPorDoctor = new Map<number, number>()
    for (const p of pagos) {
      const monto = Number(p.monto)
      ingresosTotal += monto
      const cuenta = p.tipoCuenta.nombre
      porFormaPago[cuenta] = (porFormaPago[cuenta] ?? 0) + monto
      const docId = p.cobro.cita.doctorId
      ingresosPorDoctor.set(docId, (ingresosPorDoctor.get(docId) ?? 0) + monto)
    }

    // Citas por estado + actividad por doctor
    const ESTADOS_ATENDIDA = ['ATENDIDA', 'COBRADO', 'CON_DEUDA']
    const porEstado: Record<string, number> = {}
    const statsDoctor = new Map<number, { atendidas: number; canceladas: number; noShows: number; pacientes: Set<number> }>()
    for (const c of citas) {
      porEstado[c.estado] = (porEstado[c.estado] ?? 0) + 1
      let st = statsDoctor.get(c.doctorId)
      if (!st) {
        st = { atendidas: 0, canceladas: 0, noShows: 0, pacientes: new Set() }
        statsDoctor.set(c.doctorId, st)
      }
      if (ESTADOS_ATENDIDA.includes(c.estado)) {
        st.atendidas += 1
        st.pacientes.add(c.pacienteId)
      }
      if (c.estado === 'CANCELADA') st.canceladas += 1
      if (c.estado === 'NO_ASISTIO') st.noShows += 1
    }

    const gastosTotal = gastos.reduce((acc, g) => acc + Number(g._sum.monto ?? 0), 0)

    const doctorIds = new Set<number>([...statsDoctor.keys(), ...ingresosPorDoctor.keys()])
    const porDoctor = [...doctorIds]
      .map((id) => {
        const st = statsDoctor.get(id)
        const info = infoDoctor.get(id)
        const ingresos = ingresosPorDoctor.get(id) ?? 0
        // E4 item 21: liquidacion = % del doctor sobre sus pagos netos del mes
        const comisionPct = info?.comisionPct ? Number(info.comisionPct) : null
        return {
          doctorId: id,
          nombre: info?.nombre ?? `Doctor ${id}`,
          citasAtendidas: st?.atendidas ?? 0,
          canceladas: st?.canceladas ?? 0,
          noShows: st?.noShows ?? 0,
          pacientesAtendidos: st?.pacientes.size ?? 0,
          ingresos,
          comisionPct,
          comision: comisionPct !== null ? Math.round(ingresos * comisionPct) / 100 : null,
        }
      })
      .sort((a, b) => b.ingresos - a.ingresos)

    const totalComisiones = porDoctor.reduce((acc, d) => acc + (d.comision ?? 0), 0)

    return {
      mes: mesNorm,
      ingresos: { total: ingresosTotal, porFormaPago },
      gastos: {
        total: gastosTotal,
        porCategoria: gastos.map((g) => ({
          categoria: nombreTipo.get(g.tipoGastoId) ?? 'Otros',
          total: Number(g._sum.monto ?? 0),
        })),
      },
      resultadoNeto: ingresosTotal - gastosTotal,
      citas: { total: citas.length, porEstado },
      porDoctor,
      totalComisiones,
    }
  }
}
