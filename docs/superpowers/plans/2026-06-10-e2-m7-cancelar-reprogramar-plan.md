# E2-M7 — Cancelar / No asistio / Reprogramar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exponer cancelar/no-asistio en la UI y permitir reprogramar (editar fecha/hora/doctor en el lugar) una cita, con el cobro anulado de forma segura.

**Architecture:** La maquina de estados de `@pos/types` gana la transicion `PENDIENTE → NO_ASISTIO`; el enum `EstadoCobro` (types + Prisma) gana `ANULADO`. `cambiarEstado` anula el cobro sin pagos al cancelar/no-asistir (409 si tiene pagos) y lo revive al reabrir. Nuevo `PUT /citas/:id` reprograma reusando `verificarDisponibilidad` con `excludeCitaId`. En la UI, CitaCard gana un menu "⋯" con las 3 acciones; dos modales nuevos (Reprogramar, Cancelar con motivo).

**Tech Stack:** NestJS + Prisma (PostgreSQL), @pos/types (build a dist), React + TanStack Query, Jest (transiciones), gate PS 5.1, Playwright.

**Decisiones fijadas (owner 2026-06-10):** reprogramar = editar en el lugar (REPROGRAMADA queda sin uso); al reprogramar el estado vuelve a PENDIENTE; servicio NO se cambia al reprogramar (solo fecha/hora/doctor — cambiar servicio implica recotizar el cobro, fuera de alcance).

---

### Task 1: Maquina de estados + EstadoCobro.ANULADO en @pos/types (TDD)

**Files:**
- Test: `apps/api/src/common/transiciones.spec.ts`
- Modify: `packages/types/src/enums/index.ts`

- [x] **Step 1: Test que falla** — agregar al final del describe en `transiciones.spec.ts`:

```ts
  it('PENDIENTE puede marcarse NO_ASISTIO directo (cron E3 y accion manual)', () => {
    expect(transicionValida(EstadoCita.PENDIENTE, EstadoCita.NO_ASISTIO)).toBe(true)
  })
```

- [x] **Step 2: Verificar que falla** — `cd apps/api && npx jest` → FAIL (received false).

- [x] **Step 3: Implementar** — en `packages/types/src/enums/index.ts`:

```ts
// EstadoCobro gana ANULADO (cita cancelada/no-show sin pagos):
export enum EstadoCobro {
  PENDIENTE = 'PENDIENTE',
  PARCIAL = 'PARCIAL',
  COMPLETO = 'COMPLETO',
  ANULADO = 'ANULADO',
}

// TRANSICIONES_VALIDAS, linea de PENDIENTE:
  [EstadoCita.PENDIENTE]: [EstadoCita.CONFIRMADA, EstadoCita.CANCELADA, EstadoCita.NO_ASISTIO],
```

- [x] **Step 4: Build del paquete** — `cd packages/types && pnpm build` (obligatorio: el API consume dist; OJO gotcha pnpm: un build script no aprobado aborta silenciosamente).

- [x] **Step 5: Verificar que pasa** — `cd apps/api && npx jest` → 10/10 PASS.

- [x] **Step 6: Commit** — `git add packages/types apps/api/src/common/transiciones.spec.ts && git commit -m "feat(types): transicion PENDIENTE->NO_ASISTIO y EstadoCobro.ANULADO"`

### Task 2: Migracion Prisma — ANULADO en enum EstadoCobro

**Files:**
- Modify: `apps/api/prisma/schema.prisma:32-36`

- [x] **Step 1:** en schema.prisma:

```prisma
enum EstadoCobro {
  PENDIENTE
  PARCIAL
  COMPLETO
  ANULADO
}
```

- [x] **Step 2:** Matar cualquier proceso en :3000 (gotcha Windows: bloquea la DLL de Prisma) y `cd apps/api && npx prisma migrate dev --name cobro_anulado` (aditiva, no destructiva).

- [x] **Step 3: Commit** — `git add apps/api/prisma && git commit -m "feat(api): EstadoCobro.ANULADO en schema (migracion aditiva)"`

### Task 3: API — cancelar/no-asistio anula el cobro; reabrir lo revive; pagos bloqueados

**Files:**
- Modify: `apps/api/src/modules/citas/citas.service.ts` (cambiarEstado)
- Modify: `apps/api/src/modules/cobros/cobros.service.ts` (registrarPago)

- [x] **Step 1:** en `citas.service.ts`, importar `EstadoCobro` desde `@prisma/client` y dentro de `cambiarEstado`, despues de la validacion de COBRADO y antes de la transaccion:

```ts
const ESTADOS_ANULAN_COBRO: EstadoCita[] = [EstadoCita.CANCELADA, EstadoCita.NO_ASISTIO]

// Cancelar/no-asistio con pagos registrados requiere anular los pagos
// primero (asiento de reversa, E2-M1): el dinero ya entro a la caja.
if (ESTADOS_ANULAN_COBRO.includes(dto.estado)) {
  const pagos = await this.prisma.pago.count({ where: { cobro: { citaId } } })
  if (pagos > 0) {
    throw new ConflictException(
      'La cita tiene pagos registrados: anule los pagos antes de cancelarla',
    )
  }
}
```

