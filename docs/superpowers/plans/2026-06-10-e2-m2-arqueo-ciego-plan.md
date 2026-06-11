# E2-M2 — Arqueo de caja ciego — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al cerrar la caja, la secretaria declara el efectivo contado SIN ver el esperado; el sistema calcula la diferencia y el ADMIN revisa los descuadres (patron Baby Spa).

**Architecture:** `CajaDiaria` gana `montoDeclarado/montoEsperado/diferencia/notasCierre/revisadaPor/revisadaAt/notasRevision`. `POST /caja/cerrar` pasa a exigir `montoDeclarado` (solo efectivo participa; QR/tarjeta/vales son rastreables); diferencia 0 → auto-aprobada; distinto de 0 → pendiente de revision. `PUT /caja/:id/revisar` (ADMIN) aprueba con nota. UI: modal de cierre ciego (no muestra totales de efectivo) con resultado post-cierre, y en historial columna de arqueo + badge "Pendiente revision" + accion Revisar (ADMIN).

**Decisiones:** `montoDeclarado` REQUERIDO (sin el, el arqueo no es ciego; ningun gate/spec existente cierra caja, verificado por grep). `montoEsperado` se snapshotea al cierre porque una reversa posterior del mismo dia puede mover `totalEfectivo`.

---

### Task 1: Schema (migracion aditiva `arqueo_ciego` via migrate diff + deploy)

```prisma
// en model CajaDiaria:
  // Arqueo ciego (E2-M2): declarado vs esperado, solo efectivo
  montoDeclarado Decimal?  @db.Decimal(10, 2)
  montoEsperado  Decimal?  @db.Decimal(10, 2)
  diferencia     Decimal?  @db.Decimal(10, 2)
  notasCierre    String?
  revisadaPorId  Int?
  revisadaPor    Usuario?  @relation("CajaRevisadaPor", fields: [revisadaPorId], references: [id])
  revisadaAt     DateTime?
  notasRevision  String?

// en model Usuario:
  cajasRevisadas   CajaDiaria[] @relation("CajaRevisadaPor")
```

### Task 2: API — cierre ciego + revision

`caja.service.ts`:
- `CerrarCajaDto { @IsNumber() @Min(0) montoDeclarado; @IsString() @IsOptional() notasCierre? }`
- `cerrar(consultorioId, usuarioId, dto)`: 404 si no hay caja hoy; 400 si ya cerrada. `montoEsperado = caja.totalEfectivo`; `diferencia = declarado - esperado`; si diferencia 0 → auto-revision (revisadaPorId = usuario, revisadaAt = now, notasRevision = 'auto: sin diferencia'). Log UPDATE CajaDiaria con antes/despues.
- `RevisarCajaDto { @IsString() @IsOptional() nota? }` + `revisar(consultorioId, cajaId, dto, usuarioId)`: 404 tenant, 400 si no cerrada o ya revisada. Log.

`caja.controller.ts`: `POST /caja/cerrar` con body DTO; `PUT /caja/:id/revisar` con `@Roles(Rol.ADMIN)`.

### Task 3: UI

- Create `apps/web/src/features/caja/CerrarCajaModal.tsx`: aviso de arqueo ciego (no muestra efectivo esperado), input monto declarado + notas; tras cerrar muestra el resultado (esperado/declarado/diferencia y si quedo pendiente de revision).
- Create `apps/web/src/features/caja/RevisarCajaModal.tsx` (ADMIN): nota + aprobar.
- `CajaPage`: boton "Cerrar caja" abre el modal; en historial columnas Declarado/Diferencia (tabular-nums, rojo si != 0), badge "Pendiente revision" o "Revisada", boton Revisar (ADMIN, solo pendientes).

### Task 4: Verificacion

- `scripts/gate-e2m2.ps1` (2 tenants): cierre exacto → diferencia 0 auto-aprobada; cierre con faltante → diferencia negativa pendiente; SECRETARIA revisa → 403; ADMIN revisa → aprobada; re-cerrar → 400; cerrar sin monto → 400.
- `apps/web/e2e/arqueo-caja.spec.ts`: el modal de cierre no muestra el esperado; declarar de menos → resultado con diferencia; historial con badge; revisar como ADMIN.
- tsc ambas apps + regresion (jest, gate-m2/m4/e2m1/e2m7, suite Playwright).

### Task 5: Cierre — PLAN.md (item 19 ✅, §10), master plan, memoria.
