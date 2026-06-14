import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import type { ReportPage, CitaReportRow, CobranzaReportRow, GastoReportRow, PacienteReportRow, ServicioReportRow } from '@pos/types'
import { ReportFiltersDto } from './dto/report-filters.dto'

// Item 29: reporte mensual + desglose por doctor (ADMIN).
// Convencion de fechas del proyecto: el mes es calendario LOCAL del
// consultorio (el server corre en su timezone), igual que caja/agenda.
@Injectable()
export class ReportesService {
  constructor(private prisma: PrismaService) {}

  // Rango por dia calendario LOCAL (igual que caja/agenda y mensual()):
  // [desde 00:00, hasta+1dia 00:00)
  private rango(desde: string, hasta: string) {
    const ini = new Date(`${desde}T00:00:00`)
    const fin = new Date(`${hasta}T00:00:00`)
    fin.setDate(fin.getDate() + 1)
    return { ini, fin }
  }

  // DOCTOR ve solo lo suyo: devuelve el doctorId forzado (o undefined para ADMIN).
  // Si el usuario DOCTOR no tiene Doctor vinculado, fuerza -1 (resultado vacio).
  private async doctorIdForzado(
    consultorioId: number,
    rol: string,
    usuarioId: number,
    doctorIdFiltro?: number,
  ): Promise<number | undefined> {
    if (rol !== 'DOCTOR') return doctorIdFiltro
    const propio = await this.prisma.doctor.findFirst({
      where: { consultorioId, usuarioId },
      select: { id: true },
    })
    return propio?.id ?? -1
  }

  // export='1' devuelve todas las filas (para Excel); si no, pagina.
  private paginar<T>(rows: T[], f: { page?: number; pageSize?: number; export?: string }) {
    if (f.export === '1') return { slice: rows, total: rows.length }
    const page = f.page ?? 1, pageSize = f.pageSize ?? 25
    const start = (page - 1) * pageSize
    return { slice: rows.slice(start, start + pageSize), total: rows.length }
  }

  async citas(consultorioId: number, rol: string, usuarioId: number, f: ReportFiltersDto): Promise<ReportPage<CitaReportRow>> {
    const { ini, fin } = this.rango(f.desde, f.hasta)
    const doctorId = await this.doctorIdForzado(consultorioId, rol, usuarioId, f.doctorId)

    const citas = await this.prisma.cita.findMany({
      where: {
        consultorioId, deletedAt: null,
        fechaHora: { gte: ini, lt: fin },
        ...(doctorId !== undefined && { doctorId }),
        ...(f.servicioId && { servicioId: f.servicioId }),
        ...(f.pacienteId && { pacienteId: f.pacienteId }),
        ...(f.estado && { estado: f.estado }),
        ...(f.q && { paciente: { OR: [
          { nombre: { contains: f.q, mode: 'insensitive' } },
          { apellido: { contains: f.q, mode: 'insensitive' } },
        ] } }),
      },
      select: {
        id: true, fechaHora: true, estado: true, notasSecretaria: true,
        paciente: { select: { nombre: true, apellido: true } },
        doctor: { select: { nombre: true } },
        servicio: { select: { nombre: true, precioBase: true } },
        cobro: { select: { total: true } },
      },
      orderBy: { fechaHora: f.sortDir ?? 'desc' },
    })

    const ATENDIDA = ['ATENDIDA', 'COBRADO', 'CON_DEUDA']
    let atendidas = 0, canceladas = 0, noAsistio = 0
    for (const c of citas) {
      if (ATENDIDA.includes(c.estado)) atendidas++
      if (c.estado === 'CANCELADA') canceladas++
      if (c.estado === 'NO_ASISTIO') noAsistio++
    }

    const pagos = await this.prisma.pago.aggregate({
      _sum: { monto: true },
      where: { cobro: { consultorioId, cita: {
        fechaHora: { gte: ini, lt: fin }, deletedAt: null,
        ...(doctorId !== undefined && { doctorId }),
      } } },
    })
    const ingresos = Number(pagos._sum.monto ?? 0)

    const rows: CitaReportRow[] = citas.map((c) => ({
      id: c.id,
      fechaHora: c.fechaHora.toISOString(),
      paciente: `${c.paciente.nombre} ${c.paciente.apellido}`,
      doctor: c.doctor.nombre,
      servicio: c.servicio.nombre,
      estado: c.estado,
      monto: Number(c.cobro?.total ?? c.servicio.precioBase),
      observaciones: c.notasSecretaria,
    }))
    const { slice, total } = this.paginar(rows, f)

    return {
      kpis: [
        { key: 'total', label: 'Total citas', value: citas.length, format: 'number' },
        { key: 'atendidas', label: 'Atendidas', value: atendidas, format: 'number', tone: 'success' },
        { key: 'canceladas', label: 'Canceladas', value: canceladas, format: 'number', tone: 'warning' },
        { key: 'no_asistio', label: 'No asistieron', value: noAsistio, format: 'number', tone: 'danger' },
        { key: 'ingresos', label: 'Ingresos generados', value: ingresos, format: 'money' },
      ],
      rows: slice, page: f.page ?? 1, pageSize: f.pageSize ?? 25, total,
    }
  }

