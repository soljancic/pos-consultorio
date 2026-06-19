# Aseguradoras y Convenios — F3 (Liquidaciones) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gestionar las cuentas por cobrar a las aseguradoras (`LiquidacionItem` que F2 ya crea por cada cita con seguro): listarlas y filtrarlas, ver totales por estado, generar la liquidación mensual por aseguradora, cambiar el estado (FACTURADO/PAGADO/RECHAZADO) con log, y exportar a Excel/PDF.

**Architecture:** Módulo API `liquidaciones` de solo gestión (no crea items: los crea F2 al facturar la cita). Lista con filtros + paginación + totales, replicando el patrón de `reportes` (paginar/ordenar/export-all). Transiciones de estado validadas + logueadas. UI: página nueva `/liquidaciones` (ADMIN + gated por flag) con tabla, filtros, totales, acciones de estado y el componente `ExportButtons` existente (export client-side, XLSX + jsPDF — NO backend).

**Tech Stack:** NestJS + Prisma (api), React 19 + Vite + TS + Tailwind + TanStack Query v5 + Zustand + react-router v7 (web). Export client-side via `ExportButtons` (xlsx + jsPDF). @pos/types.

## Global Constraints

- `consultorioId` SIEMPRE del JWT (`@CurrentUser()`); todo `findMany`/`update` filtra por él.
- Roles: `@Roles(Rol.ADMIN)` con `Rol` de `@pos/types` (liquidaciones es ADMIN).
- DTOs con class-validator (whitelist global → 400). Enum `EstadoLiquidacion`: backend `@prisma/client`, frontend `@pos/types`, valores idénticos.
- Dinero `Decimal`; en JSON llega string, `Number()` solo para UI/totales mostrados; los totales se suman en el backend con Decimal o `_sum` de Prisma.
- `LiquidacionItem` NO se borra acá (en F2 se borra al cancelar la cita); F3 solo cambia `estado`. Cada cambio de estado → tabla `logs`.
- Las transiciones de estado se validan en el service (guard explícito); transición inválida → 400.
- Export: reutilizar `apps/web/src/features/reportes/components/ExportButtons.tsx` (recibe `filename` + `loadAll` que trae TODAS las filas y las mapea a `{headers, rows}`). NO agregar generación de PDF/Excel en el backend.
- Nav/ruta: la página se gatea por `esAdmin && trabajaConAseguradoras` (flag del auth store) tanto en el item de nav como en la ruta.
- UI: cada pantalla nueva pasa por impeccable + ui-ux-pro-max + frontend-design ANTES del JSX; tokens de `lib/ui.ts`, FloatingSelect/FloatingInput, ConfirmarModal (no window.confirm), copy en español CON acentos, tabular-nums en montos, touch >=44px, focus rings.
- Verificación antes de cada commit: `cd apps/api && npx tsc --noEmit`, `cd apps/web && npx tsc --noEmit`. Tras `packages/types`: `cd packages/types && pnpm build`. Branches: commit directo en master. El gate `.ps1` lo corre el owner.

## Contexto de F2 (ya en master)

- Modelo `LiquidacionItem` (tabla `liquidacion_items`): `id, consultorioId, citaId @unique, aseguradoraId, categoriaSeguroId, pacienteId, servicioId, fecha, montoAseguradora Decimal(10,2), codigoSeguro?, estado EstadoLiquidacion @default(PENDIENTE), facturadoAt?, pagadoAt?, rechazoMotivo?, createdAt, updatedAt`.
- Enum `EstadoLiquidacion = PENDIENTE | FACTURADO | PAGADO | RECHAZADO` (Prisma + `@pos/types` en `packages/types/src/enums/index.ts`).
- F2 crea un `LiquidacionItem` (estado PENDIENTE) por cada cita con seguro y `montoAseguradora > 0`.

## Minors de F2 a doblar acá (del ledger)

