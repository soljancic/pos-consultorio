# Módulo de Reportes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la pantalla de Reportes (un solo reporte mensual) por un módulo con 5 reportes (Citas, Cobranzas, Gastos, Pacientes, Servicios), filtros reutilizables, KPIs calculados en backend, tabla genérica (orden/paginación/búsqueda), exportación Excel + Imprimir, y roles ADMIN/DOCTOR.

**Architecture:** Un endpoint por reporte (`GET /reportes/<tab>`) que devuelve `{kpis, rows, page, pageSize, total, meta}` (contrato compartido en `@pos/types`). Frontend con `DataTable` genérico dirigido por config de columnas por reporte + filtros y KPIs reutilizables. Sin cambios de schema Prisma.

**Tech Stack:** NestJS + Prisma (backend), React 19 + TanStack Query v5 + Tailwind (frontend), class-validator (DTO), xlsx (Excel), gate-*.ps1 (tests de API).

**Spec:** `docs/superpowers/specs/2026-06-14-reportes-module-design.md`

**Verificación global antes de cada commit:** `cd apps/api && npx tsc --noEmit` y `cd apps/web && npx tsc --noEmit`. Tras tocar `@pos/types`: `cd packages/types && pnpm build`.

---

## Fase 0 — Contrato compartido + DTO + esqueleto

### Task 1: Tipos compartidos en @pos/types

**Files:**
- Create: `packages/types/src/reportes.ts`
- Modify: `packages/types/src/index.ts` (re-export)

- [ ] **Step 1: Crear los tipos del contrato**

```ts
// packages/types/src/reportes.ts
export type ReportTab = 'citas' | 'cobranzas' | 'gastos' | 'pacientes' | 'servicios'

export type KpiFormat = 'money' | 'number' | 'percent'
export type KpiTone = 'default' | 'success' | 'warning' | 'danger'

export interface ReportKpi {
  key: string
  label: string
  value: number
  format: KpiFormat
  tone?: KpiTone
}

export interface ReportPage<T> {
  kpis: ReportKpi[]
  rows: T[]
  page: number
  pageSize: number
  total: number
  meta?: Record<string, unknown>
}

export type SortDir = 'asc' | 'desc'

export interface CitaReportRow {
  id: number
  fechaHora: string
  paciente: string
  doctor: string
  servicio: string
  estado: string // EstadoCita
  monto: number
  observaciones: string | null
}
export interface CobranzaReportRow {
  id: number
  fechaPago: string
  paciente: string
  concepto: string
  formaPago: string
  monto: number
  usuario: string
}
export interface GastoReportRow {
  id: number
  fecha: string
  categoria: string
  descripcion: string
  proveedor: string | null
  formaPago: string
  monto: number
  usuario: string
}
export interface PacienteReportRow {
  id: number
  paciente: string
  telefono: string | null
  fechaRegistro: string
  ultimaCita: string | null
  cantidadCitas: number
  totalPagado: number
  deudaPendiente: number
}
export interface ServicioReportRow {
  servicioId: number
  servicio: string
  doctorId: number
  doctor: string
  cantidadRealizada: number
  totalCobrado: number
  promedioCobrado: number
}
```

- [ ] **Step 2: Re-export desde el index**

Agregar a `packages/types/src/index.ts`:
```ts
export * from './reportes'
```

- [ ] **Step 3: Build de tipos y verificación**

Run: `cd packages/types && pnpm build`
Expected: build OK, sin errores TS.

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/reportes.ts packages/types/src/index.ts packages/types/dist
git commit -m "feat(types): contrato de reportes (ReportKpi, ReportPage, filas)"
```

### Task 2: ReportFiltersDto

**Files:**
- Create: `apps/api/src/modules/reportes/dto/report-filters.dto.ts`

- [ ] **Step 1: Escribir el DTO con class-validator**

```ts
// apps/api/src/modules/reportes/dto/report-filters.dto.ts
import { Type } from 'class-transformer'
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { EstadoCita } from '@prisma/client'

export class ReportFiltersDto {
  @IsDateString()
  desde!: string

  @IsDateString()
  hasta!: string

  @IsOptional() @Type(() => Number) @IsInt()
  doctorId?: number

  @IsOptional() @Type(() => Number) @IsInt()
  servicioId?: number

  @IsOptional() @Type(() => Number) @IsInt()
  pacienteId?: number

  @IsOptional() @IsEnum(EstadoCita)
  estado?: EstadoCita

  @IsOptional() @Type(() => Number) @IsInt()
  tipoCuentaId?: number

  @IsOptional() @IsString()
  q?: string

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize?: number = 25

  @IsOptional() @IsString()
  sortBy?: string

  @IsOptional() @IsEnum(['asc', 'desc'] as any)
  sortDir?: 'asc' | 'desc' = 'desc'

  // export='1' => el service devuelve TODAS las filas (sin paginar) para Excel.
  @IsOptional() @IsString()
  export?: string
}
```

- [ ] **Step 2: Verificar tsc**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/reportes/dto/report-filters.dto.ts
git commit -m "feat(reportes): ReportFiltersDto con class-validator"
```