  async cobranzas(consultorioId: number, rol: string, usuarioId: number, f: ReportFiltersDto): Promise<ReportPage<CobranzaReportRow>> {
    const { ini, fin } = this.rango(f.desde, f.hasta)
    const doctorId = await this.doctorIdForzado(consultorioId, rol, usuarioId, f.doctorId)

    const pagos = await this.prisma.pago.findMany({
      where: {
        createdAt: { gte: ini, lt: fin },
        ...(f.tipoCuentaId && { tipoCuentaId: f.tipoCuentaId }),
        cobro: { consultorioId, cita: {
          ...(doctorId !== undefined && { doctorId }),
          ...(f.servicioId && { servicioId: f.servicioId }),
          ...(f.pacienteId && { pacienteId: f.pacienteId }),
          ...(f.q && { paciente: { OR: [
            { nombre: { contains: f.q, mode: 'insensitive' } },
            { apellido: { contains: f.q, mode: 'insensitive' } },
          ] } }),
        } },
      },
      select: {
        id: true, monto: true, createdAt: true,
        tipoCuenta: { select: { nombre: true, esEfectivo: true } },
        createdBy: { select: { nombre: true } },
        cobro: { select: { cita: { select: {
          id: true,
          paciente: { select: { nombre: true, apellido: true } },
          servicio: { select: { nombre: true } },
        } } } },
      },
      orderBy: { createdAt: f.sortDir ?? 'desc' },
    })

    let total = 0, efectivo = 0
    const cuentas = new Map<string, number>()
    for (const p of pagos) {
      const m = Number(p.monto)
      total += m
      if (p.tipoCuenta.esEfectivo) efectivo += m
      cuentas.set(p.tipoCuenta.nombre, (cuentas.get(p.tipoCuenta.nombre) ?? 0) + m)
    }

    const deudaAgg = await this.prisma.cobro.aggregate({
      _sum: { saldoPendiente: true },
      where: { consultorioId, cita: {
        fechaHora: { gte: ini, lt: fin },
        ...(doctorId !== undefined && { doctorId }),
      } },
    })
    const deuda = Number(deudaAgg._sum.saldoPendiente ?? 0)

    const rows: CobranzaReportRow[] = pagos.map((p) => ({
      id: p.id,
      fechaPago: p.createdAt.toISOString(),
      paciente: `${p.cobro.cita.paciente.nombre} ${p.cobro.cita.paciente.apellido}`,
      concepto: `${p.cobro.cita.servicio.nombre} · Cita #${p.cobro.cita.id}`,
      formaPago: p.tipoCuenta.nombre,
      monto: Number(p.monto),
      usuario: p.createdBy.nombre,
    }))
    const { slice, total: count } = this.paginar(rows, f)

    return {
      kpis: [
        { key: 'total', label: 'Total cobrado', value: total, format: 'money' },
        { key: 'efectivo', label: 'Efectivo', value: efectivo, format: 'money' },
        { key: 'no_efectivo', label: 'No efectivo', value: total - efectivo, format: 'money' },
        { key: 'deuda', label: 'Deudas pendientes', value: deuda, format: 'money', tone: 'danger' },
      ],
      rows: slice, page: f.page ?? 1, pageSize: f.pageSize ?? 25, total: count,
      meta: { cuentas: [...cuentas.entries()].map(([nombre, total]) => ({ nombre, total })) },
    }
  }