- Sincronizar la interface `Cita` de `@pos/types` con los campos snapshot de F2 (`usaSeguro/categoriaSeguroId/montoPaciente/montoAseguradora/codigoSeguro`) si la UI los necesita (Task 3 lo evalúa; si no se consumen, dejar la nota).
- `reprogramar` Branch B: agregar `codigoSeguro: null` al `cita.update` de revert-a-particular (cosmético). citas.service.
- Typo helper `validarCategoriaseguro` → `validarCategoriaSeguro`. pacientes.service.
- (Estos son cosméticos; se hacen en el Step de cleanup de Task 1 para no abrir un commit aparte.)

---

### Task 1: Backend — módulo `liquidaciones` (lista + filtros + totales) + cleanup F2

**Files:**
- Create: `apps/api/src/modules/liquidaciones/liquidaciones.service.ts`
- Create: `apps/api/src/modules/liquidaciones/liquidaciones.controller.ts`
- Create: `apps/api/src/modules/liquidaciones/liquidaciones.module.ts`
- Create: `apps/api/src/modules/liquidaciones/dto/liquidacion-filters.dto.ts`
- Modify: `apps/api/src/app.module.ts` (registrar módulo)
- Modify: `apps/api/src/modules/citas/citas.service.ts` (cleanup: `codigoSeguro: null` en revert) y `apps/api/src/modules/pacientes/pacientes.service.ts` (rename `validarCategoriaSeguro`)

**Interfaces:**
- Produces: `GET /liquidaciones` (ADMIN) con filtros + paginación + `export=1`; respuesta `{ rows, total, page, pageSize, totales: { pendiente, facturado, pagado, rechazado, cantidad } }`. Cada row: `{ id, fecha, estado, montoAseguradora, codigoSeguro, aseguradora: {id,nombre}, paciente: {id,nombre,apellido}, servicio: {id,nombre}, categoriaSeguro: {id,nombre} }`.

- [ ] **Step 1: DTO de filtros**

Crear `dto/liquidacion-filters.dto.ts` (mirror de `reportes/dto/report-filters.dto.ts`):

```typescript
import { Type } from 'class-transformer'
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min, Max } from 'class-validator'
import { EstadoLiquidacion } from '@prisma/client'

export class LiquidacionFiltersDto {
  @IsOptional() @IsDateString()
  desde?: string

  @IsOptional() @IsDateString()
  hasta?: string

  @IsOptional() @Type(() => Number) @IsInt()
  aseguradoraId?: number

  @IsOptional() @Type(() => Number) @IsInt()
  pacienteId?: number

  @IsOptional() @IsEnum(EstadoLiquidacion)
  estado?: EstadoLiquidacion

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize?: number = 25

  // export='1' => todas las filas (sin paginar) para el ExportButtons del front
  @IsOptional() @IsString()
  export?: string
}
```

- [ ] **Step 2: Service — findAll con filtros, totales y paginación**

Crear `liquidaciones.service.ts`. El `where` arma: `consultorioId`, rango `fecha` (`gte desde 00:00:00Z` / `lt hasta+1d 00:00:00Z` usando strings Z — patrón de fechas del proyecto, sin `setHours`), `aseguradoraId`, `pacienteId`, `estado`. Totales por estado vía `groupBy`/`aggregate` con el MISMO where (ignorando `estado` para los totales globales del filtro — usar un where base sin estado para los totales y agregarlo solo a las rows). Rows con include de aseguradora/paciente/servicio/categoriaSeguro (select de id+nombre). Paginar offset (`skip`/`take`) salvo `export==='1'` (devuelve todas). `orderBy: [{ fecha: 'desc' }, { id: 'desc' }]`.

```typescript
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Prisma } from '@prisma/client'
import { LiquidacionFiltersDto } from './dto/liquidacion-filters.dto'

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
          ...(f.hasta ? { lt: new Date(`${f.hasta}T00:00:00Z`) } : {}),
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

    // Totales por estado sobre el filtro (sin el estado puntual): para el panel de resumen
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
}
```

- [ ] **Step 3: Controller + module + registro**