### Task 3: Helpers de rango/paginación/rol en el service

**Files:**
- Modify: `apps/api/src/modules/reportes/reportes.service.ts` (agregar helpers privados, no tocar `mensual`)

- [ ] **Step 1: Agregar helpers privados a ReportesService**

Agregar dentro de la clase (debajo del constructor):
```ts
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
```

> **Nota para Fase 1:** en cada service method, llamar `this.paginar(rows, f)` (pasando el DTO completo) en lugar de `this.paginar(rows, f)`. Así el flag `export` devuelve el dataset completo para la exportación a Excel.

- [ ] **Step 2: Verificar tsc**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores (helpers sin uso aún está OK; se usan en Fase 1).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/reportes/reportes.service.ts
git commit -m "feat(reportes): helpers de rango/paginacion/rol en el service"
```

---

## Fase 1 — Backend: un método y endpoint por reporte

> Patrón de cada endpoint en el controller:
> ```ts
> @Get('citas')
> @Roles(Rol.ADMIN, Rol.DOCTOR)
> citas(@CurrentUser() u: JwtPayload, @Query() f: ReportFiltersDto) {
>   return this.service.citas(u.consultorioId, u.rol, u.id, f)
> }
> ```
> Gastos usa `@Roles(Rol.ADMIN)` solamente.

### Task 4: Reporte de Citas (service + endpoint + gate)

**Files:**
- Modify: `apps/api/src/modules/reportes/reportes.service.ts`
- Modify: `apps/api/src/modules/reportes/reportes.controller.ts`
- Create: `scripts/gate-reportes.ps1`

- [ ] **Step 1: Escribir el gate (test-first)**

```powershell
# scripts/gate-reportes.ps1  (requiere API corriendo en :3000; crea su propio tenant)
# Patron: ver scripts/gate-*.ps1 existentes para el helper de registro/login.
# Asserts minimos de Citas:
#  - GET /reportes/citas sin desde/hasta => 400
#  - GET /reportes/citas?desde=HOY&hasta=HOY => 200 con {kpis, rows, page, pageSize, total}
#  - kpis contiene keys: total, atendidas, canceladas, no_asistio, ingresos
#  - rol DOCTOR: las filas solo tienen su doctor
# (Implementar usando el mismo bootstrap de tenant que gate-e25b.ps1.)
```

- [ ] **Step 2: Implementar `citas()` en el service**

```ts
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

  // Ingresos generados = pagos netos de las citas del rango
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
```
Agregar imports arriba: `import type { ReportPage, CitaReportRow, CobranzaReportRow, GastoReportRow, PacienteReportRow, ServicioReportRow } from '@pos/types'` y `import { ReportFiltersDto } from './dto/report-filters.dto'`.

- [ ] **Step 3: Agregar endpoint `citas` al controller**

```ts
@Get('citas')
@Roles(Rol.ADMIN, Rol.DOCTOR)
@ApiOperation({ summary: 'Reporte de citas (rango). DOCTOR ve solo las suyas.' })
citas(@CurrentUser() u: JwtPayload, @Query() f: ReportFiltersDto) {
  return this.service.citas(u.consultorioId, u.rol, u.id, f)
}
```

- [ ] **Step 4: Correr el gate**

Run (API arriba): `pwsh scripts/gate-reportes.ps1`
Expected: PASS (400 sin fechas, 200 con shape correcto, KPIs presentes, DOCTOR escopeado).

- [ ] **Step 5: Verificar tsc + commit**

```bash
cd apps/api && npx tsc --noEmit
git add apps/api/src/modules/reportes/ scripts/gate-reportes.ps1
git commit -m "feat(reportes): endpoint /reportes/citas + gate"
```

### Task 5: Reporte de Cobranzas (service + endpoint + gate)

**Files:**
- Modify: `apps/api/src/modules/reportes/reportes.service.ts`, `reportes.controller.ts`, `scripts/gate-reportes.ps1`

- [ ] **Step 1: Agregar asserts de cobranzas al gate**

Añadir a `gate-reportes.ps1`: `GET /reportes/cobranzas?desde&hasta` => 200; `kpis` con keys `total, efectivo, no_efectivo, deuda`; `meta.cuentas` es array.

- [ ] **Step 2: Implementar `cobranzas()`**

```ts
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

  // Deudas pendientes: saldo de cobros de citas del rango
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
```

- [ ] **Step 3: Endpoint en controller**

```ts
@Get('cobranzas')
@Roles(Rol.ADMIN, Rol.DOCTOR)
@ApiOperation({ summary: 'Reporte de cobranzas (pagos del rango).' })
cobranzas(@CurrentUser() u: JwtPayload, @Query() f: ReportFiltersDto) {
  return this.service.cobranzas(u.consultorioId, u.rol, u.id, f)
}
```

- [ ] **Step 4: gate + tsc + commit**

```bash
pwsh scripts/gate-reportes.ps1
cd apps/api && npx tsc --noEmit
git add apps/api/src/modules/reportes/ scripts/gate-reportes.ps1
git commit -m "feat(reportes): endpoint /reportes/cobranzas (KPIs dinamicos por cuenta) + gate"
```

### Task 6: Reporte de Gastos (service + endpoint ADMIN + gate)

**Files:** `reportes.service.ts`, `reportes.controller.ts`, `scripts/gate-reportes.ps1`

- [ ] **Step 1: Asserts de gastos al gate**

`GET /reportes/gastos` con token ADMIN => 200; con token DOCTOR => 403; `kpis` keys `total, utilidad`; `meta.porCategoria` y `meta.porFormaPago` arrays.

- [ ] **Step 2: Implementar `gastos()`**

```ts
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
```

- [ ] **Step 3: Endpoint (ADMIN only)**

```ts
@Get('gastos')
@Roles(Rol.ADMIN)
@ApiOperation({ summary: 'Reporte de gastos (ADMIN).' })
gastos(@CurrentUser() u: JwtPayload, @Query() f: ReportFiltersDto) {
  return this.service.gastos(u.consultorioId, f)
}
```

- [ ] **Step 4: gate + tsc + commit**

```bash
pwsh scripts/gate-reportes.ps1
cd apps/api && npx tsc --noEmit
git add apps/api/src/modules/reportes/ scripts/gate-reportes.ps1
git commit -m "feat(reportes): endpoint /reportes/gastos (ADMIN) + gate"
```

### Task 7: Reporte de Pacientes (service + endpoint + gate)

**Files:** `reportes.service.ts`, `reportes.controller.ts`, `scripts/gate-reportes.ps1`

- [ ] **Step 1: Asserts de pacientes al gate**

`GET /reportes/pacientes` => 200; `kpis` keys `nuevos, recurrentes, con_deuda, inactivos`.

- [ ] **Step 2: Implementar `pacientes()`**

```ts
async pacientes(consultorioId: number, rol: string, usuarioId: number, f: ReportFiltersDto): Promise<ReportPage<PacienteReportRow>> {
  const { ini, fin } = this.rango(f.desde, f.hasta)
  const doctorId = await this.doctorIdForzado(consultorioId, rol, usuarioId, f.doctorId)
  const ATENDIDA = ['ATENDIDA', 'COBRADO', 'CON_DEUDA'] as const

  // Pacientes con al menos una cita en el rango (o, si DOCTOR, con citas suyas)
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
```

- [ ] **Step 3: Endpoint**

```ts
@Get('pacientes')
@Roles(Rol.ADMIN, Rol.DOCTOR)
@ApiOperation({ summary: 'Reporte de pacientes (rango).' })
pacientes(@CurrentUser() u: JwtPayload, @Query() f: ReportFiltersDto) {
  return this.service.pacientes(u.consultorioId, u.rol, u.id, f)
}
```

- [ ] **Step 4: gate + tsc + commit**

```bash
pwsh scripts/gate-reportes.ps1
cd apps/api && npx tsc --noEmit
git add apps/api/src/modules/reportes/ scripts/gate-reportes.ps1
git commit -m "feat(reportes): endpoint /reportes/pacientes + gate"
```

### Task 8: Reporte de Servicios (service + endpoint + gate)

**Files:** `reportes.service.ts`, `reportes.controller.ts`, `scripts/gate-reportes.ps1`

- [ ] **Step 1: Asserts de servicios al gate**

`GET /reportes/servicios` => 200; `kpis` keys `mas_vendido` (value=cantidad), `mayor_ingreso`, `sin_movimiento`.

- [ ] **Step 2: Implementar `servicios()`** (agregado por servicio × doctor)

```ts
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

  // Servicios sin movimiento = servicios activos sin ninguna cita atendida en el rango
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
```

- [ ] **Step 3: Endpoint**

```ts
@Get('servicios')
@Roles(Rol.ADMIN, Rol.DOCTOR)
@ApiOperation({ summary: 'Reporte de servicios (servicio x doctor).' })
servicios(@CurrentUser() u: JwtPayload, @Query() f: ReportFiltersDto) {
  return this.service.servicios(u.consultorioId, u.rol, u.id, f)
}
```

- [ ] **Step 4: gate completo + tsc + commit**

```bash
pwsh scripts/gate-reportes.ps1
cd apps/api && npx tsc --noEmit
git add apps/api/src/modules/reportes/ scripts/gate-reportes.ps1
git commit -m "feat(reportes): endpoint /reportes/servicios + gate completo"
```

---

## Fase 2 — Frontend: primitivos reutilizables

> **Regla del proyecto:** antes de escribir el JSX de cada componente, pasar por los skills `ui-ux-pro-max` + `frontend-design`. Reusar tokens (`cardUI`, `inputUI`, `btnPrimaryUI`, `btnOutlineUI`, `chipIconUI`), y `Skeleton`/`EmptyState`/`ErrorState` ya existentes.

### Task 9: api/reportes.api.ts + tipos front

**Files:**
- Create: `apps/web/src/features/reportes/api/reportes.api.ts`

- [ ] **Step 1: Cliente axios por reporte**

```ts
import { api } from '../../../lib/api-client'
import type { ReportPage, ReportTab } from '@pos/types'

export interface ReportQuery {
  desde: string; hasta: string
  doctorId?: number; servicioId?: number; pacienteId?: number
  estado?: string; tipoCuentaId?: number; q?: string
  page?: number; pageSize?: number; sortBy?: string; sortDir?: 'asc' | 'desc'
}

export function fetchReporte<T>(tab: ReportTab, query: ReportQuery): Promise<ReportPage<T>> {
  return api.get(`/reportes/${tab}`, { params: query }).then((r) => r.data)
}
```

- [ ] **Step 2: tsc + commit**

```bash
cd apps/web && npx tsc --noEmit
git add apps/web/src/features/reportes/api/reportes.api.ts
git commit -m "feat(reportes-web): api client por reporte"
```

### Task 10: hooks useReportFilters + useReportData

**Files:**
- Create: `apps/web/src/features/reportes/hooks/useReportFilters.ts`
- Create: `apps/web/src/features/reportes/hooks/useReportData.ts`

- [ ] **Step 1: useReportFilters (estado + presets + sync URL)**

```ts
import { useState } from 'react'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths } from 'date-fns'