  async gastos(consultorioId: number, f: ReportFiltersDto): Promise<ReportPage<GastoReportRow>> {
    const { ini, fin } = this.rango(f.desde, f.hasta)
    const gastos = await this.prisma.gasto.findMany({
      where: {
        consultorioId, deletedAt: null,
        fecha: { gte: ini, lt: fin },
        ...(f.tipoCuentaId && { tipoCuentaId: f.tipoCuentaId }),
        ...(f.q && { OR: [
          { descripcion: { contains: f.q, mode: 'insensitive' } },
          { personal: { contains: f.q, mode: 'insensitive' } },
        ] }),
      },
      select: {
        id: true, fecha: true, descripcion: true, personal: true, monto: true,
        tipoGasto: { select: { nombre: true } },
        tipoCuenta: { select: { nombre: true } },
        registradoPor: { select: { nombre: true } },
      },
      orderBy: { fecha: f.sortDir ?? 'desc' },
    })

    let total = 0
    const porCategoria = new Map<string, number>()
    const porFormaPago = new Map<string, number>()
    for (const g of gastos) {
      const m = Number(g.monto); total += m
      porCategoria.set(g.tipoGasto.nombre, (porCategoria.get(g.tipoGasto.nombre) ?? 0) + m)
      porFormaPago.set(g.tipoCuenta.nombre, (porFormaPago.get(g.tipoCuenta.nombre) ?? 0) + m)
    }

    const ingresosAgg = await this.prisma.pago.aggregate({
      _sum: { monto: true },
      where: { createdAt: { gte: ini, lt: fin }, cobro: { consultorioId } },
    })
    const utilidad = Number(ingresosAgg._sum.monto ?? 0) - total

    const rows: GastoReportRow[] = gastos.map((g) => ({
      id: g.id,
      fecha: g.fecha.toISOString(),
      categoria: g.tipoGasto.nombre,
      descripcion: g.descripcion,
      proveedor: g.personal,
      formaPago: g.tipoCuenta.nombre,
      monto: Number(g.monto),
      usuario: g.registradoPor.nombre,
    }))
    const { slice, total: count } = this.paginar(rows, f)

    return {
      kpis: [
        { key: 'total', label: 'Total gastos', value: total, format: 'money', tone: 'danger' },
        { key: 'utilidad', label: 'Utilidad aproximada', value: utilidad, format: 'money', tone: utilidad >= 0 ? 'success' : 'danger' },
      ],
      rows: slice, page: f.page ?? 1, pageSize: f.pageSize ?? 25, total: count,
      meta: {
        porCategoria: [...porCategoria.entries()].map(([nombre, total]) => ({ nombre, total })),
        porFormaPago: [...porFormaPago.entries()].map(([nombre, total]) => ({ nombre, total })),
      },
    }
  }

  async pacientes(consultorioId: number, rol: string, usuarioId: number, f: ReportFiltersDto): Promise<ReportPage<PacienteReportRow>> {
    const { ini, fin } = this.rango(f.desde, f.hasta)
    const doctorId = await this.doctorIdForzado(consultorioId, rol, usuarioId, f.doctorId)
    const ATENDIDA = ['ATENDIDA', 'COBRADO', 'CON_DEUDA'] as const

    const pacientes = await this.prisma.paciente.findMany({
      where: {
        consultorioId, deletedAt: null,
        ...(f.q && { OR: [
          { nombre: { contains: f.q, mode: 'insensitive' } },
          { apellido: { contains: f.q, mode: 'insensitive' } },
          { telefono: { contains: f.q } },
        ] }),
        citas: { some: {
          fechaHora: { gte: ini, lt: fin }, deletedAt: null,
          ...(doctorId !== undefined && { doctorId }),
        } },
      },
      select: {
        id: true, nombre: true, apellido: true, telefono: true, createdAt: true, deudaTotal: true,
        citas: {
          where: { deletedAt: null, ...(doctorId !== undefined && { doctorId }) },
          select: { fechaHora: true, estado: true, cobro: { select: { pagos: { select: { monto: true } } } } },
        },
      },
    })

    const seisMesesAtras = new Date(); seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 6)
    let nuevos = 0, recurrentes = 0, conDeuda = 0, inactivos = 0
    const rows: PacienteReportRow[] = pacientes.map((p) => {
      const atendidas = p.citas.filter((c) => ATENDIDA.includes(c.estado as any))
      const ultima = p.citas.reduce<Date | null>((max, c) => (!max || c.fechaHora > max ? c.fechaHora : max), null)
      const totalPagado = p.citas.reduce((acc, c) => acc + (c.cobro?.pagos.reduce((s, pg) => s + Number(pg.monto), 0) ?? 0), 0)
      if (p.createdAt >= ini && p.createdAt < fin) nuevos++
      if (atendidas.length >= 2) recurrentes++
      if (Number(p.deudaTotal) > 0) conDeuda++
      const ultimaAtendida = atendidas.reduce<Date | null>((max, c) => (!max || c.fechaHora > max ? c.fechaHora : max), null)
      if (!ultimaAtendida || ultimaAtendida < seisMesesAtras) inactivos++
      return {
        id: p.id,
        paciente: `${p.nombre} ${p.apellido}`,
        telefono: p.telefono,
        fechaRegistro: p.createdAt.toISOString(),
        ultimaCita: ultima ? ultima.toISOString() : null,
        cantidadCitas: p.citas.length,
        totalPagado,
        deudaPendiente: Number(p.deudaTotal),
      }
    })
    rows.sort((a, b) => (b.ultimaCita ?? '').localeCompare(a.ultimaCita ?? ''))
    const { slice, total } = this.paginar(rows, f)