`liquidaciones.controller.ts` (`@Controller('liquidaciones')`, `@Get()` con `@Roles(Rol.ADMIN)` y `@Query() f: LiquidacionFiltersDto` → `service.findAll(user.consultorioId, f)`). `liquidaciones.module.ts` (controller + service). Registrar `LiquidacionesModule` en `app.module.ts` imports.

- [ ] **Step 4: Cleanup de minors F2**

En `citas.service.ts`, en el `tx.cita.update` del revert-a-particular de `reprogramar` (Branch B), agregar `codigoSeguro: null` junto a los otros nulos. En `pacientes.service.ts`, renombrar el helper `validarCategoriaseguro` → `validarCategoriaSeguro` (definición + llamadas).

- [ ] **Step 5: tsc + commit**

Run: `cd apps/api && npx tsc --noEmit` (PASS)

```bash
git add apps/api/src/modules/liquidaciones apps/api/src/app.module.ts apps/api/src/modules/citas/citas.service.ts apps/api/src/modules/pacientes/pacientes.service.ts
git commit -m "feat(aseguradoras): modulo liquidaciones lista+filtros+totales + cleanup F2 (F3)"
```

---

### Task 2: Backend — transiciones de estado (facturar / pagar / rechazar)

**Files:**
- Modify: `apps/api/src/modules/liquidaciones/liquidaciones.service.ts` (método `cambiarEstado` + guard + DTO)
- Modify: `apps/api/src/modules/liquidaciones/liquidaciones.controller.ts` (endpoint)

**Interfaces:**
- Produces: `PATCH /liquidaciones/:id/estado` (ADMIN) body `{ estado: EstadoLiquidacion, motivo?: string }` → actualiza estado + timestamp + log. Transiciones válidas: PENDIENTE→FACTURADO, PENDIENTE→RECHAZADO, FACTURADO→PAGADO, FACTURADO→RECHAZADO, RECHAZADO→PENDIENTE (reabrir). PAGADO es terminal. RECHAZADO requiere `motivo`.

- [ ] **Step 1: DTO + guard + método**

Agregar a `liquidaciones.service.ts`:

```typescript
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { IsEnum, IsOptional, IsString, ValidateIf, IsNotEmpty } from 'class-validator'
import { EstadoLiquidacion } from '@prisma/client'

export class CambiarEstadoLiquidacionDto {
  @IsEnum(EstadoLiquidacion)
  estado: EstadoLiquidacion

  @ValidateIf((o) => o.estado === EstadoLiquidacion.RECHAZADO)
  @IsString() @IsNotEmpty()
  motivo?: string
}

const TRANSICIONES: Record<EstadoLiquidacion, EstadoLiquidacion[]> = {
  PENDIENTE: ['FACTURADO', 'RECHAZADO'],
  FACTURADO: ['PAGADO', 'RECHAZADO'],
  PAGADO: [],
  RECHAZADO: ['PENDIENTE'],
}
```

Método `cambiarEstado(consultorioId, usuarioId, id, dto)`:
- `findFirst({ where: { id, consultorioId } })` → 404 si no existe.
- Validar `TRANSICIONES[actual.estado].includes(dto.estado)` → 400 con mensaje claro si no.
- `$transaction`: `update` el item con el nuevo `estado` + el timestamp correspondiente (`facturadoAt: new Date()` para FACTURADO; `pagadoAt: new Date()` para PAGADO; `rechazoMotivo: dto.motivo` para RECHAZADO; al reabrir a PENDIENTE limpiar `rechazoMotivo: null`). Crear `log` (entidad 'LiquidacionItem', accion 'UPDATE', payloadAntes/Despues con estado).

- [ ] **Step 2: Endpoint**

En el controller: `@Patch(':id/estado') @Roles(Rol.ADMIN)` → `service.cambiarEstado(user.consultorioId, user.sub, id, dto)` (`@Param('id', ParseIntPipe)`).

- [ ] **Step 3: tsc + commit**

Run: `cd apps/api && npx tsc --noEmit` (PASS)

```bash
git add apps/api/src/modules/liquidaciones
git commit -m "feat(aseguradoras): transiciones de estado de liquidacion + log (F3)"
```

