# E2-M8 — Gastos administrativos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registro de egresos con categoria/fecha/personal/monto/cuenta de origen; los gastos en efectivo descuentan del arqueo; KPI de gastos y resultado neto en el dashboard (decision owner 2026-06-10).

**Architecture:** Tabla `gastos` + enums `CategoriaGasto`/`CuentaGasto` (Prisma y @pos/types). Modulo NestJS `gastos` (patron pacientes): CRUD con soft delete y log; cualquier rol autenticado registra y lista, solo ADMIN edita/borra. La caja NO se reescribe: `/caja/hoy` computa `egresosEfectivo`/`egresosTotales` dinamicamente desde gastos del dia, y el arqueo ciego compara contra efectivo NETO (`totalEfectivo - egresosEfectivo`). Si se borra un gasto antes del cierre, el neto se corrige solo.

**Decisiones:** los egresos se computan on-the-fly (no mutan `cajaDiaria.totalEfectivo`, que sigue siendo "lo cobrado"); `montoEsperado` del cierre snapshotea el neto. `fecha` del gasto es dia calendario (`@db.Date`), default hoy en la UI.

---

### Task 1: Enums + schema (migracion `gastos` via migrate diff + deploy)

@pos/types: `CategoriaGasto { INSUMOS SUELDOS ALQUILER SERVICIOS IMPUESTOS OTROS }`, `CuentaGasto { CAJA_EFECTIVO BANCO OTRO }` + `pnpm build`.

```prisma
enum CategoriaGasto { INSUMOS SUELDOS ALQUILER SERVICIOS IMPUESTOS OTROS }
enum CuentaGasto { CAJA_EFECTIVO BANCO OTRO }

model Gasto {
  id              Int @id @default(autoincrement())
  consultorioId   Int
  consultorio     Consultorio @relation(fields: [consultorioId], references: [id])
  fecha           DateTime @db.Date
  categoria       CategoriaGasto
  monto           Decimal @db.Decimal(10, 2)
  descripcion     String
  personal        String?   // a quien se pago (texto libre)
  cuenta          CuentaGasto @default(CAJA_EFECTIVO)
  comprobanteUrl  String?
  registradoPorId Int
  registradoPor   Usuario @relation("GastoRegistradoPor", fields: [registradoPorId], references: [id])
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?
  @@index([consultorioId, fecha])
  @@map("gastos")
}
```
+ `Consultorio.gastos Gasto[]`, `Usuario.gastosRegistrados Gasto[] @relation("GastoRegistradoPor")`.

### Task 2: API

- `modules/gastos/` (module/controller/service, registrar en app.module):
  - `GET /gastos?desde=&hasta=&categoria=` (lista desc por fecha, sin borrados)
  - `POST /gastos` (CreateGastoDto: fecha ISO date, categoria enum, monto >0, descripcion, personal?, cuenta enum, comprobanteUrl?) + log CREATE
  - `PUT /gastos/:id` (ADMIN, PartialType) + log UPDATE
  - `DELETE /gastos/:id` (ADMIN, soft) + log DELETE
  - `GET /gastos/resumen?desde=&hasta=` → `{ total, porCategoria }` (declarar antes de `:id`)
- `caja.service.getHoy`: + `egresosEfectivo` y `egresosTotales` (gastos de hoy, deletedAt null)
- `caja.service.cerrar`: `esperado = totalEfectivo - egresosEfectivo`

### Task 3: UI

- Ruta `/gastos` en App.tsx + item nav "Gastos" (icon Receipt) en AppShell
- `features/gastos/GastosPage.tsx`: header chip + Nuevo gasto; filtros desde/hasta/categoria; tabla (fecha, categoria badge, descripcion, personal, cuenta, monto, editar/borrar ADMIN) + tfoot total
- `features/gastos/GastoModal.tsx`: alta/edicion (patron ServicioModal)
- `CajaPage` (hoy): card "Egresos de hoy" (destructive) en el desglose
- `DashboardPage` (panel Caja del dia): filas "Gastos del mes" y "Resultado neto" (ingresosMes − gastosMes)

### Task 4: Verificacion

- `scripts/gate-e2m8.ps1`: crear gasto efectivo → lista/resumen; `/caja/hoy` egresos; cierre declarando el NETO → diferencia 0; SECRETARIA edita/borra → 403; ADMIN edita y borra (soft) → resumen corrige; POST invalido → 400.
- `apps/web/e2e/gastos.spec.ts`: alta desde la UI, fila + total visibles, KPI en dashboard.
- tsc ambas apps, jest, regresion (gate-e2m1/e2m2/e2m7/m2), suite Playwright completa.

### Task 5: Cierre — PLAN.md (items 20 y 28 ✅, §7 endpoints), master plan, memoria.