export type Preset = 'hoy' | 'semana' | 'mes' | 'mesPasado' | 'custom'
const f = (d: Date) => format(d, 'yyyy-MM-dd')

export function rangoPreset(p: Preset): { desde: string; hasta: string } {
  const hoy = new Date()
  switch (p) {
    case 'semana': return { desde: f(startOfWeek(hoy, { weekStartsOn: 1 })), hasta: f(endOfWeek(hoy, { weekStartsOn: 1 })) }
    case 'mes': return { desde: f(startOfMonth(hoy)), hasta: f(endOfMonth(hoy)) }
    case 'mesPasado': { const m = subMonths(hoy, 1); return { desde: f(startOfMonth(m)), hasta: f(endOfMonth(m)) } }
    case 'hoy': default: return { desde: f(hoy), hasta: f(hoy) }
  }
}

export interface Filtros {
  desde: string; hasta: string
  doctorId?: number; servicioId?: number; pacienteId?: number
  estado?: string; tipoCuentaId?: number; q?: string
}

export function useReportFilters() {
  const [filtros, setFiltros] = useState<Filtros>(() => ({ ...rangoPreset('hoy') }))
  const setPreset = (p: Preset) => setFiltros((prev) => ({ ...prev, ...rangoPreset(p) }))
  const patch = (p: Partial<Filtros>) => setFiltros((prev) => ({ ...prev, ...p }))
  return { filtros, setFiltros, setPreset, patch }
}
```

- [ ] **Step 2: useReportData (TanStack Query)**

```ts
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import type { ReportPage, ReportTab } from '@pos/types'
import { fetchReporte, type ReportQuery } from '../api/reportes.api'

