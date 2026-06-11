# E2-M1 — Anulacion de pagos con asiento de reversa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un pago mal registrado se corrige con un pago espejo negativo (reversa); el original queda auditado, nunca se borra (regla PLAN.md §8, patron Baby Spa).

**Architecture:** `Pago` gana `anuladoAt/anuladoPorId/motivoAnulacion/reversaDeId` (autorelacion). `POST /cobros/pagos/:id/anular` (ADMIN) en transaccion: crea reversa negativa, marca el original, restaura saldo/estado del cobro, revierte la cita COBRADO→CON_DEUDA, incrementa `deudaTotal`, descuenta la caja DEL DIA DE LA REVERSA y loggea. UI: modal AnularPagoModal compartido por CajaPage (movimientos) y CobroModal (lista de pagos); reversas en rojo.

**Tech Stack:** NestJS + Prisma, React + TanStack Query, gate PS 5.1, Playwright.

---

### Task 1: Schema — anulacion en Pago (migracion aditiva `anulacion_pagos`)

```prisma
// en model Pago (despues de createdAt):
  // Anulacion con asiento de reversa (E2-M1): el original nunca se borra
  anuladoAt       DateTime?
  anuladoPorId    Int?
  anuladoPor      Usuario?  @relation("PagoAnuladoPor", fields: [anuladoPorId], references: [id])
  motivoAnulacion String?
  reversaDeId     Int?      @unique
  reversaDe       Pago?     @relation("PagoReversa", fields: [reversaDeId], references: [id])
  reversa         Pago?     @relation("PagoReversa")

// en model Usuario (junto a pagosRegistrados):
  pagosAnulados    Pago[]       @relation("PagoAnuladoPor")
```

Pasos: editar schema → matar :3000 → `npx prisma migrate dev --name anulacion_pagos` → commit.

### Task 2: API — `POST /cobros/pagos/:id/anular` (ADMIN)

`cobros.service.ts`: DTO `AnularPagoDto { motivo? }` + metodo `anularPago`:
- 404 si el pago no es del tenant; 400 si `monto < 0` (es reversa) o `anuladoAt` ya seteado.
- Transaccion: (1) crea Pago espejo `monto.negated()` con `reversaDeId`; (2) marca original (`anuladoAt/anuladoPorId/motivoAnulacion`); (3) cobro: `saldoPendiente += monto`, estado PARCIAL si quedo algo pagado, si no PENDIENTE; (4) cita COBRADO → CON_DEUDA; (5) `paciente.deudaTotal += monto` (espejo del decrement de registrarPago); (6) caja de HOY (`diaCajaLocal()`): decrement del campo de la forma de pago y de totalGeneral (upsert, puede quedar negativa); (7) log PAYMENT con antes/despues.
- Respuesta: cobro fresco (`findByCita`) + `advertencia` si la caja del dia del pago original esta cerrada (alerta, no bloquea).

`cobros.controller.ts`: `@Post('pagos/:id/anular')` con `@Roles(Rol.ADMIN)` (guard global ya activo).

### Task 3: UI — AnularPagoModal + reversas visibles

- Create `apps/web/src/features/caja/AnularPagoModal.tsx`: modal destructivo (patron CancelarCitaModal) con motivo opcional; `POST /cobros/pagos/:id/anular`; invalida claves financieras.
- `CajaPage`: en movimientos, monto negativo → rojo + badge "Reversa"; original anulado → badge "Anulado"; boton anular (ADMIN, monto>0, no anulado) abre el modal.
- `CobroModal`: seccion "Pagos registrados" (el cobro ya incluye `pagos`) con fecha/forma/monto, badges Reversa/Anulado y boton anular (ADMIN).

### Task 4: Verificacion

- `scripts/gate-e2m1.ps1`: anular pago parcial → saldo y deudaTotal restaurados, caja en 0, original anulado + reversa negativa; re-anular → 400; anular reversa → 400; SECRETARIA → 403; pago COMPLETO anulado → cita vuelve a CON_DEUDA.
- `apps/web/e2e/anular-pago.spec.ts`: login → /caja → anular movimiento con motivo → fila de reversa y badge visibles.
- `npx tsc --noEmit` ambas apps; jest; regresion gate-m2/m4/e2m7; suite Playwright completa.

### Task 5: Cierre

PLAN.md (checklist item 16 ✅, §10 bullet, endpoints), master plan E2-M1 EJECUTADO, memoria.