(constante a nivel de modulo, no dentro del metodo)

- [x] **Step 2:** dentro de la transaccion de `cambiarEstado`, despues del update de la cita:

```ts
// El cobro de una cita cancelada/no-show no es deuda ni cuenta abierta
if (ESTADOS_ANULAN_COBRO.includes(dto.estado) && cita.cobro) {
  await tx.cobro.update({
    where: { citaId },
    data: { estado: EstadoCobro.ANULADO },
  })
}

// Reabrir (CANCELADA/NO_ASISTIO -> PENDIENTE) revive el cobro
if (
  dto.estado === EstadoCita.PENDIENTE &&
  ESTADOS_ANULAN_COBRO.includes(cita.estado) &&
  cita.cobro
) {
  await tx.cobro.update({
    where: { citaId },
    data: { estado: EstadoCobro.PENDIENTE },
  })
}
```

- [x] **Step 3:** en `cobros.service.ts` `registrarPago`, junto al guard de COMPLETO:

```ts
if (cobro.estado === EstadoCobro.ANULADO) {
  throw new BadRequestException('El cobro esta anulado (cita cancelada o no asistida)')
}
```

- [x] **Step 4:** `cd apps/api && npx tsc --noEmit` → limpio.

- [x] **Step 5: Commit** — `git commit -m "feat(citas): cancelar/no-asistio anula el cobro sin pagos; 409 con pagos"`

### Task 4: API — PUT /citas/:id (reprogramar)

**Files:**
- Modify: `apps/api/src/modules/citas/citas.service.ts` (DTO + metodo)
- Modify: `apps/api/src/modules/citas/citas.controller.ts`

- [x] **Step 1:** DTO junto a los existentes:

```ts
export class ReprogramarCitaDto {
  @IsISO8601()
  fechaHora: string

  @IsInt() @IsOptional()
  doctorId?: number

  @IsString() @IsOptional()
  notasSecretaria?: string
}
```

- [x] **Step 2:** metodo en CitasService:

```ts
private static readonly ESTADOS_REPROGRAMABLES: EstadoCita[] = [
  EstadoCita.PENDIENTE,
  EstadoCita.CONFIRMADA,
  EstadoCita.LLEGO,
]

async reprogramar(
  consultorioId: number,
  citaId: number,
  dto: ReprogramarCitaDto,
  usuarioId: number,
) {
  const cita = await this.prisma.cita.findFirst({
    where: { id: citaId, consultorioId, deletedAt: null },
  })
  if (!cita) throw new NotFoundException('Cita no encontrada')
  if (!CitasService.ESTADOS_REPROGRAMABLES.includes(cita.estado)) {
    throw new BadRequestException(
      `No se puede reprogramar una cita en estado ${cita.estado}`,
    )
  }

  const doctorId = dto.doctorId ?? cita.doctorId
  const fechaHora = new Date(dto.fechaHora)
  const fechaFin = new Date(fechaHora.getTime() + cita.duracionMin * 60 * 1000)
  await this.verificarDisponibilidad(consultorioId, doctorId, fechaHora, fechaFin, citaId)

  return this.prisma.$transaction(async (tx) => {
    const actualizada = await tx.cita.update({
      where: { id: citaId },
      data: {
        fechaHora,
        doctorId,
        // la cita movida vuelve a PENDIENTE: hay que re-confirmar con el paciente
        estado: EstadoCita.PENDIENTE,
        ...(dto.notasSecretaria !== undefined && { notasSecretaria: dto.notasSecretaria }),
      },
    })

    await tx.log.create({
      data: {
        consultorioId,
        usuarioId,
        entidad: 'Cita',
        entidadId: citaId,
        accion: 'UPDATE',
        payloadAntes: {
          fechaHora: cita.fechaHora.toISOString(),
          doctorId: cita.doctorId,
          estado: cita.estado,
        },
        payloadDespues: {
          fechaHora: fechaHora.toISOString(),
          doctorId,
          estado: EstadoCita.PENDIENTE,
          motivo: 'reprogramacion',
        },
      },
    })

    return actualizada
  })
}
```

- [x] **Step 3:** controller (despues de `PUT :id/estado`; no hay conflicto de rutas — distinto numero de segmentos):

```ts
@Put(':id')
@ApiOperation({ summary: 'Reprogramar cita (editar fecha/hora/doctor en el lugar)' })
reprogramar(
  @CurrentUser() user: JwtPayload,
  @Param('id', ParseIntPipe) id: number,
  @Body() dto: ReprogramarCitaDto,
) {
  return this.service.reprogramar(user.consultorioId, id, dto, user.sub)
}
```

