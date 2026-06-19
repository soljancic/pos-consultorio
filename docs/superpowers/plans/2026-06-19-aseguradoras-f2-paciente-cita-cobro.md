# Aseguradoras y Convenios — F2 (Paciente + Cita + Cobro) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un paciente pueda tener seguro registrado y que cada cita decida si usarlo; con seguro y tarifa, el Cobro del paciente nace con `montoPaciente` y se genera una cuenta por cobrar a la aseguradora (`LiquidacionItem`) sin tocar caja ni deuda del paciente.

**Architecture:** F1 ya dejó el flag `trabajaConAseguradoras` (en AuthUser) y el catálogo (Aseguradora/CategoriaSeguro/TarifaCobertura). F2 agrega: enum `EstadoLiquidacion` + modelo `LiquidacionItem`, campos de seguro en `Paciente` y snapshot de cobertura en `Cita`; integra el cálculo en la creación de cita (transaccional con el Cobro), y maneja reprogramación/cancelación. UI: sección "Seguro" en PacienteModal y bloque "Cobertura" en NuevaCitaModal, ambos gated por el flag.

**Tech Stack:** NestJS + Prisma + PostgreSQL (api), React 19 + Vite + TS + Tailwind + TanStack Query v5 + Zustand (web), @pos/types.

## Global Constraints

- `consultorioId` SIEMPRE del JWT (`@CurrentUser()`), NUNCA del body/params.
- La aseguradora/categoría de la cita se leen del PACIENTE en el backend (snapshot), NO del body de la cita. El body solo trae `usaSeguro` y, opcional, un `codigoSeguro` override.
- Todo DTO con class-validator (ValidationPipe global whitelist + forbidNonWhitelisted => 400).
- Dinero en `Decimal` de Prisma; `Number()` solo para UI. Nada de float.
- Cobros/deudores/caja operan SOLO sobre `Cobro.total`/`saldoPendiente` (= montoPaciente con seguro). `montoAseguradora` vive SOLO en `LiquidacionItem`; nunca toca `caja_diaria` ni `Paciente.deudaTotal`.
- Operaciones multi-tabla en `prisma.$transaction` (cita + cobro + liquidacion).
- Acciones críticas → tabla `logs` (ya hay logging en citas.service para create/reprogramar; mantenerlo).
- Enums: backend desde `@prisma/client`, frontend desde `@pos/types`, valores idénticos.
- Gating del módulo por flag: la lógica de cobertura en el backend lee `consultorio.trabajaConAseguradoras` (columna, no el JWT, para evitar stale multiusuario). El front gatea UI con `useAuthStore((s) => s.user?.trabajaConAseguradoras)`.
- Campo `activa` (femenino) en Aseguradora/CategoriaSeguro; `activo` (masculino) en Servicio/Paciente. No confundirlos (gotcha de F1).
- UI: cada pantalla nueva/modificada pasa por impeccable + ui-ux-pro-max + frontend-design ANTES del JSX; reusar el switch-container de DoctorModal para toggles, FloatingInput/FloatingSelect, tokens de `lib/ui.ts`. Copy en español CON acentos. No window.confirm/alert.
- Verificación antes de cada commit: `cd apps/api && npx tsc --noEmit`, `cd apps/web && npx tsc --noEmit`. Tras `packages/types`: `cd packages/types && pnpm build`. Migración: `cd apps/api && npx prisma migrate dev` (solo dev). Migraciones aditivas; nunca destructivas en prod.
- El agente NO bootea el server; el gate `.ps1` lo corre el owner. Branches: commitear directo en master.

---

### Task 1: Schema (enum + LiquidacionItem + campos seguro) + @pos/types

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `packages/types/src/entities/index.ts` (o donde vivan los enums compartidos) — agregar `EstadoLiquidacion`

**Interfaces:**
- Produces: enum Prisma `EstadoLiquidacion`; modelo `LiquidacionItem`; `Paciente.tieneSeguro/aseguradoraId/categoriaSeguroId/codigoSeguro`; `Cita.usaSeguro/categoriaSeguroId/montoPaciente/montoAseguradora/codigoSeguro`; enum TS `EstadoLiquidacion` en @pos/types.

- [ ] **Step 1: Agregar el enum y el modelo a schema.prisma**

Después del bloque de modelos de F1 (aseguradoras), agregar:

```prisma
enum EstadoLiquidacion {
  PENDIENTE
  FACTURADO
  PAGADO
  RECHAZADO
}

// Cuenta por cobrar a la aseguradora. 1 por cita con seguro. Todo snapshot:
// si el paciente cambia de seguro despues, esta fila no se toca.
model LiquidacionItem {
  id                Int      @id @default(autoincrement())
  consultorioId     Int
  consultorio       Consultorio @relation(fields: [consultorioId], references: [id])
  citaId            Int      @unique
  cita              Cita     @relation(fields: [citaId], references: [id])
  aseguradoraId     Int
  aseguradora       Aseguradora @relation(fields: [aseguradoraId], references: [id])
  categoriaSeguroId Int
  categoriaSeguro   CategoriaSeguro @relation(fields: [categoriaSeguroId], references: [id])
  pacienteId        Int
  paciente          Paciente @relation(fields: [pacienteId], references: [id])
  servicioId        Int
  servicio          Servicio @relation(fields: [servicioId], references: [id])
  fecha             DateTime
  montoAseguradora  Decimal  @db.Decimal(10, 2)
  codigoSeguro      String?
  estado            EstadoLiquidacion @default(PENDIENTE)
  facturadoAt       DateTime?
  pagadoAt          DateTime?
  rechazoMotivo     String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([consultorioId, aseguradoraId, estado])
  @@index([consultorioId, fecha])
  @@map("liquidacion_items")
}
```

- [ ] **Step 2: Agregar back-relations a los modelos referenciados**

`liquidaciones LiquidacionItem[]` en: `Consultorio`, `Aseguradora`, `CategoriaSeguro`, `Paciente`, `Servicio`. En `Cita`, relación 1:1 opcional: `liquidacion LiquidacionItem?`.

- [ ] **Step 3: Agregar campos de seguro a Paciente**

En `model Paciente`, después de `requierePrepago`:

```prisma
  // Seguro del paciente (opcional). El paciente puede tener seguro y aun asi
  // atenderse particular: la decision real se toma por cita.
  tieneSeguro       Boolean @default(false)
  aseguradoraId     Int?
  aseguradora       Aseguradora?     @relation(fields: [aseguradoraId], references: [id])
  categoriaSeguroId Int?
  categoriaSeguro   CategoriaSeguro? @relation(fields: [categoriaSeguroId], references: [id])
  codigoSeguro      String?
```

Agregar las back-relations correspondientes en `Aseguradora` (`pacientes Paciente[]`) y `CategoriaSeguro` (`pacientes Paciente[]`).

- [ ] **Step 4: Agregar snapshot de cobertura a Cita**

En `model Cita`, después de `portalToken`:

```prisma
  // Snapshot inmutable de la cobertura usada en ESTA atencion (no cambia si el
  // paciente cambia de seguro despues). usaSeguro=false => atencion particular.
  usaSeguro         Boolean @default(false)
  categoriaSeguroId Int?
  categoriaSeguro   CategoriaSeguro? @relation(fields: [categoriaSeguroId], references: [id])
  montoPaciente     Decimal? @db.Decimal(10, 2)
  montoAseguradora  Decimal? @db.Decimal(10, 2)
  codigoSeguro      String?
  liquidacion       LiquidacionItem?
```

Back-relation en `CategoriaSeguro`: `citas Cita[]`.

- [ ] **Step 5: Crear la migración**

Run: `cd apps/api && npx prisma migrate dev --name aseguradoras_f2`
Expected: crea la migración con CREATE TYPE (enum), CREATE TABLE liquidacion_items, ALTER TABLE pacientes/citas ADD COLUMN (todos nullable o con default → aditivo). Sin DROP. Client regenerado.

- [ ] **Step 6: Agregar el enum a @pos/types**

En `packages/types/src/entities/index.ts` (junto a los otros enums tipo `EstadoCobro`), agregar:

```typescript
export enum EstadoLiquidacion {
  PENDIENTE = 'PENDIENTE',
  FACTURADO = 'FACTURADO',
  PAGADO = 'PAGADO',
  RECHAZADO = 'RECHAZADO',
}
```

Si hay un helper de label/color por estado (patrón de EstadoCobro), agregar el equivalente. Si no, omitir.

- [ ] **Step 7: Build de types + tsc**