---

### Task 3: Frontend — LiquidacionesPage (tabla + filtros + totales + export) + ruta + nav

**Files:**
- Create: `apps/web/src/features/liquidaciones/LiquidacionesPage.tsx`
- Modify: `apps/web/src/App.tsx` (ruta `/liquidaciones`)
- Modify: `apps/web/src/components/shared/AppShell.tsx` (item de nav gated por flag)

**Interfaces:**
- Consumes: `GET /liquidaciones` (Task 1), `GET /aseguradoras/activas` (filtro), `useAuthStore().user.trabajaConAseguradoras`, `ExportButtons`.

- [ ] **Step 1: Página (tabla + filtros + totales)**

Aplicar skills UI antes del JSX. Header estándar (chip + título, patrón de CatalogoPage/ReportesPage). Filtros: FloatingSelect Aseguradora (de `/aseguradoras/activas`), rango de fechas (2 inputs date), FloatingSelect Estado (Todos/Pendiente/Facturado/Pagado/Rechazado). Query `['liquidaciones', filtros] -> GET /liquidaciones?...`. Panel de totales (4 chips: Pendiente/Facturado/Pagado/Rechazado con `formatMoneda(Number(...))`, tabular-nums). Tabla (Fecha, Aseguradora, Paciente, Servicio, Código, Monto, Estado badge + acciones — las acciones se cablean en Task 4, acá dejar la columna). Badge de estado por color + texto (no solo color). EmptyState (icono lucide, ej. `FileText`/`Receipt`) cuando no hay filas. Paginación simple (o scroll infinito si preferís; MVP: paginado con botones prev/next usando `page`/`total`).

- [ ] **Step 2: Export**

Agregar `<ExportButtons filename="liquidaciones" loadAll={...} />` en el header. `loadAll` hace `GET /liquidaciones?...&export=1`, mapea a `headers = ['Fecha','Aseguradora','Paciente','Servicio','Código','Monto','Estado']` y `rows` (formateando fecha con `formatFecha`, monto con `Number`). 

- [ ] **Step 3: Ruta + nav gated**

En `App.tsx` agregar `<Route path="liquidaciones" element={<AdminRoute><LiquidacionesPage /></AdminRoute>} />`. En `AppShell.tsx`, el array de nav: agregar `{ to: '/liquidaciones', icon: <un icono lucide, ej. Receipt>, label: 'Liquidaciones', soloAdmin: true, requiereAseguradoras: true }` y, en el filtro que arma los items visibles, excluir los `requiereAseguradoras` cuando `!user?.trabajaConAseguradoras` (leer el flag del auth store en AppShell). Importar el icono.

- [ ] **Step 4: tsc + commit**

Run: `cd apps/web && npx tsc --noEmit` (PASS)

```bash
git add apps/web/src/features/liquidaciones apps/web/src/App.tsx apps/web/src/components/shared/AppShell.tsx
git commit -m "feat(aseguradoras): pagina Liquidaciones (tabla+filtros+totales+export) + nav (F3)"
```

---

### Task 4: Frontend — acciones de estado (Facturar / Pagar / Rechazar)

**Files:**
- Modify: `apps/web/src/features/liquidaciones/LiquidacionesPage.tsx`
- Create: `apps/web/src/features/liquidaciones/RechazarLiquidacionModal.tsx`

**Interfaces:**
- Consumes: `PATCH /liquidaciones/:id/estado` (Task 2).

- [ ] **Step 1: Mutations + botones por fila**

Mutation `cambiarEstado` → `PATCH /liquidaciones/${id}/estado` con `{ estado, motivo? }`; `onSuccess` invalida `['liquidaciones']`. Por fila, mostrar los botones válidos según el estado actual (PENDIENTE → "Facturar"/"Rechazar"; FACTURADO → "Marcar pagado"/"Rechazar"; PAGADO → sin acciones; RECHAZADO → "Reabrir"). Botones con touch >=44px, focus ring; destructivo (Rechazar) con `btnDestructiveUI` o estilo de advertencia.