    return {
      kpis: [
        { key: 'nuevos', label: 'Pacientes nuevos', value: nuevos, format: 'number', tone: 'success' },
        { key: 'recurrentes', label: 'Recurrentes', value: recurrentes, format: 'number' },
        { key: 'con_deuda', label: 'Con deuda', value: conDeuda, format: 'number', tone: 'danger' },
        { key: 'inactivos', label: 'Inactivos (6m)', value: inactivos, format: 'number', tone: 'warning' },
      ],
      rows: slice, page: f.page ?? 1, pageSize: f.pageSize ?? 25, total,
    }
  }

  async servicios(consultorioId: number, rol: string, usuarioId: number, f: ReportFiltersDto): Promise<ReportPage<ServicioReportRow>> {
    const { ini, fin } = this.rango(f.desde, f.hasta)
    const doctorId = await this.doctorIdForzado(consultorioId, rol, usuarioId, f.doctorId)
    const ATENDIDA = ['ATENDIDA', 'COBRADO', 'CON_DEUDA']

    const citas = await this.prisma.cita.findMany({
      where: {
        consultorioId, deletedAt: null,
        fechaHora: { gte: ini, lt: fin },
        estado: { in: ATENDIDA as any },
        ...(doctorId !== undefined && { doctorId }),
        ...(f.servicioId && { servicioId: f.servicioId }),
      },
      select: {
        servicioId: true, doctorId: true,
        servicio: { select: { nombre: true } },
        doctor: { select: { nombre: true } },
        cobro: { select: { pagos: { select: { monto: true } } } },
      },
    })

    const grupos = new Map<string, ServicioReportRow>()
    for (const c of citas) {
      const key = `${c.servicioId}-${c.doctorId}`
      let g = grupos.get(key)
      if (!g) {
        g = { servicioId: c.servicioId, servicio: c.servicio.nombre, doctorId: c.doctorId, doctor: c.doctor.nombre, cantidadRealizada: 0, totalCobrado: 0, promedioCobrado: 0 }
        grupos.set(key, g)
      }
      g.cantidadRealizada++
      g.totalCobrado += c.cobro?.pagos.reduce((s, p) => s + Number(p.monto), 0) ?? 0
    }
    const rows = [...grupos.values()].map((g) => ({ ...g, promedioCobrado: g.cantidadRealizada ? Math.round((g.totalCobrado / g.cantidadRealizada) * 100) / 100 : 0 }))
    rows.sort((a, b) => b.cantidadRealizada - a.cantidadRealizada)

    const serviciosActivos = await this.prisma.servicio.count({ where: { consultorioId, activo: true } })
    const conMovimiento = new Set(rows.map((r) => r.servicioId)).size
    const masVendido = rows[0]?.cantidadRealizada ?? 0
    const mayorIngreso = rows.reduce((max, r) => Math.max(max, r.totalCobrado), 0)

    const { slice, total } = this.paginar(rows, f)
    return {
      kpis: [
        { key: 'mas_vendido', label: 'Más vendido (cant.)', value: masVendido, format: 'number' },
        { key: 'mayor_ingreso', label: 'Mayor ingreso', value: mayorIngreso, format: 'money' },
        { key: 'sin_movimiento', label: 'Sin movimiento', value: Math.max(0, serviciosActivos - conMovimiento), format: 'number', tone: 'warning' },
      ],
      rows: slice, page: f.page ?? 1, pageSize: f.pageSize ?? 25, total,
    }
  }

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