export function useReportData<T>(tab: ReportTab, query: ReportQuery) {
  return useQuery<ReportPage<T>>({
    queryKey: ['reportes', tab, query],
    queryFn: () => fetchReporte<T>(tab, query),
    placeholderData: keepPreviousData,
  })
}
```

- [ ] **Step 3: tsc + commit**

```bash
cd apps/web && npx tsc --noEmit
git add apps/web/src/features/reportes/hooks/
git commit -m "feat(reportes-web): hooks de filtros y data"
```

### Task 11: DataTable genérico

**Files:**
- Create: `apps/web/src/features/reportes/components/DataTable.tsx`

> Pasar por ui-ux-pro-max + frontend-design antes del JSX.

- [ ] **Step 1: Implementar DataTable**

```tsx
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, FileX } from 'lucide-react'
import { cardUI, inputUI } from '../../../lib/ui'
import { cn } from '../../../lib/utils'
import { TableSkeleton } from '../../../components/shared/Skeleton'
import { EmptyState } from '../../../components/shared/EmptyState'
import { ErrorState } from '../../../components/shared/ErrorState'

export interface Column<T> {
  key: string
  label: string
  align?: 'left' | 'right'
  sortable?: boolean
  render: (row: T) => React.ReactNode
}

interface Props<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  onSort: (key: string) => void
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
  search: string
  onSearch: (q: string) => void
  searchPlaceholder?: string
}

