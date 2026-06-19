# Aseguradoras y Convenios — F4 (Reportes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dos reportes nuevos en el módulo `reportes`, gated por el flag `trabajaConAseguradoras`: **Aseguradoras** (atenciones, pacientes, ingresos y montos por estado de liquidación, agrupado por aseguradora) y **Cobertura** (pacientes con/sin seguro y su distribución por aseguradora/categoría).

**Architecture:** Se suman dos tabs al módulo `reportes` existente (config-driven), reusando todo el andamiaje: `GET /reportes/:tab` → método del service que devuelve `ReportPage<Row>` (`{ kpis, rows, page, pageSize, total, meta? }`); en el front, una entrada en `REPORTS` con `columns`/`toExport`. Los datos salen de `LiquidacionItem` (F2/F3) y `Paciente.tieneSeguro` (F2). Las tabs nuevas se ocultan cuando el flag está off.

**Tech Stack:** NestJS + Prisma (api), React 19 + TS + TanStack Query (web), @pos/types. Export reusa el `ExportButtons` del módulo reportes (client-side).

## Global Constraints

- `consultorioId` SIEMPRE del JWT (`@CurrentUser()`); las agregaciones filtran por él.
- Reportes Aseguradoras/Cobertura son `@Roles(Rol.ADMIN)` (como `gastos`).
- Dinero `Decimal`; `Number()` solo al agregar/mostrar; nada de float persistido.
- Tipos: `ReportTab`, `ReportPage`, `ReportKpi` ya existen en `@pos/types`; se extiende `ReportTab` y se agregan las row-interfaces. Enum/valores idénticos backend (`@prisma/client`) / frontend (`@pos/types`).
- Fechas: rango calendario LOCAL `[desde 00:00, hasta+1día 00:00)` via el helper `rango()` ya existente en `reportes.service.ts` (NO `setHours` sobre fechas de BD; el helper usa `new Date(\`${desde}T00:00:00\`)` + `setDate(+1)` que es la convención del módulo reportes — caja/agenda local day).
- Gating del flag: las tabs nuevas llevan `requiereAseguradoras: true` en `REPORTS`; `ReportesPage` filtra los tabs por `esAdmin` Y por `trabajaConAseguradoras` (del auth store). Backend: los endpoints existen siempre (ADMIN); el front los oculta sin flag.
- UI: las tabs reusan `DataTable`/`KpiCards`/`MetaBreakdown`/`ExportButtons` (ya vetados); solo se escriben config de columnas + export. Copy en español CON acentos; tabular-nums en montos; no window.confirm/alert.
- Verificación antes de cada commit: `cd apps/api && npx tsc --noEmit`, `cd apps/web && npx tsc --noEmit`. Tras `packages/types`: `cd packages/types && pnpm build`. Branch: commit directo en master. Gate `.ps1` lo corre el owner.

## Contexto (ya en master)

- `LiquidacionItem` (F2): `aseguradoraId, categoriaSeguroId, pacienteId, servicioId, fecha, montoAseguradora Decimal, estado EstadoLiquidacion` (+ relaciones nombre). 1 por cita con seguro y montoAseguradora>0.
- `Paciente` (F2): `tieneSeguro Boolean`, `aseguradoraId?`, `categoriaSeguroId?` (+ relaciones nombre); `activo`, `deletedAt`.
- Módulo reportes config-driven: backend `apps/api/src/modules/reportes/reportes.service.ts` (helpers `rango`/`paginar`/`ordenar`) + `reportes.controller.ts`; front `apps/web/src/features/reportes/` (`reports/index.ts` = `REPORTS`, `reports/*.report.tsx`, `ReportesPage.tsx`, `api/reportes.api.ts`, `useReportData`).
- `ReportPage<Row> = { kpis: ReportKpi[]; rows: Row[]; page: number; pageSize: number; total: number; meta?: any }`. `ReportKpi = { key, label, value, format: 'number'|'money', hint?, tone? }`.

## Minors cosméticos de F3 a doblar acá (del ledger, opcional/Step de cleanup)

- `LiquidacionesPage`: `cambiarEstado.isPending` deshabilita todas las filas (usar un set por-fila) — opcional.
- Icono de nav `ShieldCheck` vs `Receipt` de la página — unificar (opcional).
- (Son cosméticos; si se hacen, en el Step de cleanup de Task 3 para no abrir commits aparte. No bloquean F4.)

---