- [ ] **Step 2: Modal de rechazo (motivo obligatorio)**

Crear `RechazarLiquidacionModal.tsx` (patrón ModalHeader + FloatingTextarea + ConfirmarModal-like): pide `motivo` (requerido), confirma → `cambiarEstado.mutate({ estado: 'RECHAZADO', motivo })`. Facturar/Pagar/Reabrir confirman con `ConfirmarModal` (sin motivo). Nada de window.confirm.

- [ ] **Step 3: tsc + commit**

Run: `cd apps/web && npx tsc --noEmit` (PASS)

```bash
git add apps/web/src/features/liquidaciones
git commit -m "feat(aseguradoras): acciones de estado de liquidacion en la UI (F3)"
```

---

### Task 5: Gate `gate-aseguradoras-f3.ps1`

**Files:**
- Create: `scripts/gate-aseguradoras-f3.ps1`

**Interfaces:**
- Consumes: API en `:3000` (owner). Tenant propio.

- [ ] **Step 1: Escribir el gate**

Mirror de `scripts/gate-aseguradoras-f2.ps1`. Setup: tenant con flag on, servicio, aseguradora, categoría, tarifa (montoAseguradora=168), paciente con seguro, y crear una cita con `usaSeguro=true` (genera el LiquidacionItem PENDIENTE). Casos:
1. `GET /liquidaciones` → 1 row, estado PENDIENTE, montoAseguradora=168; `totales.pendiente=168`.
2. `GET /liquidaciones?estado=PAGADO` → 0 rows.
3. `PATCH /liquidaciones/:id/estado { estado:'PAGADO' }` desde PENDIENTE → 400 (transición inválida; PENDIENTE no va directo a PAGADO).
4. `PATCH .../estado { estado:'FACTURADO' }` → OK, `facturadoAt` seteado.
5. `PATCH .../estado { estado:'PAGADO' }` → OK, `pagadoAt` seteado; `GET /liquidaciones?estado=PAGADO` → 1 row.
6. `PATCH .../estado { estado:'RECHAZADO' }` sin motivo → 400 (ValidateIf).
7. `GET /liquidaciones?export=1` → devuelve rows sin paginar (cantidad coincide).
8. Rol SECRETARIA: `GET /liquidaciones` → 403.

PS 5.1: `@()` antes de `.Count`; `ConvertTo-Json -Depth 5`. Para leer el `id` del LiquidacionItem, usar `GET /liquidaciones` y tomar `rows[0].id`.

- [ ] **Step 2: (Owner) correr el gate con API en :3000**

Run: `pwsh scripts/gate-aseguradoras-f3.ps1` → todas OK.

- [ ] **Step 3: Commit**

```bash
git add scripts/gate-aseguradoras-f3.ps1
git commit -m "test(aseguradoras): gate F3 (liquidaciones + transiciones) (F3)"
```

---

## Self-review (cobertura del spec en F3)

- Liquidaciones list + filtros (aseguradora/fechas/estado/paciente): Task 1. OK.
- Totales por estado (pendiente/facturado/pagado/rechazado): Task 1. OK.
- Estados + transiciones + marcar pagado/facturado/rechazado: Task 2 + Task 4. OK.
- Generar liquidación mensual = filtrar por aseguradora + mes (rango de fechas) + totales + export: cubierto por los filtros de Task 1/3 (no hay entidad batch — decisión F1: item por cita + filtro). OK.
- Export PDF + Excel: Task 3 (ExportButtons client-side). OK.
- Página + ruta + nav gated por flag: Task 3. OK.
- Cleanup minors F2: Task 1 Step 4. OK.
- Reportes (aseguradoras + cobertura): NO en F3 (es F4).

## Nota para F4

F4 (reportes aseguradoras + cobertura) se planifica aparte. Reusa el patrón del módulo `reportes` (service + endpoints + ReportesPage config-driven). Datos: atenciones/pacientes/ingresos por aseguradora desde `LiquidacionItem` + `Cita.usaSeguro`; distribución con/sin seguro desde `Paciente.tieneSeguro`.