export function DataTable<T>(p: Props<T>) {
  const totalPaginas = Math.max(1, Math.ceil(p.total / p.pageSize))
  return (
    <div className="space-y-3">
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" aria-hidden="true" />
        <input value={p.search} onChange={(e) => p.onSearch(e.target.value)}
          placeholder={p.searchPlaceholder ?? 'Buscar...'} aria-label="Búsqueda rápida"
          className={cn(inputUI, 'pl-9')} />
      </div>
      {p.isLoading ? (
        <TableSkeleton cols={p.columns.length} />
      ) : p.isError ? (
        <ErrorState onRetry={p.onRetry} />
      ) : p.rows.length === 0 ? (
        <div className={cardUI}><EmptyState icon={FileX} title="Sin resultados" description="Probá con otro rango o filtros." /></div>
      ) : (
        <div className={cn(cardUI, 'overflow-x-auto')}>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                {p.columns.map((c) => {
                  const active = p.sortBy === c.key
                  return (
                    <th key={c.key}
                      aria-sort={active ? (p.sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                      className={cn('px-4 py-3 font-medium text-muted-foreground', c.align === 'right' ? 'text-right' : 'text-left')}>
                      {c.sortable ? (
                        <button onClick={() => p.onSort(c.key)}
                          className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 rounded">
                          {c.label}
                          {active ? (p.sortDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />) : <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />}
                        </button>
                      ) : c.label}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {p.rows.map((row) => (
                <tr key={p.rowKey(row)} className="border-b last:border-0 hover:bg-muted/40 transition-colors duration-150">
                  {p.columns.map((c) => (
                    <td key={c.key} className={cn('px-4 py-3', c.align === 'right' ? 'text-right tabular-nums' : 'text-foreground')}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!p.isLoading && !p.isError && p.total > p.pageSize && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="tabular-nums">{p.total} resultados</span>
          <span className="flex items-center gap-3">
            <button disabled={p.page <= 1} onClick={() => p.onPage(p.page - 1)} className="disabled:opacity-40 hover:text-foreground cursor-pointer disabled:cursor-not-allowed">Anterior</button>
            <span className="tabular-nums">{p.page} / {totalPaginas}</span>
            <button disabled={p.page >= totalPaginas} onClick={() => p.onPage(p.page + 1)} className="disabled:opacity-40 hover:text-foreground cursor-pointer disabled:cursor-not-allowed">Siguiente</button>
          </span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: tsc + commit**

```bash
cd apps/web && npx tsc --noEmit
git add apps/web/src/features/reportes/components/DataTable.tsx
git commit -m "feat(reportes-web): DataTable generico (orden, paginacion, busqueda, estados)"
```

### Task 12: KpiCards

**Files:**
- Create: `apps/web/src/features/reportes/components/KpiCards.tsx`

> Pasar por ui-ux-pro-max + frontend-design antes del JSX.

- [ ] **Step 1: Implementar KpiCards**

```tsx
import type { ReportKpi } from '@pos/types'
import { cardUI } from '../../../lib/ui'
import { formatMoneda, cn } from '../../../lib/utils'

const TONE: Record<string, string> = {
  default: 'text-foreground', success: 'text-accent',
  warning: 'text-amber-700 dark:text-amber-400', danger: 'text-destructive',
}

function fmt(k: ReportKpi) {
  if (k.format === 'money') return formatMoneda(k.value)
  if (k.format === 'percent') return `${k.value}%`
  return k.value.toLocaleString('es-AR')
}

export function KpiCards({ kpis }: { kpis: ReportKpi[] }) {
  if (kpis.length === 0) return null
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {kpis.map((k) => (
        <div key={k.key} className={cn(cardUI, 'p-4')}>
          <p className="text-xs font-medium text-muted-foreground truncate">{k.label}</p>
          <p className={cn('text-xl font-bold tabular-nums mt-1', TONE[k.tone ?? 'default'])}>{fmt(k)}</p>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: tsc + commit**

```bash
cd apps/web && npx tsc --noEmit
git add apps/web/src/features/reportes/components/KpiCards.tsx
git commit -m "feat(reportes-web): KpiCards generico"
```

### Task 13: ReportFilters

**Files:**
- Create: `apps/web/src/features/reportes/components/ReportFilters.tsx`

> Pasar por ui-ux-pro-max + frontend-design antes del JSX. Reusar `inputUI`. Campos visibles según tab (estado solo Citas; forma de pago solo Cobranzas/Gastos; doctor oculto para rol DOCTOR).

- [ ] **Step 1: Implementar ReportFilters**

```tsx
import { useQuery } from '@tanstack/react-query'
import { api } from '../../../lib/api-client'
import { inputUI } from '../../../lib/ui'
import { cn } from '../../../lib/utils'
import type { Filtros, Preset } from '../hooks/useReportFilters'
import type { ReportTab } from '@pos/types'

const PRESETS: Array<{ id: Preset; label: string }> = [
  { id: 'hoy', label: 'Hoy' }, { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mes' }, { id: 'mesPasado', label: 'Mes pasado' },
]
const ESTADOS = ['SOLICITADA','PENDIENTE','CONFIRMADA','LLEGO','EN_ATENCION','ATENDIDA','COBRADO','CON_DEUDA','CANCELADA','NO_ASISTIO']

interface Props {
  tab: ReportTab; filtros: Filtros; esAdmin: boolean
  onPreset: (p: Preset) => void
  onPatch: (p: Partial<Filtros>) => void
}

export function ReportFilters({ tab, filtros, esAdmin, onPreset, onPatch }: Props) {
  const { data: doctores = [] } = useQuery<any[]>({ queryKey: ['doctores'], queryFn: () => api.get('/doctores').then((r) => r.data) })
  const { data: servicios = [] } = useQuery<any[]>({ queryKey: ['servicios','todos'], queryFn: () => api.get('/servicios?todos=true').then((r) => r.data) })
  const { data: cuentas = [] } = useQuery<any[]>({ queryKey: ['tipos-cuenta','todos'], queryFn: () => api.get('/tipos-cuenta').then((r) => r.data), enabled: tab === 'cobranzas' || tab === 'gastos' })

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-md border overflow-hidden">
        {PRESETS.map((p) => (
          <button key={p.id} onClick={() => onPreset(p.id)}
            className="px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset transition-colors duration-150">
            {p.label}
          </button>
        ))}
      </div>
      <input type="date" value={filtros.desde} onChange={(e) => onPatch({ desde: e.target.value })} aria-label="Desde" className={cn(inputUI, 'w-auto')} />
      <span className="text-muted-foreground/70">a</span>
      <input type="date" value={filtros.hasta} onChange={(e) => onPatch({ hasta: e.target.value })} aria-label="Hasta" className={cn(inputUI, 'w-auto')} />
      {esAdmin && (
        <select value={filtros.doctorId ?? ''} onChange={(e) => onPatch({ doctorId: e.target.value ? Number(e.target.value) : undefined })} aria-label="Doctor" className={cn(inputUI, 'w-auto')}>
          <option value="">Todos los doctores</option>
          {doctores.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </select>
      )}
      <select value={filtros.servicioId ?? ''} onChange={(e) => onPatch({ servicioId: e.target.value ? Number(e.target.value) : undefined })} aria-label="Servicio" className={cn(inputUI, 'w-auto')}>
        <option value="">Todos los servicios</option>
        {servicios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
      </select>
      {tab === 'citas' && (
        <select value={filtros.estado ?? ''} onChange={(e) => onPatch({ estado: e.target.value || undefined })} aria-label="Estado" className={cn(inputUI, 'w-auto')}>
          <option value="">Todos los estados</option>
          {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      {(tab === 'cobranzas' || tab === 'gastos') && (
        <select value={filtros.tipoCuentaId ?? ''} onChange={(e) => onPatch({ tipoCuentaId: e.target.value ? Number(e.target.value) : undefined })} aria-label="Forma de pago" className={cn(inputUI, 'w-auto')}>
          <option value="">Todas las formas de pago</option>
          {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      )}
    </div>
  )
}
```

- [ ] **Step 2: tsc + commit**

```bash
cd apps/web && npx tsc --noEmit
git add apps/web/src/features/reportes/components/ReportFilters.tsx
git commit -m "feat(reportes-web): ReportFilters (rango, presets, selects por tab)"
```

### Task 14: ExportButtons (Excel + Imprimir)

**Files:**
- Create: `apps/web/src/features/reportes/components/ExportButtons.tsx`

> Reusa `xlsx` (ya instalado, usado en ReportesPage actual). Imprimir = `window.print()` con CSS de impresión (Task 16 agrega `@media print`).

- [ ] **Step 1: Implementar ExportButtons**

```tsx
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { Download, Printer } from 'lucide-react'
import { btnOutlineUI } from '../../../lib/ui'
import { cn } from '../../../lib/utils'

interface Props {
  filename: string
  // Carga el dataset COMPLETO (sin paginar) y lo mapea a headers/filas de Excel.
  loadAll: () => Promise<{ headers: string[]; rows: Array<Array<string | number>> }>
}

export function ExportButtons({ filename, loadAll }: Props) {
  const [busy, setBusy] = useState(false)
  async function exportarExcel() {
    setBusy(true)
    try {
      const { headers, rows } = await loadAll()
      const hoja = XLSX.utils.aoa_to_sheet([headers, ...rows])
      const libro = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(libro, hoja, 'Reporte')
      XLSX.writeFile(libro, `${filename}.xlsx`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex items-center gap-2">
      <button onClick={exportarExcel} disabled={busy} className={cn(btnOutlineUI, 'disabled:opacity-60')}>
        <Download className="h-4 w-4" aria-hidden="true" /> {busy ? 'Generando...' : 'Excel'}
      </button>
      <button onClick={() => window.print()} className={btnOutlineUI}>
        <Printer className="h-4 w-4" aria-hidden="true" /> Imprimir
      </button>
    </div>
  )
}
```

- [ ] **Step 2: tsc + commit**

```bash
cd apps/web && npx tsc --noEmit
git add apps/web/src/features/reportes/components/ExportButtons.tsx
git commit -m "feat(reportes-web): ExportButtons (Excel + Imprimir)"
```

---

## Fase 3 — Configs por reporte + página + ruteo

### Task 15: Configs de columnas + export mapper por reporte

**Files:**
- Create: `apps/web/src/features/reportes/reports/index.ts` (registry)
- Create: `apps/web/src/features/reportes/reports/{citas,cobranzas,gastos,pacientes,servicios}.report.tsx`

> Cada config define: `columns: Column<Row>[]`, `searchPlaceholder`, `defaultSortBy/Dir`, y `toExport(rows): { headers, rows }`. Usar `formatMoneda`, `formatFecha`, `formatHora` de `lib/utils`. Mostrar estado con etiqueta legible (mapa LABEL_ESTADO local).

- [ ] **Step 1: Citas config** (`citas.report.tsx`)

```tsx
import type { CitaReportRow } from '@pos/types'
import type { Column } from '../components/DataTable'
import { formatFecha, formatHora, formatMoneda } from '../../../lib/utils'

const LABEL: Record<string, string> = { SOLICITADA:'Solicitada',PENDIENTE:'Pendiente',CONFIRMADA:'Confirmada',LLEGO:'Llegó',EN_ATENCION:'En atención',ATENDIDA:'Atendida',COBRADO:'Cobrado',CON_DEUDA:'Con deuda',CANCELADA:'Cancelada',NO_ASISTIO:'No asistió',REPROGRAMADA:'Reprogramada' }

export const citasColumns: Column<CitaReportRow>[] = [
  { key: 'fechaHora', label: 'Fecha', sortable: true, render: (r) => <span className="tabular-nums">{formatFecha(r.fechaHora)} {formatHora(r.fechaHora)}</span> },
  { key: 'paciente', label: 'Paciente', sortable: true, render: (r) => r.paciente },
  { key: 'doctor', label: 'Doctor', render: (r) => r.doctor },
  { key: 'servicio', label: 'Servicio', render: (r) => r.servicio },
  { key: 'estado', label: 'Estado', render: (r) => LABEL[r.estado] ?? r.estado },
  { key: 'monto', label: 'Monto', align: 'right', sortable: true, render: (r) => formatMoneda(r.monto) },
  { key: 'observaciones', label: 'Observaciones', render: (r) => r.observaciones ?? '-' },
]
export const citasExport = (rows: CitaReportRow[]) => ({
  headers: ['Fecha','Hora','Paciente','Doctor','Servicio','Estado','Monto','Observaciones'],
  rows: rows.map((r) => [formatFecha(r.fechaHora), formatHora(r.fechaHora), r.paciente, r.doctor, r.servicio, LABEL[r.estado] ?? r.estado, r.monto, r.observaciones ?? '']),
})
```

- [ ] **Step 2: Cobranzas, Gastos, Pacientes, Servicios configs**

Crear los 4 análogos siguiendo el mismo patrón, con estas columnas:
- **cobranzas.report.tsx** (`CobranzaReportRow`): Fecha pago (`fechaPago`, sortable), Paciente (sortable), Concepto, Forma de pago (`formaPago`), Monto (right, sortable), Usuario. Export headers: `['Fecha','Paciente','Concepto','Forma de pago','Monto','Usuario']`.
- **gastos.report.tsx** (`GastoReportRow`): Fecha (sortable), Categoría, Descripción, Proveedor, Forma de pago, Monto (right, sortable), Usuario.
- **pacientes.report.tsx** (`PacienteReportRow`): Paciente (sortable), Teléfono, Fecha registro, Última cita, N° citas (right, sortable), Total pagado (right, sortable, money), Deuda (right, money, en `text-destructive` si >0).
- **servicios.report.tsx** (`ServicioReportRow`): Servicio (sortable), Doctor, Cantidad (right, sortable), Total cobrado (right, sortable, money), Promedio (right, money).

- [ ] **Step 3: Registry** (`reports/index.ts`)

```ts
import { citasColumns, citasExport } from './citas.report'
import { cobranzasColumns, cobranzasExport } from './cobranzas.report'
import { gastosColumns, gastosExport } from './gastos.report'
import { pacientesColumns, pacientesExport } from './pacientes.report'
import { serviciosColumns, serviciosExport } from './servicios.report'
import type { ReportTab } from '@pos/types'

export const REPORTS: Record<ReportTab, {
  label: string; columns: any; toExport: (rows: any[]) => { headers: string[]; rows: any[][] }
  searchPlaceholder: string; soloAdmin?: boolean; rowKey: (r: any) => string | number
}> = {
  citas: { label: 'Citas', columns: citasColumns, toExport: citasExport, searchPlaceholder: 'Buscar paciente...', rowKey: (r) => r.id },
  cobranzas: { label: 'Cobranzas', columns: cobranzasColumns, toExport: cobranzasExport, searchPlaceholder: 'Buscar paciente...', rowKey: (r) => r.id },
  gastos: { label: 'Gastos', columns: gastosColumns, toExport: gastosExport, searchPlaceholder: 'Buscar descripción...', soloAdmin: true, rowKey: (r) => r.id },
  pacientes: { label: 'Pacientes', columns: pacientesColumns, toExport: pacientesExport, searchPlaceholder: 'Buscar paciente...', rowKey: (r) => r.id },
  servicios: { label: 'Servicios', columns: serviciosColumns, toExport: serviciosExport, searchPlaceholder: 'Buscar servicio...', rowKey: (r) => `${r.servicioId}-${r.doctorId}` },
}
```

- [ ] **Step 4: tsc + commit**

```bash
cd apps/web && npx tsc --noEmit
git add apps/web/src/features/reportes/reports/
git commit -m "feat(reportes-web): configs de columnas y export por reporte"
```

### Task 16: ReportesPage (reemplazo) + print CSS

**Files:**
- Modify: `apps/web/src/features/reportes/ReportesPage.tsx` (reemplazo completo)
- Modify: `apps/web/src/index.css` (bloque `@media print`)

> Pasar por ui-ux-pro-max + frontend-design antes del JSX. Mantener el export `ReportesPage` (lo importa el router).

- [ ] **Step 1: Reescribir ReportesPage**

```tsx
import { useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { useAuthStore } from '../../stores/auth.store'
import { chipIconUI } from '../../lib/ui'
import { cn } from '../../lib/utils'
import type { ReportTab } from '@pos/types'
import { useReportFilters } from './hooks/useReportFilters'
import { useReportData } from './hooks/useReportData'
import { fetchReporte } from './api/reportes.api'
import { ReportFilters } from './components/ReportFilters'
import { KpiCards } from './components/KpiCards'
import { DataTable } from './components/DataTable'
import { ExportButtons } from './components/ExportButtons'
import { REPORTS } from './reports'

export function ReportesPage() {
  const rol = useAuthStore((s) => s.user?.rol)
  const esAdmin = rol === 'ADMIN'
  const tabs = (Object.keys(REPORTS) as ReportTab[]).filter((t) => !REPORTS[t].soloAdmin || esAdmin)
  const [tab, setTab] = useState<ReportTab>('citas')
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState<string | undefined>()
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const { filtros, setPreset, patch } = useReportFilters()
  const cfg = REPORTS[tab]

  const query = { ...filtros, page, pageSize: 25, sortBy, sortDir }
  const { data, isLoading, isError, refetch } = useReportData<any>(tab, query)

  function cambiarTab(t: ReportTab) { setTab(t); setPage(1); setSortBy(undefined) }
  function ordenar(key: string) {
    if (sortBy === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortBy(key); setSortDir('desc') }
    setPage(1)
  }
  // Export = dataset COMPLETO (sin paginar) via export='1'
  const loadAll = async () => {
    const full = await fetchReporte<any>(tab, { ...query, export: '1' })
    return cfg.toExport(full.rows)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b bg-card print:hidden">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <span className={chipIconUI}><BarChart3 className="h-4 w-4" aria-hidden="true" /></span>
          Reportes
        </h1>
        <ExportButtons filename={`reporte-${tab}-${filtros.desde}`} loadAll={loadAll} />
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-5 max-w-6xl mx-auto w-full">
        <div className="print:hidden"><ReportFilters tab={tab} filtros={filtros} esAdmin={esAdmin} onPreset={(p) => { setPreset(p); setPage(1) }} onPatch={(p) => { patch(p); setPage(1) }} /></div>

        <div className="flex gap-1 print:hidden" role="tablist">
          {tabs.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => cambiarTab(t)}
              className={cn('px-4 py-1.5 rounded-md text-sm font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150',
                tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
              {REPORTS[t].label}
            </button>
          ))}
        </div>

        <KpiCards kpis={data?.kpis ?? []} />

        <DataTable
          columns={cfg.columns} rows={data?.rows ?? []} rowKey={cfg.rowKey}
          isLoading={isLoading} isError={isError} onRetry={refetch}
          sortBy={sortBy} sortDir={sortDir} onSort={ordenar}
          page={data?.page ?? 1} pageSize={data?.pageSize ?? 25} total={data?.total ?? 0} onPage={setPage}
          search={filtros.q ?? ''} onSearch={(q) => { patch({ q: q || undefined }); setPage(1) }}
          searchPlaceholder={cfg.searchPlaceholder}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Print CSS**

Agregar al final de `apps/web/src/index.css`:
```css
@media print {
  aside, header, .print\:hidden { display: none !important; }
  main { overflow: visible !important; }
  body { background: #fff !important; }
}
```

- [ ] **Step 3: tsc + commit**

```bash
cd apps/web && npx tsc --noEmit
git add apps/web/src/features/reportes/ReportesPage.tsx apps/web/src/index.css
git commit -m "feat(reportes-web): ReportesPage con tabs/KPIs/tabla/export + print CSS"
```

---

## Fase 4 — Verificación final

### Task 17: Verificación end-to-end

- [ ] **Step 1: tsc en ambos**

Run: `cd apps/api && npx tsc --noEmit` y `cd apps/web && npx tsc --noEmit`
Expected: ambos limpios.

- [ ] **Step 2: Gate de reportes**

Run (API arriba): `pwsh scripts/gate-reportes.ps1`
Expected: PASS (los 5 reportes, 400 sin fechas, escopeo doctor, gastos 403 para DOCTOR).

- [ ] **Step 3: Detector impeccable en la UI nueva**

Run: `node .claude/skills/impeccable/scripts/detect.mjs --json apps/web/src/features/reportes`
Expected: `[]` (0 findings).

- [ ] **Step 4: Smoke manual (opcional)**

Levantar API + web, entrar a /reportes como ADMIN: cambiar tabs, filtros y presets, ordenar columnas, paginar, exportar Excel, imprimir. Como DOCTOR: verificar que no aparece tab Gastos y que solo ve sus datos.

- [ ] **Step 5: Commit final si quedó algo**

```bash
git add -A && git commit -m "chore(reportes): verificacion final del modulo"
```

---

## Notas de cierre
- No hay migración Prisma (sin cambios de schema).
- El endpoint `/reportes/mensual` se mantiene operativo (no se toca).
- PDF nativo y gráficos quedan para una iteración futura; `ExportButtons` ya admite sumar PDF.
- Deploy: NO deployar por iniciativa propia; avisar "listo para deploy" cuando termine.