### Task 1: @pos/types — ReportTab + row interfaces

**Files:**
- Modify: `packages/types/src/` (donde viven `ReportTab`/`ReportPage`/`*ReportRow` — buscar con `rg "ReportTab" packages/types/src`)

**Interfaces:**
- Produces: `ReportTab` incluye `'aseguradoras' | 'cobertura'`; `AseguradoraReportRow`, `CoberturaReportRow`.

- [ ] **Step 1: Localizar y extender los tipos**

`rg -n "ReportTab|ReportPage|ServicioReportRow" packages/types/src`. En el archivo que define `ReportTab` (probablemente `packages/types/src/reportes` o `entities`), agregar `'aseguradoras'` y `'cobertura'` al union. Junto a los `*ReportRow` existentes agregar:

```typescript
export interface AseguradoraReportRow {
  aseguradoraId: number
  aseguradora: string
  atenciones: number
  pacientes: number
  montoTotal: number
  pendiente: number
  facturado: number
  pagado: number
  rechazado: number
}

export interface CoberturaReportRow {
  aseguradoraId: number
  aseguradora: string
  pacientes: number
}
```

- [ ] **Step 2: Build types + tsc**

Run: `cd packages/types && pnpm build` luego `cd apps/api && npx tsc --noEmit`
Expected: ambos PASS (el api aún no usa los tipos nuevos; no debe romper).

- [ ] **Step 3: Commit**

```bash
git add packages/types
git commit -m "feat(aseguradoras): tipos de reportes aseguradoras/cobertura (F4)"
```

---

### Task 2: Backend — métodos `aseguradoras()` y `cobertura()` + endpoints

**Files:**
- Modify: `apps/api/src/modules/reportes/reportes.service.ts`
- Modify: `apps/api/src/modules/reportes/reportes.controller.ts`

**Interfaces:**
- Consumes: Task 1 (tipos), `LiquidacionItem`, `Paciente`.
- Produces: `GET /reportes/aseguradoras` y `GET /reportes/cobertura` (ADMIN) → `ReportPage`.

- [ ] **Step 1: Método `aseguradoras`**

En `reportes.service.ts` (importar `AseguradoraReportRow`, `CoberturaReportRow` de `@pos/types`). Agrega:

```typescript
async aseguradoras(consultorioId: number, f: ReportFiltersDto): Promise<ReportPage<AseguradoraReportRow>> {
  const { ini, fin } = this.rango(f.desde, f.hasta)
  const items = await this.prisma.liquidacionItem.findMany({
    where: { consultorioId, fecha: { gte: ini, lt: fin } },
    select: { aseguradoraId: true, aseguradora: { select: { nombre: true } }, pacienteId: true, montoAseguradora: true, estado: true },
  })

  const grupos = new Map<number, AseguradoraReportRow & { _pac: Set<number> }>()
  for (const it of items) {
    let g = grupos.get(it.aseguradoraId)
    if (!g) {
      g = { aseguradoraId: it.aseguradoraId, aseguradora: it.aseguradora.nombre, atenciones: 0, pacientes: 0, montoTotal: 0, pendiente: 0, facturado: 0, pagado: 0, rechazado: 0, _pac: new Set() }
      grupos.set(it.aseguradoraId, g)
    }
    const monto = Number(it.montoAseguradora)
    g.atenciones++
    g._pac.add(it.pacienteId)
    g.montoTotal += monto
    if (it.estado === 'PENDIENTE') g.pendiente += monto
    else if (it.estado === 'FACTURADO') g.facturado += monto
    else if (it.estado === 'PAGADO') g.pagado += monto
    else if (it.estado === 'RECHAZADO') g.rechazado += monto
  }
  const rows: AseguradoraReportRow[] = [...grupos.values()].map(({ _pac, ...g }) => ({ ...g, pacientes: _pac.size }))
  rows.sort((a, b) => b.montoTotal - a.montoTotal)

  const totalMonto = rows.reduce((s, r) => s + r.montoTotal, 0)
  const totalPend = rows.reduce((s, r) => s + r.pendiente, 0)
  const totalPag = rows.reduce((s, r) => s + r.pagado, 0)
  const totalRech = rows.reduce((s, r) => s + r.rechazado, 0)

  const { slice, total } = this.paginar(this.ordenar(rows, f.sortBy, f.sortDir), f)
  return {
    kpis: [
      { key: 'monto_total', label: 'Total a aseguradoras', value: totalMonto, format: 'money' },
      { key: 'pendiente', label: 'Pendiente de cobro', value: totalPend, format: 'money', tone: 'warning' },
      { key: 'pagado', label: 'Cobrado', value: totalPag, format: 'money', tone: 'positive' },
      { key: 'rechazado', label: 'Rechazado', value: totalRech, format: 'money', tone: 'danger' },
    ],
    rows: slice, page: f.page ?? 1, pageSize: f.pageSize ?? 25, total,
  }
}
```