(importar `ReprogramarCitaDto` en el controller)

- [x] **Step 4:** `npx tsc --noEmit` → limpio. Commit: `feat(citas): PUT /citas/:id reprograma con revalidacion de solape`

### Task 5: UI — menu "⋯" en CitaCard + modales Reprogramar y Cancelar

**Files:**
- Create: `apps/web/src/features/agenda/ReprogramarCitaModal.tsx`
- Create: `apps/web/src/features/agenda/CancelarCitaModal.tsx`
- Modify: `apps/web/src/features/agenda/CitaCard.tsx` (menu + props nuevas)
- Modify: `apps/web/src/features/agenda/CitaDetalleModal.tsx` (pass-through)
- Modify: `apps/web/src/features/agenda/AgendaPage.tsx` (estado + render de modales)

Diseno: CitaCard recibe `onReprogramar` y `onCancelar` (abren modales del padre); "No asistio" usa `onCambiarEstado(NO_ASISTIO)` tras `window.confirm`. Visibilidad gateada por la maquina: cancelar si `transicionValida(estado, CANCELADA)`, no-asistio si `transicionValida(estado, NO_ASISTIO)`, reprogramar si estado en PENDIENTE/CONFIRMADA/LLEGO. Menu dropdown propio (estado local + click-outside como en NuevaCitaModal), boton trigger `MoreVertical` con `btnIconUI` y `aria-label="Mas acciones"`. CancelarCitaModal: motivo opcional + boton destructivo `bg-destructive`. ReprogramarCitaModal: fecha + hora + select doctor (query `['doctores']`), muestra el 409 de solape en `errorUI`. Ambos modales invalidan `['citas']` (+ claves financieras en cancelar). Design system: clases de `lib/ui.ts`.

(El codigo completo de los 5 archivos se escribe contra el codigo vigente — los patrones exactos estan en NuevaCitaModal/CobroModal y lib/ui.ts.)

- [x] **Step 1:** crear ambos modales. **Step 2:** menu en CitaCard. **Step 3:** wiring en AgendaPage + CitaDetalleModal. **Step 4:** `cd apps/web && npx tsc --noEmit` limpio. **Step 5:** Commit `feat(web): menu de acciones en cita - cancelar, no asistio, reprogramar`

### Task 6: Gate runtime `scripts/gate-e2m7.ps1`

**Files:** Create: `scripts/gate-e2m7.ps1` (patron de gate-agenda-nocturna.ps1: tenant propio, PS 5.1)

Casos (API corriendo en :3000):
1. Reprogramar cita PENDIENTE → 200, fechaHora nueva, estado PENDIENTE
2. Reprogramar al horario de otra cita del mismo doctor → 409
3. Cancelar (PUT estado CANCELADA + motivo) → estado CANCELADA y cobro ANULADO (GET /cobros/cita/:id)
4. Pagar el cobro anulado → 400
5. Reabrir (CANCELADA → PENDIENTE) → cobro vuelve a PENDIENTE
6. Pagar parcial una cita ATENDIDA y... (cancelar no es alcanzable desde ATENDIDA — caso real: pagar el cobro de una cita PENDIENTE via API directa y cancelar → 409)
7. PENDIENTE → NO_ASISTIO directo → 200 (transicion nueva)

- [x] **Step 1:** escribir el script. **Step 2:** levantar API y correrlo → todas las lineas en esperado. **Step 3:** Commit `test(gate): gate-e2m7 cancelar/reprogramar/no-asistio`

### Task 7: Playwright `apps/web/e2e/cancelar-reprogramar.spec.ts`

Patron de agenda-vistas.spec.ts (tenant propio via API en beforeAll, login UI):
1. Cancelar: abrir menu "⋯" de la cita → Cancelar → escribir motivo → confirmar → badge "Cancelada" visible
2. Reprogramar: crear segunda cita → menu → Reprogramar → cambiar hora → guardar → la cita muestra la hora nueva y badge "Pendiente"

- [x] **Step 1:** escribir spec. **Step 2:** `cd apps/web && npx playwright test` suite completa (LOGIN_RATE_LIMIT alto en .env). **Step 3:** Commit `test(e2e): cancelar y reprogramar desde la agenda`

### Task 8: Cierre — docs y memoria

- [x] PLAN.md: §1b item 5 → ✅; §7 mover `PUT /citas/:id` a implementados; §10 Etapa 2 bullet E2-M7 marcado hecho
- [x] etapa2-master-plan.md: E2-M7 marcado **EJECUTADO** con fecha y SHA
- [x] Memoria project_status.md: hito cerrado, siguiente = E2-M1
- [x] Commit `docs: E2-M7 ejecutado`

## Verificacion final

- `npx tsc --noEmit` en apps/api y apps/web
- `npx jest` en apps/api (10/10)
- `scripts/gate-e2m7.ps1` + gates previos como regresion (gate-m2, gate-m4)
- `npx playwright test` suite completa