Run: `cd packages/types && pnpm build` luego `cd apps/api && npx tsc --noEmit`
Expected: ambos PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations packages/types/src/entities/index.ts
git commit -m "feat(aseguradoras): schema F2 (LiquidacionItem + seguro paciente/cita) + enum"
```

---

### Task 2: Paciente — campos de seguro (DTO + service)

**Files:**
- Modify: `apps/api/src/modules/pacientes/pacientes.service.ts` (DTOs `CreatePacienteDto`/`UpdatePacienteDto`, create/update, select de la ficha)

**Interfaces:**
- Consumes: modelos de Task 1.
- Produces: `POST/PUT /pacientes` aceptan `tieneSeguro/aseguradoraId/categoriaSeguroId/codigoSeguro`; el detalle del paciente los devuelve (con nombres de aseguradora/categoría para la UI).

- [ ] **Step 1: Agregar campos al DTO**

En `CreatePacienteDto` (pacientes.service.ts) agregar (importar `IsBoolean`, `IsInt`, `ValidateIf` si faltan):

```typescript
  @IsBoolean() @IsOptional()
  tieneSeguro?: boolean

  // Si tiene seguro, aseguradora y categoria son obligatorias
  @ValidateIf((o) => o.tieneSeguro === true)
  @IsInt()
  aseguradoraId?: number

  @ValidateIf((o) => o.tieneSeguro === true)
  @IsInt()
  categoriaSeguroId?: number

  @IsString() @IsOptional()
  codigoSeguro?: string
```

`UpdatePacienteDto` extiende `PartialType(CreatePacienteDto)` (ya lo hace) → hereda los campos. Mantener `requierePrepago` como está.

- [ ] **Step 2: Validar pertenencia al consultorio + persistir**

En `create` y `update`: si `tieneSeguro`, verificar que `aseguradoraId` y `categoriaSeguroId` pertenezcan al consultorio y que la categoría sea de esa aseguradora (`findFirst({ where: { id: categoriaSeguroId, consultorioId, aseguradoraId } })`, 400/404 si no). Si `tieneSeguro` es false, limpiar los 3 campos (`aseguradoraId: null, categoriaSeguroId: null, codigoSeguro: null`). Persistir los campos en el `data` del create/update (el create ya hace su propio `data`; agregarlos ahí).

- [ ] **Step 3: Exponer el seguro en el detalle del paciente**

En el select/where del findOne (ficha) y donde el front lo necesite, incluir `tieneSeguro, codigoSeguro, aseguradora: { select: { id, nombre } }, categoriaSeguro: { select: { id, nombre, aseguradoraId } }`. (En la LISTA paginada NO agregar el include para no bloatear; solo en el detalle/findOne.)

- [ ] **Step 4: tsc + commit**

Run: `cd apps/api && npx tsc --noEmit` (PASS)

```bash
git add apps/api/src/modules/pacientes/pacientes.service.ts
git commit -m "feat(aseguradoras): seguro del paciente en DTO + service (F2)"
```

---

### Task 3: Cita — cálculo de cobertura en la creación (core)

**Files:**
- Modify: `apps/api/src/modules/citas/citas.service.ts` (`CreateCitaDto` + el método de creación ~L120-209)

**Interfaces:**
- Consumes: Task 1 (modelos), Task 2 (paciente con seguro).
- Produces: al crear cita con `usaSeguro`, `Cobro.total = montoPaciente`, snapshot en la cita, y `LiquidacionItem` (si `montoAseguradora > 0`). Todo en una `$transaction`.

- [ ] **Step 1: Extender CreateCitaDto**

En `CreateCitaDto` agregar:

```typescript
  // Cobertura: usar el seguro del paciente en esta cita. La aseguradora/categoria
  // se toman del paciente (no del body). codigoSeguro override opcional.
  @IsBoolean() @IsOptional()
  usaSeguro?: boolean

  @IsString() @IsOptional()
  codigoSeguro?: string
```

- [ ] **Step 2: Implementar el cálculo + transacción**

En el método de creación, reemplazar el bloque actual (lee servicio, calcula `precio = override ?? precioBase`, crea cita y luego `cobro.create`) por una versión que: (a) cargue el consultorio (`trabajaConAseguradoras`) y el paciente (`tieneSeguro, aseguradoraId, categoriaSeguroId, codigoSeguro`); (b) decida cobertura; (c) cree cita + cobro + liquidación en una transacción. Lógica de precio:

```typescript
// precio particular base (override del doctor o precioBase del servicio)
const override = await this.prisma.doctorServicioPrecio.findUnique({
  where: { doctorId_servicioId: { doctorId: dto.doctorId, servicioId: dto.servicioId } },
  select: { precio: true },
})
const precioParticular = override?.precio ?? servicio.precioBase