Nota: si los `tone` `'positive'`/`'danger'` no existen en `ReportKpi`, usar los que sí existan (revisar el tipo `ReportKpi` en `@pos/types`; el módulo usa `tone: 'warning'`). Ajustar a los valores válidos.

- [ ] **Step 2: Método `cobertura`**

```typescript
async cobertura(consultorioId: number, _f: ReportFiltersDto): Promise<ReportPage<CoberturaReportRow>> {
  // Snapshot del padron activo (ignora el rango de fechas: es estado actual).
  const basePac = { consultorioId, activo: true, deletedAt: null }
  const [conSeguro, sinSeguro, porAseguradora, porCategoria] = await Promise.all([
    this.prisma.paciente.count({ where: { ...basePac, tieneSeguro: true } }),
    this.prisma.paciente.count({ where: { ...basePac, tieneSeguro: false } }),
    this.prisma.paciente.findMany({
      where: { ...basePac, tieneSeguro: true, aseguradoraId: { not: null } },
      select: { aseguradoraId: true, aseguradora: { select: { nombre: true } } },
    }),
    this.prisma.paciente.findMany({
      where: { ...basePac, tieneSeguro: true, categoriaSeguroId: { not: null } },
      select: { categoriaSeguro: { select: { nombre: true } } },
    }),
  ])

  const grupos = new Map<number, CoberturaReportRow>()
  for (const p of porAseguradora) {
    if (p.aseguradoraId == null) continue
    let g = grupos.get(p.aseguradoraId)
    if (!g) { g = { aseguradoraId: p.aseguradoraId, aseguradora: p.aseguradora?.nombre ?? '—', pacientes: 0 }; grupos.set(p.aseguradoraId, g) }
    g.pacientes++
  }
  const rows = [...grupos.values()].sort((a, b) => b.pacientes - a.pacientes)

  // meta: distribucion por categoria (para MetaBreakdown)
  const catMap = new Map<string, number>()
  for (const p of porCategoria) {
    const n = p.categoriaSeguro?.nombre ?? '—'
    catMap.set(n, (catMap.get(n) ?? 0) + 1)
  }
  const porCategoriaMeta = [...catMap.entries()].map(([nombre, total]) => ({ nombre, total })).sort((a, b) => b.total - a.total)

  const total = conSeguro + sinSeguro
  const pct = total ? Math.round((conSeguro / total) * 100) : 0
  const { slice } = this.paginar(this.ordenar(rows, _f.sortBy, _f.sortDir), _f)
  return {
    kpis: [
      { key: 'con_seguro', label: 'Con seguro', value: conSeguro, format: 'number' },
      { key: 'sin_seguro', label: 'Sin seguro', value: sinSeguro, format: 'number' },
      { key: 'cobertura_pct', label: '% con cobertura', value: pct, format: 'number' },
    ],
    rows: slice, page: _f.page ?? 1, pageSize: _f.pageSize ?? 25, total: rows.length,
    meta: { porCategoria: porCategoriaMeta },
  }
}
```

- [ ] **Step 3: Endpoints en el controller**

En `reportes.controller.ts` agregar (patrón de `gastos`, ADMIN):

```typescript
@Get('aseguradoras')
@Roles(Rol.ADMIN)
@ApiOperation({ summary: 'Reporte por aseguradora (atenciones, ingresos, estados).' })
aseguradoras(@CurrentUser() u: JwtPayload, @Query() f: ReportFiltersDto) {
  return this.service.aseguradoras(u.consultorioId, f)
}

@Get('cobertura')
@Roles(Rol.ADMIN)
@ApiOperation({ summary: 'Reporte de cobertura: pacientes con/sin seguro.' })
cobertura(@CurrentUser() u: JwtPayload, @Query() f: ReportFiltersDto) {
  return this.service.cobertura(u.consultorioId, f)
}
```

- [ ] **Step 4: tsc + commit**

Run: `cd apps/api && npx tsc --noEmit` (PASS)

```bash
git add apps/api/src/modules/reportes
git commit -m "feat(aseguradoras): reportes aseguradoras + cobertura (backend) (F4)"
```

---

### Task 3: Frontend — config de tabs + gating por flag

**Files:**
- Create: `apps/web/src/features/reportes/reports/aseguradoras.report.tsx`
- Create: `apps/web/src/features/reportes/reports/cobertura.report.tsx`
- Modify: `apps/web/src/features/reportes/reports/index.ts` (REPORTS + `requiereAseguradoras`)
- Modify: `apps/web/src/features/reportes/ReportesPage.tsx` (filtro de tabs por flag + render del meta de cobertura)

**Interfaces:**
- Consumes: `GET /reportes/aseguradoras|cobertura` (Task 2); `useAuthStore().user.trabajaConAseguradoras`.

- [ ] **Step 1: Configs de columnas + export**

`aseguradoras.report.tsx`:

```tsx
import type { AseguradoraReportRow } from '@pos/types'
import type { Column } from '../components/DataTable'
import { formatMoneda } from '../../../lib/utils'

export const aseguradorasColumns: Column<AseguradoraReportRow>[] = [
  { key: 'aseguradora', label: 'Aseguradora', sortable: true, render: (r) => r.aseguradora },
  { key: 'atenciones', label: 'Atenciones', align: 'right', sortable: true, render: (r) => <span className="tabular-nums">{r.atenciones}</span> },
  { key: 'pacientes', label: 'Pacientes', align: 'right', sortable: true, render: (r) => <span className="tabular-nums">{r.pacientes}</span> },
  { key: 'montoTotal', label: 'Total', align: 'right', sortable: true, render: (r) => formatMoneda(r.montoTotal) },
  { key: 'pendiente', label: 'Pendiente', align: 'right', sortable: true, render: (r) => formatMoneda(r.pendiente) },
  { key: 'pagado', label: 'Cobrado', align: 'right', sortable: true, render: (r) => formatMoneda(r.pagado) },
  { key: 'rechazado', label: 'Rechazado', align: 'right', sortable: true, render: (r) => formatMoneda(r.rechazado) },
]

export const aseguradorasExport = (rows: AseguradoraReportRow[]) => ({
  headers: ['Aseguradora', 'Atenciones', 'Pacientes', 'Total', 'Pendiente', 'Facturado', 'Cobrado', 'Rechazado'],
  rows: rows.map((r) => [r.aseguradora, r.atenciones, r.pacientes, r.montoTotal, r.pendiente, r.facturado, r.pagado, r.rechazado]),
})
```

`cobertura.report.tsx`:

```tsx
import type { CoberturaReportRow } from '@pos/types'
import type { Column } from '../components/DataTable'

export const coberturaColumns: Column<CoberturaReportRow>[] = [
  { key: 'aseguradora', label: 'Aseguradora', sortable: true, render: (r) => r.aseguradora },
  { key: 'pacientes', label: 'Pacientes', align: 'right', sortable: true, render: (r) => <span className="tabular-nums">{r.pacientes}</span> },
]

export const coberturaExport = (rows: CoberturaReportRow[]) => ({
  headers: ['Aseguradora', 'Pacientes'],
  rows: rows.map((r) => [r.aseguradora, r.pacientes]),
})
```

- [ ] **Step 2: REPORTS index + tipo `requiereAseguradoras`**

En `reports/index.ts`: importar las 2 configs; agregar `requiereAseguradoras?: boolean` al tipo del Record; agregar las 2 entradas:

```typescript
  aseguradoras: {
    label: 'Aseguradoras', columns: aseguradorasColumns, toExport: aseguradorasExport,
    searchPlaceholder: 'Buscar aseguradora...', soloAdmin: true, requiereAseguradoras: true,
    rowKey: (r) => r.aseguradoraId,
  },
  cobertura: {
    label: 'Cobertura', columns: coberturaColumns, toExport: coberturaExport,
    searchPlaceholder: 'Buscar aseguradora...', soloAdmin: true, requiereAseguradoras: true,
    rowKey: (r) => r.aseguradoraId,
  },
```

- [ ] **Step 3: Gating de tabs en ReportesPage + meta de cobertura**

En `ReportesPage.tsx`: leer `const trabajaConAseguradoras = useAuthStore((s) => s.user?.trabajaConAseguradoras)`. Cambiar el filtro de tabs (línea ~21) a:

```typescript
const tabs = (Object.keys(REPORTS) as ReportTab[]).filter(
  (t) => (!REPORTS[t].soloAdmin || esAdmin) && (!REPORTS[t].requiereAseguradoras || trabajaConAseguradoras),
)
```

En el bloque de `meta` (donde hoy maneja `cobranzas`/`gastos`), agregar la rama de `cobertura` para mostrar `MetaBreakdown` "Por categoría":

```tsx
if (tab === 'cobertura' && meta.porCategoria?.length) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <MetaBreakdown title="Pacientes por categoría" items={meta.porCategoria} />
    </div>
  )
}
```

(El tipo del `meta` IIFE ya incluye `porCategoria?: Array<{nombre;total}>`.)

- [ ] **Step 4: tsc + commit**

Run: `cd apps/web && npx tsc --noEmit` (PASS)

```bash
git add apps/web/src/features/reportes
git commit -m "feat(aseguradoras): tabs Aseguradoras + Cobertura en Reportes (gated) (F4)"
```

---

### Task 4: Gate `gate-aseguradoras-f4.ps1`

**Files:**
- Create: `scripts/gate-aseguradoras-f4.ps1`

**Interfaces:**
- Consumes: API en `:3000` (owner). Tenant propio.

- [ ] **Step 1: Escribir el gate**

Mirror de `scripts/gate-aseguradoras-f3.ps1`. Setup (reusa el de F3): tenant flag on, servicio (precioBase 200), aseguradora, categoría, tarifa (montoAseguradora=168), paciente con seguro, cita `usaSeguro=true` (genera LiquidacionItem). Rango `desde`/`hasta` = hoy. Casos:
1. `GET /reportes/aseguradoras?desde=$hoy&hasta=$hoy` → `rows` con 1 aseguradora, `atenciones=1`, `pacientes=1`, `montoTotal=168`, `pendiente=168`; `kpis` total=168.
2. `PATCH /liquidaciones/:id/estado {estado:'FACTURADO'}` luego `{estado:'PAGADO'}`; re-`GET /reportes/aseguradoras` → `pagado=168`, `pendiente=0`.
3. `GET /reportes/cobertura` → kpis `con_seguro=1`; `rows` con la aseguradora (pacientes=1); `meta.porCategoria` con 1 categoría.
4. Crear un paciente SIN seguro → `GET /reportes/cobertura` → `sin_seguro>=1`.
5. `GET /reportes/aseguradoras?export=1` → todas las filas sin paginar.
6. Rol SECRETARIA → `GET /reportes/aseguradoras` → 403.

PS 5.1: `@()` antes de `.Count`; `ConvertTo-Json -Depth 5`; leer `rows[0]` de la respuesta `{kpis,rows,...}`. Para el id de la liquidación, `GET /liquidaciones` (de F3).

- [ ] **Step 2: (Owner) correr el gate con API en :3000**

Run: `pwsh scripts/gate-aseguradoras-f4.ps1` → todas OK.

- [ ] **Step 3: Commit**

```bash
git add scripts/gate-aseguradoras-f4.ps1
git commit -m "test(aseguradoras): gate F4 (reportes aseguradoras + cobertura) (F4)"
```

---

## Self-review (cobertura del spec en F4)

- Reporte Aseguradoras: atenciones, pacientes, ingresos por aseguradora, pendiente/cobrado/rechazado: Task 2 (`aseguradoras`) + Task 3 (tab). OK.
- Reporte Cobertura: pacientes con/sin seguro, distribución por aseguradora (rows) y categoría (meta): Task 2 (`cobertura`) + Task 3 (tab + MetaBreakdown). OK.
- Gated por flag: Task 3 Step 3. OK.
- Export PDF/Excel: reusa `ExportButtons` del módulo reportes. OK.
- "Servicios más utilizados por aseguradora" del spec: NO incluido en el MVP (el reporte Servicios general ya existe; si se quiere por-aseguradora, es una mejora futura — anotar). 

## Cierre del módulo

Con F4, el módulo Aseguradoras y Convenios queda completo (F1 catálogo + flag, F2 paciente/cita/cobro, F3 liquidaciones, F4 reportes). Tras F4: review final whole-branch del módulo y actualización de PLAN.md / memoria. Migraciones del módulo: todas aditivas. Deploy: a criterio del owner.