// ¿corresponde usar seguro? requiere flag on + paciente con seguro + tarifa
let cobertura: {
  categoriaSeguroId: number; aseguradoraId: number;
  montoPaciente: Prisma.Decimal; montoAseguradora: Prisma.Decimal; codigoSeguro: string | null
} | null = null

if (dto.usaSeguro && consultorio.trabajaConAseguradoras && paciente.tieneSeguro && paciente.categoriaSeguroId && paciente.aseguradoraId) {
  const tarifa = await this.prisma.tarifaCobertura.findFirst({
    where: { consultorioId, categoriaSeguroId: paciente.categoriaSeguroId, servicioId: dto.servicioId, activa: true },
    select: { montoPaciente: true, montoAseguradora: true },
  })
  if (tarifa) {
    cobertura = {
      categoriaSeguroId: paciente.categoriaSeguroId,
      aseguradoraId: paciente.aseguradoraId,
      montoPaciente: tarifa.montoPaciente,
      montoAseguradora: tarifa.montoAseguradora,
      codigoSeguro: dto.codigoSeguro ?? paciente.codigoSeguro ?? null,
    }
  }
  // sin tarifa => fallback particular (cobertura queda null)
}

const totalCobro = cobertura ? cobertura.montoPaciente : precioParticular
```

Crear todo en una transacción, snapshotando la cita y creando la liquidación solo si `montoAseguradora > 0`:

```typescript
const cita = await this.prisma.$transaction(async (tx) => {
  const c = await tx.cita.create({
    data: {
      consultorioId, pacienteId: dto.pacienteId, doctorId: dto.doctorId, servicioId: dto.servicioId,
      fechaHora, duracionMin: servicio.duracionMin, notasSecretaria: dto.notasSecretaria,
      createdById: usuarioId, origen,
      estado: origen === OrigenCita.PORTAL ? EstadoCita.SOLICITADA : EstadoCita.PENDIENTE,
      ...(cobertura ? {
        usaSeguro: true,
        categoriaSeguroId: cobertura.categoriaSeguroId,
        montoPaciente: cobertura.montoPaciente,
        montoAseguradora: cobertura.montoAseguradora,
        codigoSeguro: cobertura.codigoSeguro,
      } : {}),
    },
    include: { /* lo que ya incluia para notificaciones/email */ },
  })
  await tx.cobro.create({ data: { citaId: c.id, consultorioId, total: totalCobro, saldoPendiente: totalCobro } })
  if (cobertura && cobertura.montoAseguradora.gt(0)) {
    await tx.liquidacionItem.create({
      data: {
        consultorioId, citaId: c.id, aseguradoraId: cobertura.aseguradoraId,
        categoriaSeguroId: cobertura.categoriaSeguroId, pacienteId: dto.pacienteId, servicioId: dto.servicioId,
        fecha: fechaHora, montoAseguradora: cobertura.montoAseguradora, codigoSeguro: cobertura.codigoSeguro,
      },
    })
  }
  return c
})
```

Mantener las notificaciones fire-and-forget y el email de confirmación POSTERIORES a la transacción, igual que hoy. NO cambiar el comportamiento sin seguro (cuando `cobertura` es null el flujo es idéntico al actual).

- [ ] **Step 3: tsc + commit**

Run: `cd apps/api && npx tsc --noEmit` (PASS)

```bash
git add apps/api/src/modules/citas/citas.service.ts
git commit -m "feat(aseguradoras): cobertura en creacion de cita (cobro=montoPaciente + liquidacion) (F2)"
```

---

### Task 4: Cita — reprogramación (cambio de servicio) + cancelación

**Files:**
- Modify: `apps/api/src/modules/citas/citas.service.ts` (reprogramar ~L560-630; transición a CANCELADA en cambiarEstado; `cancelarPorToken` ~L752)

**Interfaces:**
- Consumes: Task 3.
- Produces: al cambiar de servicio en una cita con seguro, se recalculan montos + `Cobro.total` + `LiquidacionItem`; al cancelar, la liquidación PENDIENTE se elimina.

- [ ] **Step 1: Recalcular cobertura al cambiar de servicio en reprogramar**

En la reprogramación, cuando `servicioNuevo` y `cita.usaSeguro`: en vez de usar `precioServicioNuevo` (particular), buscar la tarifa de `cita.categoriaSeguroId` + `servicioNuevo.id`. Si hay tarifa: `Cobro.total = tarifa.montoPaciente` (recalcular saldo con lo ya pagado, misma guarda actual de "pagos superan el nuevo precio"); actualizar/crear el `LiquidacionItem` (`montoAseguradora`, `servicioId`, `fecha`) o eliminarlo si `montoAseguradora=0`; actualizar el snapshot de la cita (`montoPaciente`, `montoAseguradora`, `servicioId`). Si NO hay tarifa para el nuevo servicio: revertir a particular (snapshot `usaSeguro=false`, limpiar montos, eliminar el `LiquidacionItem`, `Cobro.total = precio particular del nuevo servicio`). Todo dentro de la `$transaction` que ya existe en reprogramar.

- [ ] **Step 2: Eliminar la liquidación al cancelar**

En la transición a `EstadoCita.CANCELADA` (vía `cambiarEstado`/máquina de estados) y en `cancelarPorToken`: si la cita tiene `LiquidacionItem` en estado `PENDIENTE`, eliminarlo dentro de la misma transacción (no se factura una atención que no ocurrió). Si estuviera FACTURADO/PAGADO (no debería para una cancelación normal), NO borrarlo: dejarlo y registrar en log (caso de borde). Reusar el patrón de log existente.

- [ ] **Step 3: tsc + commit**

Run: `cd apps/api && npx tsc --noEmit` (PASS)

```bash
git add apps/api/src/modules/citas/citas.service.ts
git commit -m "feat(aseguradoras): recalculo de cobertura en reprogramar + baja de liquidacion al cancelar (F2)"
```

---

### Task 5: Frontend — sección "Seguro" en PacienteModal

**Files:**
- Modify: `apps/web/src/features/pacientes/PacienteModal.tsx`

**Interfaces:**
- Consumes: `GET /aseguradoras/activas`, `GET /categorias-seguro?aseguradoraId=&soloActivas=true`; el detalle del paciente con seguro (Task 2); `useAuthStore().user.trabajaConAseguradoras`.

- [ ] **Step 1: UI skills + estructura**

Antes del JSX, aplicar impeccable + ui-ux-pro-max + frontend-design (eficiente; reusar patrones). La sección "Seguro" se muestra SOLO si `trabajaConAseguradoras`. Toggle `tieneSeguro` (switch-container, mismo patrón que ya está en el proyecto). Cuando ON: FloatingSelect Aseguradora (de `/aseguradoras/activas`), FloatingSelect Categoría (de `/categorias-seguro?aseguradoraId=${aseguradoraId}&soloActivas=true`, deshabilitado hasta elegir aseguradora; al cambiar aseguradora, resetear categoría), FloatingInput Código (opcional). Agregar `tieneSeguro/aseguradoraId/categoriaSeguroId/codigoSeguro` al `form` state y al payload (recordar: opcionales vacíos van como `undefined`; si `tieneSeguro` es false, mandar los 3 como undefined). Hidratar desde `paciente` en edición.

- [ ] **Step 2: tsc + commit**

Run: `cd apps/web && npx tsc --noEmit` (PASS)

```bash
git add apps/web/src/features/pacientes/PacienteModal.tsx
git commit -m "feat(aseguradoras): seccion Seguro en PacienteModal (F2)"
```

---

### Task 6: Frontend — bloque "Cobertura" en NuevaCitaModal

**Files:**
- Modify: `apps/web/src/features/agenda/NuevaCitaModal.tsx`

**Interfaces:**
- Consumes: el seguro del paciente seleccionado (Task 2/5), `GET /tarifas-cobertura?categoriaSeguroId=` para previsualizar montos; `useAuthStore().user.trabajaConAseguradoras`.

- [ ] **Step 1: Traer el seguro del paciente seleccionado**

Cuando hay `pacienteSeleccionado` y `trabajaConAseguradoras`, query `['paciente-seguro', id] -> GET /pacientes/${id}` (o el detalle existente) para obtener `tieneSeguro, aseguradora{nombre}, categoriaSeguro{id,nombre}, codigoSeguro`. (La búsqueda de pacientes devuelve campos limitados; este fetch puntual evita bloatear la lista.)

- [ ] **Step 2: Bloque Cobertura + preview de montos**

Mostrar el bloque SOLO si `trabajaConAseguradoras && pacienteSeguro?.tieneSeguro`. Checkbox/switch "Usar seguro" (default ON cuando el paciente tiene seguro). Cuando ON: mostrar aseguradora + categoría (read-only, del paciente) + FloatingInput Código (prefill `codigoSeguro`, editable). Preview: query `['tarifa-preview', categoriaSeguroId, servicioId] -> GET /tarifas-cobertura?categoriaSeguroId=` y buscar la fila del `servicioId` elegido; mostrar `montoPaciente`/`montoAseguradora` (tabular-nums, formatMoneda). Si no hay tarifa para ese servicio, aviso "Sin tarifa para este servicio: se atenderá como particular". Enviar en el payload de `crearCita`: `usaSeguro` (el valor del switch) y `codigoSeguro` (si se editó). El backend hace el cálculo real; el preview es informativo.

- [ ] **Step 3: tsc + commit**

Run: `cd apps/web && npx tsc --noEmit` (PASS)

```bash
git add apps/web/src/features/agenda/NuevaCitaModal.tsx
git commit -m "feat(aseguradoras): bloque Cobertura en NuevaCitaModal (F2)"
```

---

### Task 7: Gate `gate-aseguradoras-f2.ps1`

**Files:**
- Create: `scripts/gate-aseguradoras-f2.ps1`

**Interfaces:**
- Consumes: API en `:3000` (la corre el owner). Tenant propio via register.

- [ ] **Step 1: Escribir el gate**

Mirror de `scripts/gate-tipos-gasto-cuenta.ps1`. Setup: register+login, `PUT /consultorio { trabajaConAseguradoras=$true }`, crear servicio, aseguradora, categoría, tarifa (montoPaciente=0, montoAseguradora=168), y un paciente con `tieneSeguro=$true` + esa aseguradora/categoría. Casos:
1. Crear cita con `usaSeguro=$true` → el cobro de la cita tiene `total=0` (montoPaciente). (GET la cita o su cobro.)
2. Esa cita generó un `LiquidacionItem` con `montoAseguradora=168` y estado PENDIENTE. (Endpoint de liquidaciones aún no existe en F2 → verificar vía un GET de la cita que exponga `montoAseguradora`/`usaSeguro`, o diferir esta aserción a F3. Si no hay endpoint para leerlo en F2, asertar sobre el snapshot de la cita: `usaSeguro=True`, `montoPaciente=0`, `montoAseguradora=168`.)
3. Crear cita con `usaSeguro=$false` para el mismo paciente → cobro `total = precio particular` del servicio, sin snapshot de seguro (`usaSeguro=False`).
4. Paciente sin seguro + `usaSeguro=$true` → fallback particular (cobro = precio normal, `usaSeguro=False`).
5. Servicio sin tarifa en esa categoría + `usaSeguro=$true` → fallback particular.
6. `POST /pacientes { tieneSeguro=$true }` sin aseguradoraId → 400 (ValidateIf).
7. Reprogramar una cita con seguro a un servicio con otra tarifa → el cobro y el snapshot se recalculan.

Notas PS 5.1: `@()` antes de `.Count`; `ConvertTo-Json -Depth 5`. Para leer el snapshot de la cita, usar el endpoint de detalle de cita existente (revisar `citas.controller.ts` por el GET; si la cita no expone los campos nuevos, agregar `usaSeguro/montoPaciente/montoAseguradora` al select del GET de cita como parte de esta task).

- [ ] **Step 2: (Owner) correr el gate con API en :3000**

Run: `pwsh scripts/gate-aseguradoras-f2.ps1` → todas las líneas OK / valores esperados.

- [ ] **Step 3: Commit**

```bash
git add scripts/gate-aseguradoras-f2.ps1
git commit -m "test(aseguradoras): gate F2 (cobertura en cita + liquidacion) (F2)"
```

---

## Self-review (cobertura del spec en F2)

- LiquidacionItem + enum + campos seguro (Paciente) + snapshot (Cita): Task 1. OK.
- Seguro del paciente (DTO/service/UI): Tasks 2, 5. OK.
- Cobertura por cita + cobro=montoPaciente + LiquidacionItem (transaccional): Task 3. OK.
- Fallback particular sin tarifa: Task 3 (cobertura null). OK.
- Reprogramación + cancelación: Task 4. OK.
- UI cita: Task 6. OK.
- Gate: Task 7. OK.
- Liquidaciones (módulo/estados/export) y reportes: NO en F2 (son F3/F4).

## Nota de dependencia para F3/F4

F3 (liquidaciones) y F4 (reportes) se planifican con su propio doc DESPUÉS de que F2 aterrice, para anclar las tareas a los nombres/firmas reales de `LiquidacionItem` y a cómo quedó el snapshot de la cita. El spec base es `docs/superpowers/specs/2026-06-19-aseguradoras-convenios-design.md`.
