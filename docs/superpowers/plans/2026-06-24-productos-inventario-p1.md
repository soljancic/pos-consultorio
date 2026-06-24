# Productos e Inventario — P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar venta de productos fisicos (catalogo + flag de consultorio + venta mixta en el cobro de la cita + venta directa sin cita), descontando stock al confirmar la venta, reusando caja y deuda existentes.

**Architecture:** Tablas nuevas `Producto` y `DetalleCobro` (linea servicio-o-producto, XOR). `Cobro` se desacopla de `Cita` (`citaId` nullable, sigue `@unique`; gana `pacienteId` nullable). El total del cobro pasa a ser `SUM(detalles.subtotal)`. Modulo detras del flag `Consultorio.vendeProductos` (mismo patron que `trabajaConAseguradoras`): apagado, invisible. El stock se descuenta cuando la cita sale de ATENDIDA -> COBRADO/CON_DEUDA (o al crear la venta directa); se restituye al anular/reabrir. Caja y deuda NO cambian de logica: los productos entran al `total` del cobro y el saldo impago rola a `Paciente.deudaTotal` como hoy.

**Tech Stack:** NestJS + Prisma + PostgreSQL (apps/api); React 19 + Vite + TS + Tailwind + TanStack Query v5 + Zustand + React Router v7 (apps/web); `@pos/types` (TS crudo via workspace).

## Global Constraints

Copiar verbatim del spec y de PLAN.md §8b. Aplican a TODAS las tareas:

- `consultorioId` SIEMPRE del JWT (`@CurrentUser()`), NUNCA del body/params. Todo `findFirst`/`findMany`/`update`/`delete` filtra por `consultorioId` (incluida `DetalleCobro`, que lleva su propia columna).
- Todo DTO con decoradores class-validator (ValidationPipe global con whitelist + forbidNonWhitelisted -> 400 si falta). El frontend envia `undefined` (no `''`) en opcionales vacios.
- Dinero en `Decimal` de Prisma; `Number()` solo para mostrar en UI. `stockActual` y `cantidad` son `Int`.
- Borrado soft (`activo:false` / `deletedAt`). El campo booleano del producto se llama **`activo`** (NO `activa`) para alinear backend/frontend (no repetir el bug de aseguradoras).
- Operaciones multi-tabla en `prisma.$transaction`. Acciones criticas (descuento de stock, restitucion, venta directa) registran en tabla `logs`.
- Roles con `@Roles(Rol.ADMIN)` de `@pos/types` (NUNCA string). ABM de productos = ADMIN. La venta (agregar lineas en el cobro / venta directa) la hace SECRETARIA/CAJA (cualquier rol operativo, igual que registrar un pago hoy).
- Producto vendible = `habilitadoVenta === true && activo === true`. Es el unico que aparece en el selector del modal de cobro y de la venta directa. `habilitadoVenta === false` = insumo de control interno (catalogo + compras P2 + ajustes P3), nunca se vende.
- Stock negativo permitido: si `controlaStock` y `cantidad > stockActual`, se ALERTA pero NO se bloquea (regla del proyecto: las cosas alertan, no bloquean).
- Fechas: rangos UTC con strings `Z` en services; NUNCA `setHours()` en backend. Frontend formatea con `formatFecha`/`formatHora` de `lib/utils.ts`.
- UI (decision owner 2026-06-13): TODA pantalla nueva/modificada pasa por los skills **impeccable + ui-ux-pro-max + frontend-design ANTES de escribir el JSX**. Reusar tokens de `lib/ui.ts` (`cardUI`, `inputUI`, `btnPrimaryUI`, `btnOutlineUI`, `errorUI`), `FloatingInput`/`FloatingSelect`, dark mode. Checklist minimo: touch >=44px, focus-visible ring, color + forma (no solo color), `tabular-nums` en montos y stock, transiciones 150-300ms. Copy visible en espanol CON acentos; identificadores de codigo SIN acentos.
- NO deployar a Railway por iniciativa propia. NO operaciones destructivas contra la BD de produccion. Migraciones destructivas solo en dev/local; las de P1 son aditivas salvo el aflojado de `NOT NULL` en `Cobro.citaId` (no destructivo).
- Verificacion antes de cada commit: `cd apps/api && npx tsc --noEmit` y `cd apps/web && npx tsc --noEmit`. Tras tocar tipos compartidos: `cd packages/types && pnpm build`.

## Decision de diseno cerrada con el owner (2026-06-24)

**Disparo de stock en venta CON cita = al confirmar el cobro.** Los productos se agregan/editan libremente mientras la cita esta en **ATENDIDA**. El stock se descuenta una sola vez, cuando la cita **sale de ATENDIDA -> COBRADO o CON_DEUDA** (primer pago que la mueve, o transicion explicita). Tras salir de ATENDIDA la edicion de lineas queda bloqueada; la correccion es via anular (restituye stock). En **venta directa** (sin cita) el cobro nace ya confirmado: el stock se descuenta al crearlo. Maquina de estados de referencia (`packages/types/src/enums/index.ts`): `ATENDIDA -> [COBRADO, CON_DEUDA]`, `CON_DEUDA -> [COBRADO]`, `COBRADO -> []`.

## File Structure

Backend nuevo:
- `apps/api/src/modules/productos/productos.service.ts` — DTOs + ProductosService (CRUD + paginado + archivar).
- `apps/api/src/modules/productos/productos.controller.ts` — endpoints REST (ADMIN).
- `apps/api/src/modules/productos/productos.module.ts` — modulo Nest.
- `apps/api/src/modules/cobros/stock.helper.ts` — `descontarStockDeCobro` / `restituirStockDeCobro` (usables dentro de un `Prisma.TransactionClient`, compartidos por cobros y citas).

Backend modificado:
- `apps/api/prisma/schema.prisma` — `Producto`, `DetalleCobro`, `Consultorio.vendeProductos`, `Cobro.citaId` nullable + `Cobro.pacienteId`, back-relations.
- `apps/api/prisma/migrations/<ts>_productos_p1/migration.sql` — schema additivo (Task 1).
- `apps/api/prisma/migrations/<ts>_detalle_cobro_p1/migration.sql` — DetalleCobro + Cobro changes + CHECK + backfill (Task 2).
- `apps/api/src/auth/auth.service.ts` — propaga `vendeProductos` en `user` (login + loginGoogle).
- `apps/api/src/modules/consultorios/consultorios.service.ts` — DTO + `CONSULTORIO_SELECT`.
- `apps/api/src/modules/cobros/cobros.service.ts` — `setProductos`, `crearVentaDirecta`, `findOne`, registrarPago/anularPago null-safe, deudores incluye venta directa, descuento/restitucion de stock.
- `apps/api/src/modules/cobros/cobros.controller.ts` — endpoints `PUT /cobros/:id/lineas`, `POST /cobros/venta-directa`, `GET /cobros/:id`.
- `apps/api/src/modules/citas/citas.service.ts` — linea de servicio al crear el cobro; descuento de stock al salir de ATENDIDA; restitucion al reabrir.
- `apps/api/src/app.module.ts` — registra `ProductosModule`.

Shared:
- `packages/types/src/api/index.ts` — `AuthUser.vendeProductos` + tipos de linea/venta directa.

Frontend nuevo:
- `apps/web/src/features/inventario/InventarioPage.tsx` — shell de la seccion (sub-tabs).
- `apps/web/src/features/inventario/ProductosTab.tsx` — lista paginada de productos.
- `apps/web/src/features/inventario/ProductoModal.tsx` — alta/edicion de producto.
- `apps/web/src/features/inventario/VentaDirectaModal.tsx` — venta de mostrador (reusa la grilla de lineas).
- `apps/web/src/features/inventario/LineasProductoEditor.tsx` — sub-componente reutilizable (buscador + grilla de lineas + total en vivo + alerta de stock), usado por el cobro mixto y por la venta directa.

Frontend modificado:
- `apps/web/src/App.tsx` — ruta `/inventario` (AdminRoute).
- `apps/web/src/components/shared/AppShell.tsx` — item de nav `Inventario` (admin + flag).
- `apps/web/src/features/configuracion/ConfiguracionPage.tsx` — toggle "Vende productos".
- `apps/web/src/features/agenda/CobroModal.tsx` — bloque de productos (venta mixta) detras del flag.
- `apps/web/src/features/agenda/AgendaPage.tsx` — boton "Venta directa".

Gate:
- `scripts/gate-productos.ps1` — gate de integracion backend.

---

### Task 1: Schema — Producto + Consultorio.vendeProductos (migracion aditiva)

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_productos_p1/migration.sql` (lo genera prisma)

**Interfaces:**
- Produces: modelo `Producto` (campos: `id, consultorioId, categoria?, nombre, codigoBarras?, precioVenta Decimal(10,2), precioCosto Decimal(10,2), stockActual Int, controlaStock Boolean, habilitadoVenta Boolean, activo Boolean, createdAt, updatedAt, deletedAt?`) y `Consultorio.vendeProductos Boolean @default(false)`. Relacion `Producto.detalleCobros DetalleCobro[]` se agrega en Task 2 (cuando exista `DetalleCobro`).

- [ ] **Step 1: Agregar el flag a Consultorio**

En `schema.prisma`, dentro de `model Consultorio`, junto a `trabajaConAseguradoras` (linea ~94):

```prisma
  // Modulo Productos e Inventario (P1): habilita catalogo de productos, venta
  // mixta en el cobro y venta directa. Default off: la mayoria no vende nada.
  vendeProductos Boolean @default(false)
```

Y en las back-relations de `Consultorio` (junto a `liquidaciones LiquidacionItem[]`):

```prisma
  productos        Producto[]
```

- [ ] **Step 2: Agregar el modelo Producto**

Al final de `schema.prisma` (despues del bloque ASEGURADORAS), agregar la seccion:

```prisma
// ─── PRODUCTOS E INVENTARIO (P1) ─────────────────────────────────────────────

model Producto {
  id              Int      @id @default(autoincrement())
  consultorioId   Int
  consultorio     Consultorio @relation(fields: [consultorioId], references: [id])
  categoria       String?  // texto libre en P1
  nombre          String
  codigoBarras    String?
  precioVenta     Decimal  @db.Decimal(10, 2)
  precioCosto     Decimal  @db.Decimal(10, 2)
  stockActual     Int      @default(0)
  controlaStock   Boolean  @default(true)
  // habilitadoVenta=true => vendible (aparece en el modal de cobro / venta
  // directa). false => insumo de control interno (solo catalogo, compras P2,
  // ajustes P3).
  habilitadoVenta Boolean  @default(true)
  activo          Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?

  @@unique([consultorioId, codigoBarras])
  @@index([consultorioId])
  @@index([consultorioId, nombre])
  @@map("productos")
}
```

(La relacion `detalleCobros DetalleCobro[]` se agrega en Task 2.)

- [ ] **Step 3: Generar y aplicar la migracion (dev/local)**

Run: `cd apps/api && npx prisma migrate dev --name productos_p1`
Expected: crea `migrations/<ts>_productos_p1/migration.sql` con `ALTER TABLE "consultorios" ADD COLUMN "vendeProductos" ...` y `CREATE TABLE "productos" ...`; aplica sin error; regenera el client.

- [ ] **Step 4: Verificar el client y los tipos**

Run: `cd apps/api && npx prisma generate && npx tsc --noEmit`
Expected: sin errores. `prisma.producto` existe en el client.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(productos): modelo Producto + flag vendeProductos (P1 schema base)"
```

---

### Task 2: Schema — DetalleCobro + Cobro desacoplado + CHECK + backfill

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_detalle_cobro_p1/migration.sql` (generada por prisma, luego EDITADA a mano para CHECK + backfill)

**Interfaces:**
- Consumes: `Producto` (Task 1).
- Produces:
  - `DetalleCobro` (campos: `id, consultorioId, cobroId, servicioId?, productoId?, descripcion, cantidad Int @default(1), precioVenta Decimal(10,2), precioCosto Decimal(10,2) @default(0), subtotal Decimal(10,2), createdAt`).
  - `Cobro.citaId Int?` (nullable, sigue `@unique`), `Cobro.pacienteId Int?` + relation, `Cobro.detalles DetalleCobro[]`.
  - Back-relations: `Paciente.cobros Cobro[]`, `Servicio.detalleCobros DetalleCobro[]`, `Producto.detalleCobros DetalleCobro[]`.

- [ ] **Step 1: Modificar Cobro (citaId nullable + pacienteId + detalles)**

En `model Cobro`, reemplazar las lineas de `citaId`/`cita` y agregar `pacienteId`/`paciente`/`detalles`:

```prisma
model Cobro {
  id             Int      @id @default(autoincrement())
  // Desacople P1: nullable para venta directa (sin cita). Sigue @unique:
  // Postgres permite varios NULL (varias ventas directas) y mantiene 1 cobro
  // por cita.
  citaId         Int?     @unique
  cita           Cita?       @relation(fields: [citaId], references: [id])
  // Venta directa cuelga la deuda aca; en el cobro de una cita se copia del
  // paciente de la cita.
  pacienteId     Int?
  paciente       Paciente?   @relation(fields: [pacienteId], references: [id])
  consultorioId  Int
  consultorio    Consultorio @relation(fields: [consultorioId], references: [id])
  total          Decimal     @db.Decimal(10, 2)
  saldoPendiente Decimal     @db.Decimal(10, 2)
  estado         EstadoCobro @default(PENDIENTE)
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  pagos    Pago[]
  detalles DetalleCobro[]

  @@index([consultorioId])
  @@index([consultorioId, estado])
  @@index([consultorioId, pacienteId])
  @@map("cobros")
}
```

- [ ] **Step 2: Agregar el modelo DetalleCobro**

En la seccion PRODUCTOS de `schema.prisma`, despues de `model Producto`:

```prisma
// Linea de detalle de un cobro: referencia un servicio O un producto (XOR; el
// CHECK vive en la migracion). precioVenta/precioCosto son snapshot al vender
// (historico para utilidad en P3). descripcion congela el nombre.
model DetalleCobro {
  id            Int      @id @default(autoincrement())
  consultorioId Int
  consultorio   Consultorio @relation(fields: [consultorioId], references: [id])
  cobroId       Int
  cobro         Cobro    @relation(fields: [cobroId], references: [id])
  servicioId    Int?
  servicio      Servicio? @relation(fields: [servicioId], references: [id])
  productoId    Int?
  producto      Producto? @relation(fields: [productoId], references: [id])
  descripcion   String   // snapshot del nombre (servicio o producto) al vender
  cantidad      Int      @default(1)
  precioVenta   Decimal  @db.Decimal(10, 2) // snapshot
  precioCosto   Decimal  @db.Decimal(10, 2) @default(0) // snapshot; 0 en servicios
  subtotal      Decimal  @db.Decimal(10, 2) // cantidad * precioVenta
  createdAt     DateTime @default(now())

  @@index([consultorioId])
  @@index([cobroId])
  @@index([consultorioId, productoId])
  @@map("detalle_cobros")
}
```

- [ ] **Step 3: Agregar back-relations**

- En `model Paciente`, junto a `liquidaciones LiquidacionItem[]`:
  ```prisma
  cobros Cobro[]
  ```
- En `model Servicio`, junto a `liquidaciones LiquidacionItem[]`:
  ```prisma
  detalleCobros DetalleCobro[]
  ```
- En `model Producto` (de Task 1), agregar antes de los `@@`:
  ```prisma
  detalleCobros DetalleCobro[]
  ```
- En `model Consultorio`, junto a `productos Producto[]`:
  ```prisma
  detalleCobros DetalleCobro[]
  ```

- [ ] **Step 4: Generar la migracion SIN aplicar (para editarla)**

Run: `cd apps/api && npx prisma migrate dev --name detalle_cobro_p1 --create-only`
Expected: crea `migrations/<ts>_detalle_cobro_p1/migration.sql` con el `ALTER TABLE "cobros"` (drop NOT NULL de citaId, add pacienteId), `CREATE TABLE "detalle_cobros"` y las FKs. NO aplica todavia.

- [ ] **Step 5: Anexar CHECK constraints + backfill al final del migration.sql**

Abrir el `migration.sql` recien creado y AGREGAR al final (Prisma no modela CHECK ni data-migration; van a mano):

```sql
-- XOR servicio/producto: exactamente uno no nulo
ALTER TABLE "detalle_cobros"
  ADD CONSTRAINT "detalle_cobros_servicio_o_producto"
  CHECK ((("servicioId" IS NOT NULL)::int + ("productoId" IS NOT NULL)::int) = 1);

-- Cantidad positiva
ALTER TABLE "detalle_cobros"
  ADD CONSTRAINT "detalle_cobros_cantidad_pos" CHECK ("cantidad" > 0);

-- Backfill: una linea de servicio por cada cobro existente, preservando el
-- total. precioVenta = subtotal = cobro.total (cantidad 1, costo 0). El nombre
-- del servicio sale de la cita asociada.
INSERT INTO "detalle_cobros"
  ("consultorioId", "cobroId", "servicioId", "descripcion", "cantidad", "precioVenta", "precioCosto", "subtotal", "createdAt")
SELECT c."consultorioId", c."id", ci."servicioId", s."nombre", 1, c."total", 0, c."total", NOW()
FROM "cobros" c
JOIN "citas" ci ON ci."id" = c."citaId"
JOIN "servicios" s ON s."id" = ci."servicioId";

-- Backfill: copiar el paciente de la cita al cobro (para deuda de venta directa
-- y consistencia; los cobros existentes siempre tienen cita).
UPDATE "cobros" c
SET "pacienteId" = ci."pacienteId"
FROM "citas" ci
WHERE ci."id" = c."citaId" AND c."pacienteId" IS NULL;
```

- [ ] **Step 6: Aplicar la migracion editada (dev/local)**

Run: `cd apps/api && npx prisma migrate dev`
Expected: aplica el `detalle_cobro_p1` pendiente (incluido el SQL agregado) sin error; regenera el client.

- [ ] **Step 7: Verificar el backfill**

Run (psql/DBeaver contra la BD local):

```sql
-- 0 cobros sin linea de servicio
SELECT count(*) FROM "cobros" c
WHERE NOT EXISTS (SELECT 1 FROM "detalle_cobros" d WHERE d."cobroId" = c."id" AND d."servicioId" IS NOT NULL);
-- SUM(detalles) == cobro.total por cobro: 0 filas desviadas
SELECT c."id", c."total", COALESCE(SUM(d."subtotal"),0) AS suma
FROM "cobros" c LEFT JOIN "detalle_cobros" d ON d."cobroId" = c."id"
GROUP BY c."id", c."total" HAVING c."total" <> COALESCE(SUM(d."subtotal"),0);
```
Expected: primera query = 0; segunda query = 0 filas.

- [ ] **Step 8: Verificar el client y los tipos**

Run: `cd apps/api && npx prisma generate && npx tsc --noEmit`
Expected: sin errores. `prisma.detalleCobro` existe; `cobro.citaId` es `number | null`.

- [ ] **Step 9: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(productos): DetalleCobro + Cobro desacoplado de Cita (citaId nullable, pacienteId) + backfill"
```

---

### Task 3: Propagacion del flag vendeProductos (types + auth + consultorio)

**Files:**
- Modify: `packages/types/src/api/index.ts`
- Modify: `apps/api/src/auth/auth.service.ts:78`, `:97-105`, `:133`, `:150-158`
- Modify: `apps/api/src/modules/consultorios/consultorios.service.ts:63-65`, `:85`

**Interfaces:**
- Consumes: `Consultorio.vendeProductos` (Task 1).
- Produces: `AuthUser.vendeProductos: boolean` en la respuesta de login/loginGoogle; `UpdateConsultorioDto.vendeProductos?` y `vendeProductos` en `CONSULTORIO_SELECT`.

- [ ] **Step 1: Agregar el campo al tipo AuthUser**

En `packages/types/src/api/index.ts`, en `interface AuthUser` (linea ~50), junto a `trabajaConAseguradoras`:

```ts
  trabajaConAseguradoras: boolean
  vendeProductos: boolean
```

- [ ] **Step 2: Buildear los tipos compartidos**

Run: `cd packages/types && pnpm build`
Expected: compila a `dist/` sin error.

- [ ] **Step 3: Propagar en auth.service (login)**

En `apps/api/src/auth/auth.service.ts`, en `login`, ampliar el select del consultorio (linea ~78):

```ts
      include: { consultorio: { select: { nombre: true, trabajaConAseguradoras: true, vendeProductos: true } } },
```

Y en el objeto `user` de la respuesta (linea ~104), junto a `trabajaConAseguradoras`:

```ts
        trabajaConAseguradoras: usuario.consultorio.trabajaConAseguradoras,
        vendeProductos: usuario.consultorio.vendeProductos,
```

- [ ] **Step 4: Propagar en auth.service (loginGoogle)**

Mismos dos cambios en `loginGoogle` (select linea ~133 y objeto `user` linea ~157):

```ts
      include: { consultorio: { select: { nombre: true, trabajaConAseguradoras: true, vendeProductos: true } } },
```
```ts
        trabajaConAseguradoras: usuario.consultorio.trabajaConAseguradoras,
        vendeProductos: usuario.consultorio.vendeProductos,
```

- [ ] **Step 5: Agregar el campo al DTO y al select del consultorio**

En `apps/api/src/modules/consultorios/consultorios.service.ts`, en `UpdateConsultorioDto` (despues de `trabajaConAseguradoras`, linea ~64):

```ts
  @IsBoolean() @IsOptional()
  vendeProductos?: boolean
```

Y en `CONSULTORIO_SELECT` (linea ~85), junto a `trabajaConAseguradoras: true`:

```ts
  trabajaConAseguradoras: true,
  vendeProductos: true,
```

- [ ] **Step 6: Verificar tipos**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add packages/types apps/api/src/auth/auth.service.ts apps/api/src/modules/consultorios/consultorios.service.ts
git commit -m "feat(productos): propagar flag vendeProductos (AuthUser + auth + consultorio)"
```

---

### Task 4: Modulo Productos (backend CRUD + paginado + archivar)

**Files:**
- Create: `apps/api/src/modules/productos/productos.service.ts`
- Create: `apps/api/src/modules/productos/productos.controller.ts`
- Create: `apps/api/src/modules/productos/productos.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `Producto` (Task 1).
- Produces (consumido por el frontend y por Task 5/6):
  - `GET /productos?todos&page&limit&search&soloVendibles` -> `{ items: Producto[]; total: number }` (ADMIN; `soloVendibles=true` -> solo `habilitadoVenta && activo`, lo usa el selector de venta).
  - `GET /productos/vendibles?search` -> `Producto[]` (rol operativo: el picker del cobro/venta directa).
  - `POST /productos` (ADMIN), `PUT /productos/:id` (ADMIN), `DELETE /productos/:id` (ADMIN) -> `{ eliminado: boolean; enUso?: boolean; producto?: Producto }`.

- [ ] **Step 1: Crear el service con DTOs**

Crear `apps/api/src/modules/productos/productos.service.ts`:

```ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import {
  IsString, IsNotEmpty, IsOptional, IsBoolean, IsInt, IsNumber, Min, MaxLength,
} from 'class-validator'
import { Type } from 'class-transformer'
import { PartialType } from '@nestjs/swagger'
import { PrismaService } from '../../prisma/prisma.service'

export class CreateProductoDto {
  @IsString() @IsNotEmpty() @MaxLength(120)
  nombre: string

  @IsString() @IsOptional() @MaxLength(60)
  categoria?: string

  @IsString() @IsOptional() @MaxLength(60)
  codigoBarras?: string

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  precioVenta: number

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  precioCosto: number

  @Type(() => Number) @IsInt()
  stockActual: number

  @IsBoolean() @IsOptional()
  controlaStock?: boolean

  @IsBoolean() @IsOptional()
  habilitadoVenta?: boolean
}

export class UpdateProductoDto extends PartialType(CreateProductoDto) {
  @IsBoolean() @IsOptional()
  activo?: boolean
}

@Injectable()
export class ProductosService {
  constructor(private prisma: PrismaService) {}

  // Lista paginada del catalogo (patron pacientes: {items,total}).
  async findAll(
    consultorioId: number,
    opts: { search?: string; incluirInactivos?: boolean; soloVendibles?: boolean; page?: number; limit?: number } = {},
  ) {
    const page = Math.max(1, opts.page ?? 1)
    const limit = Math.min(100, Math.max(1, opts.limit ?? 50))
    const where = {
      consultorioId,
      deletedAt: null,
      ...(opts.incluirInactivos ? {} : { activo: true }),
      ...(opts.soloVendibles ? { habilitadoVenta: true, activo: true } : {}),
      ...(opts.search
        ? {
            OR: [
              { nombre: { contains: opts.search, mode: 'insensitive' as const } },
              { codigoBarras: { contains: opts.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.producto.findMany({
        where,
        orderBy: { nombre: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.producto.count({ where }),
    ])
    return { items, total }
  }

  // Picker de venta: solo vendibles, sin paginar (lista acotada por search).
  vendibles(consultorioId: number, search?: string) {
    return this.prisma.producto.findMany({
      where: {
        consultorioId,
        deletedAt: null,
        activo: true,
        habilitadoVenta: true,
        ...(search
          ? {
              OR: [
                { nombre: { contains: search, mode: 'insensitive' as const } },
                { codigoBarras: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { nombre: 'asc' },
      take: 50,
    })
  }

  async create(consultorioId: number, dto: CreateProductoDto) {
    await this.validarCodigoUnico(consultorioId, dto.codigoBarras)
    return this.prisma.producto.create({
      data: {
        consultorioId,
        nombre: dto.nombre,
        categoria: dto.categoria,
        codigoBarras: dto.codigoBarras,
        precioVenta: dto.precioVenta,
        precioCosto: dto.precioCosto,
        stockActual: dto.stockActual,
        ...(dto.controlaStock !== undefined && { controlaStock: dto.controlaStock }),
        ...(dto.habilitadoVenta !== undefined && { habilitadoVenta: dto.habilitadoVenta }),
      },
    })
  }

  async update(consultorioId: number, id: number, dto: UpdateProductoDto) {
    const p = await this.prisma.producto.findFirst({ where: { id, consultorioId, deletedAt: null } })
    if (!p) throw new NotFoundException('Producto no encontrado')
    if (dto.codigoBarras !== undefined && dto.codigoBarras !== p.codigoBarras) {
      await this.validarCodigoUnico(consultorioId, dto.codigoBarras, id)
    }
    return this.prisma.producto.update({ where: { id }, data: dto })
  }

  // Si el producto fue usado en algun cobro, no se borra: se archiva
  // (activo:false), para preservar el historico de DetalleCobro.
  async remove(consultorioId: number, id: number) {
    const p = await this.prisma.producto.findFirst({ where: { id, consultorioId, deletedAt: null } })
    if (!p) throw new NotFoundException('Producto no encontrado')
    const usado = await this.prisma.detalleCobro.count({ where: { productoId: id } })
    if (usado > 0) {
      const producto = await this.prisma.producto.update({ where: { id }, data: { activo: false } })
      return { eliminado: false, enUso: true, producto }
    }
    await this.prisma.producto.update({ where: { id }, data: { deletedAt: new Date(), activo: false } })
    return { eliminado: true }
  }

  // codigoBarras es nullable: solo choca si hay otro producto vivo con el mismo
  // codigo en el consultorio (el @@unique ya cubre, validamos para 409 claro).
  private async validarCodigoUnico(consultorioId: number, codigoBarras: string | undefined, excludeId?: number) {
    if (!codigoBarras) return
    const existe = await this.prisma.producto.findFirst({
      where: { consultorioId, codigoBarras, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    })
    if (existe) throw new ConflictException('Ya existe un producto con ese codigo de barras')
  }
}
```

- [ ] **Step 2: Crear el controller**

Crear `apps/api/src/modules/productos/productos.controller.ts`:

```ts
import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { ProductosService, CreateProductoDto, UpdateProductoDto } from './productos.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { Rol } from '@pos/types'

@ApiTags('Productos')
@ApiBearerAuth()
@Controller('productos')
export class ProductosController {
  constructor(private service: ProductosService) {}

  // Picker de venta (rol operativo): solo vendibles. Ruta literal antes de :id.
  @Get('vendibles')
  vendibles(@CurrentUser() user: JwtPayload, @Query('search') search?: string) {
    return this.service.vendibles(user.consultorioId, search)
  }

  @Get()
  @Roles(Rol.ADMIN)
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('todos') todos?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll(user.consultorioId, {
      incluirInactivos: todos === 'true',
      search: search || undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    })
  }

  @Post()
  @Roles(Rol.ADMIN)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateProductoDto) {
    return this.service.create(user.consultorioId, dto)
  }

  @Put(':id')
  @Roles(Rol.ADMIN)
  update(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductoDto) {
    return this.service.update(user.consultorioId, id, dto)
  }

  @Delete(':id')
  @Roles(Rol.ADMIN)
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(user.consultorioId, id)
  }
}
```

- [ ] **Step 3: Crear el modulo**

Crear `apps/api/src/modules/productos/productos.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { ProductosService } from './productos.service'
import { ProductosController } from './productos.controller'
import { PrismaModule } from '../../prisma/prisma.module'

@Module({
  imports: [PrismaModule],
  controllers: [ProductosController],
  providers: [ProductosService],
  exports: [ProductosService],
})
export class ProductosModule {}
```

(Verificar el nombre real del PrismaModule mirando un modulo vecino, p.ej. `apps/api/src/modules/aseguradoras/aseguradoras.module.ts`, y copiar el import exacto.)

- [ ] **Step 4: Registrar en app.module**

En `apps/api/src/app.module.ts`, importar `ProductosModule` y agregarlo al array `imports` (junto a `AseguradorasModule`).

- [ ] **Step 5: Verificar tipos**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/productos apps/api/src/app.module.ts
git commit -m "feat(productos): modulo CRUD de productos (catalogo paginado + picker vendibles + archivar)"
```

---

### Task 5: Integracion del cobro — linea de servicio, edicion de productos, descuento de stock (path cita)

**Files:**
- Create: `apps/api/src/modules/cobros/stock.helper.ts`
- Modify: `apps/api/src/modules/citas/citas.service.ts:208-264` (create), `:442-564` (cambiarEstado), `:465-483` (reabrir)
- Modify: `apps/api/src/modules/cobros/cobros.service.ts` (setProductos, findOne, descuento en registrarPago, restitucion en anularPago)
- Modify: `apps/api/src/modules/cobros/cobros.controller.ts` (PUT /cobros/:id/lineas, GET /cobros/:id)

**Interfaces:**
- Consumes: `DetalleCobro`, `Producto`, helpers de stock.
- Produces:
  - `descontarStockDeCobro(tx, consultorioId, cobroId, usuarioId)` y `restituirStockDeCobro(tx, consultorioId, cobroId, usuarioId)` en `stock.helper.ts`.
  - `CobrosService.setProductos(consultorioId, cobroId, dto, usuarioId)` -> cobro fresco + `advertencias: string[]`.
  - `CobrosService.findOne(consultorioId, cobroId)` -> cobro con `pagos`, `detalles`.
  - `PUT /cobros/:id/lineas` (rol operativo), `GET /cobros/:id` (rol operativo).
  - DTO `SetLineasProductoDto { lineas: { productoId: number; cantidad: number }[] }`.

- [ ] **Step 1: Crear los helpers de stock**

Crear `apps/api/src/modules/cobros/stock.helper.ts`:

```ts
import { Prisma } from '@prisma/client'

// Descuenta stock de las lineas de PRODUCTO de un cobro (solo las que controlan
// stock). Lo llama el caller en el momento de CONFIRMAR la venta (salida de
// ATENDIDA o creacion de venta directa), una sola vez por cobro. Permite stock
// negativo (alerta, no bloquea). Devuelve advertencias por linea bajo stock.
export async function descontarStockDeCobro(
  tx: Prisma.TransactionClient,
  consultorioId: number,
  cobroId: number,
  usuarioId: number,
): Promise<string[]> {
  const lineas = await tx.detalleCobro.findMany({
    where: { cobroId, consultorioId, productoId: { not: null } },
    select: {
      productoId: true, cantidad: true, descripcion: true,
      producto: { select: { controlaStock: true, stockActual: true } },
    },
  })
  const advertencias: string[] = []
  for (const l of lineas) {
    if (!l.producto?.controlaStock) continue
    if (l.cantidad > l.producto.stockActual) {
      advertencias.push(`Stock negativo en "${l.descripcion}" (habia ${l.producto.stockActual}, se vendieron ${l.cantidad})`)
    }
    await tx.producto.update({
      where: { id: l.productoId! },
      data: { stockActual: { decrement: l.cantidad } },
    })
  }
  if (lineas.length > 0) {
    await tx.log.create({
      data: {
        consultorioId, usuarioId, entidad: 'Cobro', entidadId: cobroId, accion: 'UPDATE',
        payloadDespues: { evento: 'descuento-stock', lineas: lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad })) },
      },
    })
  }
  return advertencias
}

// Espejo: restituye el stock descontado (al anular un cobro confirmado o reabrir
// una cita). Mismo set de lineas, increment.
export async function restituirStockDeCobro(
  tx: Prisma.TransactionClient,
  consultorioId: number,
  cobroId: number,
  usuarioId: number,
): Promise<void> {
  const lineas = await tx.detalleCobro.findMany({
    where: { cobroId, consultorioId, productoId: { not: null } },
    select: { productoId: true, cantidad: true, producto: { select: { controlaStock: true } } },
  })
  for (const l of lineas) {
    if (!l.producto?.controlaStock) continue
    await tx.producto.update({
      where: { id: l.productoId! },
      data: { stockActual: { increment: l.cantidad } },
    })
  }
  if (lineas.length > 0) {
    await tx.log.create({
      data: {
        consultorioId, usuarioId, entidad: 'Cobro', entidadId: cobroId, accion: 'UPDATE',
        payloadDespues: { evento: 'restitucion-stock', lineas: lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad })) },
      },
    })
  }
}
```

- [ ] **Step 2: Crear la linea de servicio al generar el cobro de la cita**

En `apps/api/src/modules/citas/citas.service.ts`, dentro de `create`, en la `$transaction`, donde hoy se hace `tx.cobro.create` (linea ~238), reemplazar por crear el cobro CON `pacienteId` y agregar la linea de servicio:

```ts
      const cobro = await tx.cobro.create({
        data: {
          citaId: c.id,
          consultorioId,
          pacienteId: dto.pacienteId,
          total: totalCobro,
          saldoPendiente: totalCobro,
        },
      })

      await tx.detalleCobro.create({
        data: {
          consultorioId,
          cobroId: cobro.id,
          servicioId: dto.servicioId,
          descripcion: servicio.nombre,
          cantidad: 1,
          precioVenta: totalCobro,
          precioCosto: 0,
          subtotal: totalCobro,
        },
      })
```

(`servicio` ya esta cargado al inicio de `create`; tiene `nombre`. `totalCobro` es `montoPaciente` si hay seguro, si no `precioParticular`.)

Nota reprogramacion: cuando `reprogramar` recalcula `cobro.total`/`saldoPendiente` por cambio de servicio (citas.service `reprogramar`), la linea de servicio queda con el precio viejo. Para P1 esto es aceptable (el total del cobro es la fuente para caja/deuda; el detalle de servicio es informativo y se recompone si hace falta). Documentarlo con un comentario en `reprogramar` (no se toca la logica de cobro alli). El recompute de `total = SUM(detalles)` solo se ejerce en el path de productos (Step 4).

- [ ] **Step 3: Agregar findOne(cobroId) y el DTO de lineas en cobros.service**

En `apps/api/src/modules/cobros/cobros.service.ts`, agregar el import del helper y `Prisma`:

```ts
import { descontarStockDeCobro, restituirStockDeCobro } from './stock.helper'
```

Agregar el DTO (junto a los otros DTOs del archivo):

```ts
export class LineaProductoDto {
  @IsInt()
  productoId: number

  @IsInt() @Min(1)
  cantidad: number
}

export class SetLineasProductoDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => LineaProductoDto) @ArrayMaxSize(100)
  lineas: LineaProductoDto[]
}
```

(Agregar a los imports de class-validator: `IsArray, ValidateNested, ArrayMaxSize`; y `import { Type } from 'class-transformer'`.)

Agregar `findOne` (cobro por id, con detalles; sirve a venta directa y al modal):

```ts
  async findOne(consultorioId: number, cobroId: number) {
    const cobro = await this.prisma.cobro.findFirst({
      where: { id: cobroId, consultorioId },
      include: {
        pagos: { orderBy: { createdAt: 'asc' }, include: { tipoCuenta: { select: { nombre: true } } } },
        detalles: { orderBy: { id: 'asc' } },
      },
    })
    if (!cobro) throw new NotFoundException('Cobro no encontrado')
    return cobro
  }
```

- [ ] **Step 4: Implementar setProductos (editar lineas de producto antes de confirmar)**

En `CobrosService`, agregar:

```ts
  // Reemplaza las lineas de PRODUCTO de un cobro (las de servicio no se tocan)
  // y recomputa total/saldo/deuda. Solo se permite mientras la venta NO esta
  // confirmada: cita en ATENDIDA (aun no salio a COBRADO/CON_DEUDA). NO descuenta
  // stock (eso pasa al confirmar). Devuelve el cobro fresco + advertencias de
  // stock bajo (informativas; no bloquean).
  async setProductos(
    consultorioId: number,
    cobroId: number,
    dto: SetLineasProductoDto,
    usuarioId: number,
  ) {
    const cobro = await this.prisma.cobro.findFirst({
      where: { id: cobroId, consultorioId },
      include: { cita: { select: { id: true, estado: true, pacienteId: true } } },
    })
    if (!cobro) throw new NotFoundException('Cobro no encontrado')
    if (cobro.estado === EstadoCobro.ANULADO) {
      throw new BadRequestException('El cobro esta anulado')
    }
    // Solo cita en ATENDIDA admite edicion de productos (antes de confirmar).
    // Venta directa edita sus lineas al crearse (no por aca).
    if (!cobro.citaId || cobro.cita?.estado !== EstadoCita.ATENDIDA) {
      throw new BadRequestException('Solo se pueden editar productos antes de confirmar el cobro (cita en atencion finalizada)')
    }

    // Cargar productos vendibles del consultorio para snapshot + validacion
    const ids = [...new Set(dto.lineas.map((l) => l.productoId))]
    const productos = await this.prisma.producto.findMany({
      where: { id: { in: ids }, consultorioId, deletedAt: null, activo: true, habilitadoVenta: true },
    })
    const porId = new Map(productos.map((p) => [p.id, p]))
    for (const l of dto.lineas) {
      if (!porId.has(l.productoId)) {
        throw new BadRequestException(`Producto ${l.productoId} no existe o no esta habilitado para la venta`)
      }
    }

    const advertencias: string[] = []
    const pagado = cobro.total.minus(cobro.saldoPendiente)

    const fresco = await this.prisma.$transaction(async (tx) => {
      // Borrar lineas de producto previas (las de servicio quedan)
      await tx.detalleCobro.deleteMany({ where: { cobroId, consultorioId, productoId: { not: null } } })

      // Insertar las nuevas lineas de producto (snapshot del producto)
      for (const l of dto.lineas) {
        const p = porId.get(l.productoId)!
        const subtotal = p.precioVenta.mul(l.cantidad)
        await tx.detalleCobro.create({
          data: {
            consultorioId, cobroId,
            productoId: p.id,
            descripcion: p.nombre,
            cantidad: l.cantidad,
            precioVenta: p.precioVenta,
            precioCosto: p.precioCosto,
            subtotal,
          },
        })
        if (p.controlaStock && l.cantidad > p.stockActual) {
          advertencias.push(`Stock bajo en "${p.nombre}" (disponible ${p.stockActual})`)
        }
      }

      // Recomputar total = SUM(detalles) y saldo = total - pagado
      const agg = await tx.detalleCobro.aggregate({ where: { cobroId, consultorioId }, _sum: { subtotal: true } })
      const nuevoTotal = agg._sum.subtotal ?? new Decimal(0)
      if (nuevoTotal.lt(pagado)) {
        throw new BadRequestException('El total de la venta no puede quedar por debajo de lo ya pagado')
      }
      const nuevoSaldo = nuevoTotal.minus(pagado)
      const nuevoEstado = nuevoSaldo.lte(0)
        ? EstadoCobro.COMPLETO
        : pagado.gt(0) ? EstadoCobro.PARCIAL : EstadoCobro.PENDIENTE

      await tx.cobro.update({
        where: { id: cobroId },
        data: { total: nuevoTotal, saldoPendiente: nuevoSaldo, estado: nuevoEstado },
      })

      // La cita en ATENDIDA ya sumo su saldo a deudaTotal; ajustar por el delta
      // de saldo que aportan los productos.
      const deltaSaldo = nuevoSaldo.minus(cobro.saldoPendiente)
      if (!deltaSaldo.isZero() && cobro.cita) {
        await tx.paciente.update({
          where: { id: cobro.cita.pacienteId },
          data: { deudaTotal: { increment: deltaSaldo } },
        })
      }

      return tx.cobro.findFirst({
        where: { id: cobroId, consultorioId },
        include: {
          pagos: { orderBy: { createdAt: 'asc' }, include: { tipoCuenta: { select: { nombre: true } } } },
          detalles: { orderBy: { id: 'asc' } },
        },
      })
    })

    return { ...fresco, advertencias }
  }
```

- [ ] **Step 5: Descontar stock al salir de ATENDIDA (registrarPago)**

En `registrarPago`, dentro de la `$transaction`, donde hoy se actualiza la cita a `nuevoEstadoCita` (linea ~141-150), agregar el descuento de stock SOLO cuando se SALE de ATENDIDA (el saldo se confirma). `estadoCita` es el estado previo:

```ts
      if (tocaCita) {
        await tx.cita.update({
          where: { id: cobro.citaId },
          data: { estado: nuevoEstadoCita },
        })
        await tx.paciente.update({
          where: { id: cobro.cita.pacienteId },
          data: { deudaTotal: { decrement: monto } },
        })
        // Confirmacion de la venta: la cita sale de ATENDIDA -> COBRADO/CON_DEUDA.
        // Descontar stock de las lineas de producto una sola vez (en ese borde).
        if (estadoCita === EstadoCita.ATENDIDA) {
          await descontarStockDeCobro(tx, consultorioId, cobroId, usuarioId)
        }
      }
```

(`registrarPago` ya carga `cobro` con `include: { cita: true }`; `cobro.citaId` puede ser null en venta directa: ese caso se maneja en Task 6. En este Task la guarda `tocaCita`/`estadoCita` solo aplica a cobros con cita.)

- [ ] **Step 6: Descontar stock al confirmar via cambiarEstado (ATENDIDA -> COBRADO/CON_DEUDA)**

En `apps/api/src/modules/citas/citas.service.ts`, en `cambiarEstado`, dentro de la `$transaction`: cuando el estado previo es ATENDIDA y el nuevo es COBRADO o CON_DEUDA, descontar stock. Agregar el import del helper arriba del archivo:

```ts
import { descontarStockDeCobro, restituirStockDeCobro } from '../cobros/stock.helper'
```

Y dentro de la transaccion de `cambiarEstado`, despues del `tx.cita.update` (linea ~443-446) y del manejo de deuda, agregar:

```ts
      // Confirmacion de venta con productos: al salir de ATENDIDA hacia
      // COBRADO/CON_DEUDA se descuenta el stock de las lineas de producto.
      if (
        cita.estado === EstadoCita.ATENDIDA &&
        (estadoFinal === EstadoCita.COBRADO || estadoFinal === EstadoCita.CON_DEUDA) &&
        cita.cobro
      ) {
        const cobroId = await tx.cobro.findUnique({ where: { citaId }, select: { id: true } })
        if (cobroId) await descontarStockDeCobro(tx, consultorioId, cobroId.id, usuarioId)
      }
```

(El `estadoFinal` ya existe en `cambiarEstado`. `cita.cobro` ya viene en el `include` del findFirst.)

- [ ] **Step 7: Restituir stock al reabrir la cita**

En `cambiarEstado`, en el bloque que reabre (`dto.estado === PENDIENTE && ESTADOS_ANULAN_COBRO.includes(cita.estado)`, linea ~467-483), agregar la restitucion del stock (la cita vuelve atras: los productos vuelven al inventario):

```ts
        await tx.cobro.update({ where: { citaId }, data: { estado: estadoCobro } })
        // Reabrir restituye el stock que se habia descontado al confirmar
        const cobroReabrir = await tx.cobro.findUnique({ where: { citaId }, select: { id: true } })
        if (cobroReabrir) await restituirStockDeCobro(tx, consultorioId, cobroReabrir.id, usuarioId)
```

Nota: una cita COBRADO/CON_DEUDA no puede ir a CANCELADA/NO_ASISTIO (maquina de estados), asi que la restitucion por reapertura cubre el unico camino de vuelta disponible en P1. La correccion de una venta ya confirmada se hace anulando pagos (no restituye stock automaticamente en P1; documentarlo).

- [ ] **Step 8: Exponer los endpoints en el controller**

En `apps/api/src/modules/cobros/cobros.controller.ts`, agregar `GET /cobros/:id` y `PUT /cobros/:id/lineas`. Importar `SetLineasProductoDto`. Cuidar el orden de rutas: las literales (`deudores`, `cita/:citaId`, `pagos/:id/anular`, `venta-directa` de Task 6) van ANTES de `:id`.

```ts
  @Get(':id')
  @ApiOperation({ summary: 'Obtener un cobro por id (con detalles)' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(user.consultorioId, id)
  }

  @Put(':id/lineas')
  @ApiOperation({ summary: 'Editar las lineas de producto de un cobro (antes de confirmar)' })
  setProductos(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetLineasProductoDto,
  ) {
    return this.service.setProductos(user.consultorioId, id, dto, user.sub)
  }
```

- [ ] **Step 9: Verificar tipos**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/cobros apps/api/src/modules/citas/citas.service.ts
git commit -m "feat(productos): venta mixta en el cobro de la cita (lineas + descuento/restitucion de stock al confirmar)"
```

---

### Task 6: Venta directa (cobro sin cita) + pagos/deudores null-safe

**Files:**
- Modify: `apps/api/src/modules/cobros/cobros.service.ts` (crearVentaDirecta, registrarPago/anularPago null-safe, whereDeudaReal + getDeudores)
- Modify: `apps/api/src/modules/cobros/cobros.controller.ts` (POST /cobros/venta-directa)

**Interfaces:**
- Consumes: helpers de stock (Task 5), `Producto`, `caja` (`exigirCajaAbierta`, `diaCajaLocal`).
- Produces:
  - `CobrosService.crearVentaDirecta(consultorioId, dto, usuarioId)` -> cobro fresco + `advertencias`.
  - `POST /cobros/venta-directa` (rol operativo).
  - DTO `CrearVentaDirectaDto { pacienteId?: number; lineas: LineaProductoDto[] }`.
  - `registrarPago`/`anularPago` toleran `cobro.citaId === null`.
  - `getDeudores`/`getDeudoresResumen` incluyen ventas directas con saldo.

- [ ] **Step 1: DTO de venta directa**

En `cobros.service.ts`, agregar (reusa `LineaProductoDto` de Task 5):

```ts
export class CrearVentaDirectaDto {
  @IsInt() @IsOptional()
  pacienteId?: number

  @IsArray() @ValidateNested({ each: true }) @Type(() => LineaProductoDto) @ArrayMaxSize(100)
  lineas: LineaProductoDto[]
}
```

- [ ] **Step 2: Implementar crearVentaDirecta**

```ts
  // Venta de mostrador sin cita. El cobro nace YA confirmado: el stock se
  // descuenta al crearlo. paciente opcional (consumidor final al contado), pero
  // OBLIGATORIO si queda saldo (para colgar la deuda). No registra el pago aca:
  // el pago se hace despues con registrarPago sobre este cobro.
  async crearVentaDirecta(consultorioId: number, dto: CrearVentaDirectaDto, usuarioId: number) {
    if (dto.lineas.length === 0) throw new BadRequestException('La venta no tiene productos')
    await this.exigirCajaAbierta(consultorioId)

    if (dto.pacienteId) {
      const pac = await this.prisma.paciente.findFirst({
        where: { id: dto.pacienteId, consultorioId, deletedAt: null },
        select: { id: true },
      })
      if (!pac) throw new BadRequestException('Paciente no valido')
    }

    const ids = [...new Set(dto.lineas.map((l) => l.productoId))]
    const productos = await this.prisma.producto.findMany({
      where: { id: { in: ids }, consultorioId, deletedAt: null, activo: true, habilitadoVenta: true },
    })
    const porId = new Map(productos.map((p) => [p.id, p]))
    for (const l of dto.lineas) {
      if (!porId.has(l.productoId)) {
        throw new BadRequestException(`Producto ${l.productoId} no existe o no esta habilitado para la venta`)
      }
    }

    let total = new Decimal(0)
    for (const l of dto.lineas) total = total.plus(porId.get(l.productoId)!.precioVenta.mul(l.cantidad))
    // Sin pago al crear: queda saldo = total. Si hay saldo, exigir paciente.
    if (total.gt(0) && !dto.pacienteId) {
      throw new BadRequestException('Si la venta no se paga al contado completo, elegi un paciente para la deuda')
    }

    const advertencias: string[] = []

    const fresco = await this.prisma.$transaction(async (tx) => {
      const cobro = await tx.cobro.create({
        data: {
          citaId: null,
          consultorioId,
          pacienteId: dto.pacienteId ?? null,
          total,
          saldoPendiente: total,
          estado: EstadoCobro.PENDIENTE,
        },
      })
      for (const l of dto.lineas) {
        const p = porId.get(l.productoId)!
        await tx.detalleCobro.create({
          data: {
            consultorioId, cobroId: cobro.id, productoId: p.id,
            descripcion: p.nombre, cantidad: l.cantidad,
            precioVenta: p.precioVenta, precioCosto: p.precioCosto,
            subtotal: p.precioVenta.mul(l.cantidad),
          },
        })
      }
      // Confirmada al crear: descontar stock
      const adv = await descontarStockDeCobro(tx, consultorioId, cobro.id, usuarioId)
      advertencias.push(...adv)

      // Deuda: si hay paciente y saldo, sube a deudaTotal
      if (dto.pacienteId && total.gt(0)) {
        await tx.paciente.update({ where: { id: dto.pacienteId }, data: { deudaTotal: { increment: total } } })
      }

      await tx.log.create({
        data: {
          consultorioId, usuarioId, entidad: 'Cobro', entidadId: cobro.id, accion: 'CREATE',
          payloadDespues: { evento: 'venta-directa', total: total.toString(), pacienteId: dto.pacienteId ?? null },
        },
      })

      return tx.cobro.findFirst({
        where: { id: cobro.id, consultorioId },
        include: {
          pagos: { orderBy: { createdAt: 'asc' }, include: { tipoCuenta: { select: { nombre: true } } } },
          detalles: { orderBy: { id: 'asc' } },
        },
      })
    })

    return { ...fresco, advertencias }
  }
```

- [ ] **Step 3: registrarPago null-safe (cobro de venta directa)**

En `registrarPago`, el codigo asume `cobro.cita`. Hacerlo tolerante a `citaId === null`. Cambiar el bloque de validacion de estado de cita y el bloque `tocaCita` para saltarlos cuando no hay cita, y rolar la deuda al `cobro.pacienteId`:

- En la carga inicial agregar el paciente del cobro: el `include: { cita: true }` se mantiene; usar `cobro.pacienteId` para la deuda.
- Donde valida `estadoCita` (linea ~105-113), envolver en `if (cobro.citaId) { ...validacion y tocaCita... } else { tocaCita = false }`. Declarar `let tocaCita = false` y `let estadoCita` arriba.
- En la `$transaction`, el bloque `if (tocaCita)` ya no corre para venta directa. Para venta directa, la deuda baja sobre `cobro.pacienteId`:

```ts
      // Venta directa (sin cita): la deuda del paciente baja con cada pago
      if (!cobro.citaId && cobro.pacienteId) {
        await tx.paciente.update({
          where: { id: cobro.pacienteId },
          data: { deudaTotal: { decrement: monto } },
        })
      }
```

- Al final, `registrarPago` retorna `this.findByCita(consultorioId, cobro.citaId)`. Para venta directa devolver `this.findOne(consultorioId, cobroId)`:

```ts
    return cobro.citaId
      ? this.findByCita(consultorioId, cobro.citaId)
      : this.findOne(consultorioId, cobroId)
```

- [ ] **Step 4: anularPago null-safe**

En `anularPago`, el `include` carga `cobro.cita`. Para venta directa (`citaId` null) no hay cita que revertir; la deuda vuelve sobre `cobro.pacienteId`. Ajustar:
- `revierteCita` solo si `cobro.cita` existe y estaba COBRADO.
- El `tx.cita.update` solo si `revierteCita`.
- El `tx.paciente.update` (increment de deuda) usar el paciente correcto: `cobro.cita?.pacienteId ?? cobro.pacienteId`. Si ninguno (venta al contado sin paciente, saldada), saltar el update.
- El retorno final: si `cobro.citaId` usar `findByCita`, si no `findOne`.

```ts
    const pacienteDeuda = cobro.cita?.pacienteId ?? cobro.pacienteId
    ...
      if (revierteCita && cobro.cita) {
        await tx.cita.update({ where: { id: cobro.cita.id }, data: { estado: EstadoCita.CON_DEUDA } })
      }
      if (pacienteDeuda) {
        await tx.paciente.update({ where: { id: pacienteDeuda }, data: { deudaTotal: { increment: pago.monto } } })
      }
```

(Cargar `cobro.pacienteId` en el include/select de `anularPago`: el `include: { cobro: { include: { cita: {...} } } }` ya trae el cobro completo, asi que `pago.cobro.pacienteId` esta disponible.)

- [ ] **Step 5: Deudores incluye ventas directas**

`whereDeudaReal` hoy exige `cita.estado in [ATENDIDA, CON_DEUDA]`, lo que excluye ventas directas (sin cita). Ampliar para incluir cobros directos con saldo:

```ts
  private readonly whereDeudaReal = (consultorioId: number): Prisma.CobroWhereInput => ({
    consultorioId,
    saldoPendiente: { gt: new Decimal(0) },
    OR: [
      { cita: { estado: { in: [EstadoCita.ATENDIDA, EstadoCita.CON_DEUDA] }, deletedAt: null } },
      // Venta directa: sin cita, con paciente para colgar la deuda
      { citaId: null, pacienteId: { not: null } },
    ],
  })
```

(Importar `Prisma` de `@prisma/client` si no esta.)

En `getDeudores`, el codigo agrupa por `cobro.cita.paciente`. Para venta directa no hay `cita`. Ajustar el include para traer tambien `paciente` directo y derivar el paciente/servicio segun el caso:

```ts
      include: {
        pagos: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
        paciente: { select: { id: true, nombre: true, apellido: true, telefono: true, pais: true } },
        cita: {
          include: {
            paciente: { select: { id: true, nombre: true, apellido: true, telefono: true, pais: true } },
            servicio: { select: { nombre: true } },
          },
        },
      },
```

Y en el loop, derivar:

```ts
      const pac = cobro.cita?.paciente ?? cobro.paciente
      if (!pac) continue // venta directa sin paciente (contado): no es deuda
      const fechaCita = cobro.cita ? new Date(cobro.cita.fechaHora) : new Date(cobro.createdAt)
      const ultimoServicio = cobro.cita?.servicio.nombre ?? 'Venta de productos'
```

(Reemplazar los usos de `cobro.cita.paciente`, `cobro.cita.fechaHora`, `cobro.cita.servicio.nombre` por estas variables. `getDeudoresResumen` usa `cobro.cita.pacienteId`; cambiar el select a `{ pacienteId: true, cita: { select: { pacienteId: true } } }` y derivar `c.cita?.pacienteId ?? c.pacienteId` al armar el Set.)

- [ ] **Step 6: Endpoint de venta directa en el controller**

En `cobros.controller.ts`, agregar (ruta literal, antes de `:id`):

```ts
  @Post('venta-directa')
  @ApiOperation({ summary: 'Crear una venta directa de productos (sin cita)' })
  crearVentaDirecta(@CurrentUser() user: JwtPayload, @Body() dto: CrearVentaDirectaDto) {
    return this.service.crearVentaDirecta(user.consultorioId, dto, user.sub)
  }
```

(Importar `CrearVentaDirectaDto`.)

- [ ] **Step 7: Verificar tipos**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/cobros
git commit -m "feat(productos): venta directa (cobro sin cita) + pagos/deudores tolerantes a citaId null"
```

---

### Task 7: Gate de integracion — scripts/gate-productos.ps1

**Files:**
- Create: `scripts/gate-productos.ps1`

**Interfaces:**
- Consumes: API corriendo en :3000. El gate crea su propio tenant (patron de los gates existentes, ver `scripts/gate-aseguradoras-f2.ps1`).

- [ ] **Step 1: Escribir el gate**

Crear `scripts/gate-productos.ps1` siguiendo el patron de `scripts/gate-aseguradoras-f2.ps1` (registro de tenant, login, helper de requests con bearer; PS 5.1: usar `ConvertFrom-Json -InputObject`). Escenarios a cubrir (cada uno con assert claro y `Write-Host` de OK/FAIL):

1. Toggle `vendeProductos=true` via `PUT /consultorio`; re-login y assert `user.vendeProductos === true`.
2. `POST /productos` (vendible, controlaStock, stock 10) y `POST /productos` (insumo `habilitadoVenta:false`). `GET /productos/vendibles` devuelve solo el vendible.
3. Venta mixta: crear paciente + servicio + cita; mover a EN_ATENCION -> ATENDIDA; `PUT /cobros/:id/lineas` con 2 unidades del producto vendible; assert `total === precioServicio + 2*precioVenta` y `SUM(detalles)===total`.
4. Confirmar: `POST /cobros/:id/pagos` pago total; assert cita COBRADO; `GET /productos` assert `stockActual === 8`.
5. Reabrir no aplica (COBRADO es terminal); en su lugar probar restitucion via venta directa anulada (paso 7).
6. XOR: intentar insertar un detalle invalido NO es por API (lo cubre el CHECK); en el gate, assert que `PUT /cobros/:id/lineas` con producto inexistente da 400.
7. Venta directa con paciente (deuda): abrir caja; `POST /cobros/venta-directa` 3 unidades sin pago; assert saldo>0, `GET /productos` stock baja 3, paciente aparece en `GET /cobros/deudores`. Registrar pago parcial y assert deuda baja. Anular el pago y assert deuda sube de nuevo.
8. Venta directa al contado sin paciente: assert que sin pacienteId y con saldo da 400 (regla del service).
9. Stock negativo: vender mas unidades que el stock; assert que NO bloquea (201/200) y devuelve `advertencias`.

- [ ] **Step 2: Correr el gate (lo ejecuta el owner; el agente no logra bootear nest en su shell)**

Run (owner, con API en :3000): `pwsh scripts/gate-productos.ps1`
Expected: todos los escenarios imprimen OK; exit 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/gate-productos.ps1
git commit -m "test(productos): gate de integracion (venta mixta, venta directa, stock, deuda)"
```

---

### Task 8: Frontend — toggle "Vende productos" en Configuracion

**Files:**
- Modify: `apps/web/src/features/configuracion/ConfiguracionPage.tsx`

**Interfaces:**
- Consumes: `PUT /consultorio` con `vendeProductos`; `AuthUser.vendeProductos`.
- Produces: el flag persistido + propagado al auth store (`setUser`), patron identico a `trabajaConAseguradoras`.

> UI: pasar por impeccable + ui-ux-pro-max + frontend-design antes del JSX. Aca el patron ya existe (switch-container de aseguradoras), asi que es replica directa del componente existente.

- [ ] **Step 1: Estado del form**

En `ConfiguracionPage.tsx`, en el tipo del form y el estado inicial (lineas ~38, ~57), agregar `vendeProductos: boolean` (default `false`), y en el efecto que llena el form desde `/consultorio` (linea ~88) agregar `vendeProductos: consultorio.vendeProductos ?? false`.

- [ ] **Step 2: Enviar el campo en la mutation**

En `updateConsultorio` (linea ~116-133), agregar `vendeProductos: data.vendeProductos,`. En `onSuccess` (linea ~140), propagar al store junto al flag de aseguradoras:

```ts
      if (user) setUser({ ...user, trabajaConAseguradoras: cons.trabajaConAseguradoras, vendeProductos: cons.vendeProductos })
```

- [ ] **Step 3: Toggle UI (replica del switch de aseguradoras)**

Debajo del bloque "Modulo de aseguradoras" (linea ~451), agregar un segundo switch-container identico para `vendeProductos`, con copy:
- Titulo: "Vende productos"
- Descripcion: "Habilita el catalogo de productos, la venta de productos en el cobro y la venta directa. Si lo apagas, el modulo queda oculto."
- Mismo markup `role="switch"`, `aria-checked`, toggle visual, "Se aplica al guardar."

- [ ] **Step 4: Verificar tipos**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/configuracion/ConfiguracionPage.tsx
git commit -m "feat(productos): toggle Vende productos en Configuracion"
```

---

### Task 9: Frontend — Seccion Inventario (ruta + nav + shell + tab Productos)

**Files:**
- Create: `apps/web/src/features/inventario/InventarioPage.tsx`
- Create: `apps/web/src/features/inventario/ProductosTab.tsx`
- Create: `apps/web/src/features/inventario/ProductoModal.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/shared/AppShell.tsx`

**Interfaces:**
- Consumes: `GET /productos?todos&search&page&limit` -> `{items,total}`; `POST/PUT/DELETE /productos`.
- Produces: ruta `/inventario` (AdminRoute), item de nav gateado por admin + `vendeProductos`, shell con sub-tabs (Productos en P1; placeholders deshabilitados para Compras/Ajustes).

> UI OBLIGATORIO: antes de escribir el JSX de InventarioPage, ProductosTab y ProductoModal, correr impeccable + ui-ux-pro-max + frontend-design. Reusar: header estandar (patron `CatalogoPage`), `cardUI`, grid paginado con scroll infinito (patron `PacientesPage`), `FloatingInput`/`FloatingSelect`, `ModalHeader`, tokens de `lib/ui.ts`. Checklist: touch >=44px, focus-visible, `tabular-nums` en precios y stock, color+forma en el badge de stock bajo, dark mode.

- [ ] **Step 1: Ruta en App.tsx**

Importar `InventarioPage` y agregar (junto a las rutas admin):

```tsx
import { InventarioPage } from './features/inventario/InventarioPage'
...
        <Route path="inventario" element={<AdminRoute><InventarioPage /></AdminRoute>} />
```

- [ ] **Step 2: Item de nav gateado en AppShell**

En `NAV_ITEMS` (linea ~34-49), agregar (icono `Package` de lucide-react, importarlo):

```ts
  { to: '/inventario', icon: Package, label: 'Inventario', soloAdmin: true, requiereProductos: true },
```

Extender el filtro de render (linea ~194) para soportar `requiereProductos`:

```tsx
{NAV_ITEMS.filter((item) =>
  (!item.soloAdmin || esAdmin) &&
  !(esDoctor && item.ocultarDoctor) &&
  (!item.requiereAseguradoras || user?.trabajaConAseguradoras) &&
  (!item.requiereProductos || user?.vendeProductos)
).map(
```

- [ ] **Step 3: Shell de la seccion (InventarioPage)**

`InventarioPage.tsx`: header estandar + barra de sub-tabs. En P1 solo "Productos" activo; "Compras" y "Ajustes" como tabs deshabilitados con tooltip "Proximamente" (señalan el roadmap sin romper). Render del tab activo = `<ProductosTab />`. Estado de tab local (`useState`). Si `!user?.vendeProductos`, redirigir a `/inicio` (guard de UX; la seguridad real es el backend ADMIN).

Contrato minimo (estructura, el JSX final lo definen los skills):
- Header: icono `Package`, titulo "Inventario", campana de notificaciones (patron de las demas paginas).
- Tablist con `role="tablist"`, botones `role="tab"` con `aria-selected`.

- [ ] **Step 4: ProductosTab (lista paginada)**

`ProductosTab.tsx`: replica del patron `PacientesPage` (scroll infinito con `useInfiniteQuery` sobre `GET /productos`, `{items,total}`):
- Query key jerarquica: `['productos', { search, todos }]`.
- Buscador (nombre/codigo) con debounce; toggle "Mostrar archivados" (`todos=true`).
- Cada fila: nombre, categoria, precio venta (`tabular-nums`), stock (`tabular-nums`; badge ambar con icono si `stockActual <= 0` o bajo), chips "No vendible" si `!habilitadoVenta` y "Archivado" si `!activo` (color + texto, no solo color).
- Boton "Nuevo producto" abre `ProductoModal` en modo alta. Click en fila abre en modo edicion.
- `onSuccess` de las mutations invalida `['productos']`.

- [ ] **Step 5: ProductoModal (alta/edicion)**

`ProductoModal.tsx`: modal con `ModalHeader` + `FloatingInput`/`FloatingSelect` + switches `role="switch"` (patron DoctorModal):
- Campos: nombre, categoria (texto libre), codigoBarras, precioVenta, precioCosto, stockActual (solo en alta; en edicion el stock se ajusta por Compras/Ajustes en P2/P3 — en P1 editable directo con nota), switches `controlaStock` y `habilitadoVenta`. En edicion, switch `activo`.
- Mutations: `POST /productos` (alta) / `PUT /productos/:id` (edicion). Manejo de error 409 (codigo duplicado) mostrado en `errorUI`.
- Boton archivar (en edicion): `DELETE /productos/:id`; si la respuesta trae `enUso:true`, mostrar "Producto en uso: se archivo" (no se borro).
- Validacion: obligatorios solo al enviar (patron floating labels, sin asteriscos).

- [ ] **Step 6: Verificar tipos**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/inventario apps/web/src/App.tsx apps/web/src/components/shared/AppShell.tsx
git commit -m "feat(productos): seccion Inventario con tab Productos (catalogo CRUD, nav gateado)"
```

---

### Task 10: Frontend — Venta mixta en el modal de cobro (LineasProductoEditor)

**Files:**
- Create: `apps/web/src/features/inventario/LineasProductoEditor.tsx`
- Modify: `apps/web/src/features/agenda/CobroModal.tsx`

**Interfaces:**
- Consumes: `GET /productos/vendibles?search`; `PUT /cobros/:id/lineas` -> cobro + `advertencias`.
- Produces: `LineasProductoEditor` (buscador + grilla de lineas + total en vivo + alerta de stock), reutilizado por Task 11 (venta directa).

> UI OBLIGATORIO: correr impeccable + ui-ux-pro-max + frontend-design antes del JSX. UX POS: botones grandes, agregar en pocos clics, `tabular-nums` en montos/stock, alerta de stock con color + icono. Reusar tokens de `lib/ui.ts`.

- [ ] **Step 1: LineasProductoEditor (componente controlado)**

`LineasProductoEditor.tsx`: componente presentacional + busqueda, con props:

```ts
interface LineaUI { productoId: number; nombre: string; precioVenta: number; cantidad: number; stockActual: number; controlaStock: boolean }
interface Props {
  lineas: LineaUI[]
  onChange: (lineas: LineaUI[]) => void
  disabled?: boolean
}
```

- Buscador que consulta `GET /productos/vendibles?search` (query key `['productos','vendibles',search]`), lista resultados; click agrega/incrementa la linea.
- Grilla de lineas: nombre, control de cantidad (-/+ con touch >=44px), subtotal (`tabular-nums`), quitar. Alerta ambar con icono `AlertTriangle` si `controlaStock && cantidad > stockActual` ("Stock: N").
- Pie con subtotal de productos (`tabular-nums`).
- `disabled` (true cuando la venta ya esta confirmada): oculta el buscador y los controles de cantidad.

- [ ] **Step 2: Integrar en CobroModal detras del flag**

En `CobroModal.tsx`:
- `const vendeProductos = useAuthStore((s) => s.user?.vendeProductos)`.
- El `GET /cobros/cita/:id` ya devuelve `detalles`; derivar las lineas de producto (las que tienen `productoId`) a estado local `lineas`.
- Editable solo si `cita.estado === 'ATENDIDA'` (antes de confirmar). Si la cita ya esta COBRADO/CON_DEUDA, render read-only (la grilla de lineas con `disabled`).
- Mutation `setLineas`: `PUT /cobros/${cobro.id}/lineas` con `{ lineas: lineas.map(l => ({ productoId, cantidad })) }`. `onSuccess`: `invalidarFinanzas()` + actualizar el cobro local; si `advertencias.length`, mostrarlas en un bloque ambar (no `errorUI`).
- El "Total servicio" del modal pasa a mostrar el desglose: servicio + productos = total. El boton "Pagar total" usa el saldo del cobro (ya recomputado por el backend).
- `tabular-nums` en todos los montos.

Guardar las lineas (commit del editor) ANTES de registrar el pago: el flujo es (1) agregar productos -> Guardar (PUT lineas), (2) registrar pago. Mostrar el editor solo si `vendeProductos`.

- [ ] **Step 3: Verificar tipos**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/inventario/LineasProductoEditor.tsx apps/web/src/features/agenda/CobroModal.tsx
git commit -m "feat(productos): venta mixta en el modal de cobro (lineas de producto + total en vivo)"
```

---

### Task 11: Frontend — Boton "Venta directa" en la Agenda

**Files:**
- Create: `apps/web/src/features/inventario/VentaDirectaModal.tsx`
- Modify: `apps/web/src/features/agenda/AgendaPage.tsx`

**Interfaces:**
- Consumes: `POST /cobros/venta-directa` -> cobro + `advertencias`; reusa `LineasProductoEditor` (Task 10); selector de paciente (patron existente en `NuevaCitaModal`).
- Produces: flujo de venta de mostrador sin cita.

> UI OBLIGATORIO: correr impeccable + ui-ux-pro-max + frontend-design antes del JSX.

- [ ] **Step 1: VentaDirectaModal**

`VentaDirectaModal.tsx`:
- `LineasProductoEditor` para armar la venta.
- Selector de paciente OPCIONAL (reusar el buscador de pacientes de `NuevaCitaModal`), con aviso: "Si la venta no se paga completa al contado, elegi un paciente para la deuda."
- Mutation `POST /cobros/venta-directa` con `{ pacienteId?, lineas }`. Manejo de error 400 (sin paciente con saldo) en `errorUI`. Mostrar `advertencias` (stock) en bloque ambar.
- `onSuccess`: invalidar `['citas','deudores','deudores-resumen','caja-hoy','pacientes']`; abrir el `CobroModal`/flujo de pago sobre el cobro recien creado, o cerrar y avisar "Venta registrada" (decision UX a resolver con los skills; minimal: cerrar + toast + permitir cobrar luego desde Deudores).

- [ ] **Step 2: Boton en AgendaPage**

En `AgendaPage.tsx`, agregar un boton "Venta directa" visible solo si `useAuthStore((s) => s.user?.vendeProductos)`, que abre `VentaDirectaModal`. Ubicarlo junto a "Nueva cita" (mismo cluster de acciones), con icono `ShoppingCart`.

- [ ] **Step 3: Verificar tipos**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/inventario/VentaDirectaModal.tsx apps/web/src/features/agenda/AgendaPage.tsx
git commit -m "feat(productos): venta directa de mostrador desde la Agenda"
```

---

## Verificacion final (P1)

- [ ] `cd apps/api && npx tsc --noEmit` y `cd apps/web && npx tsc --noEmit` limpios.
- [ ] `cd packages/types && pnpm build` ok.
- [ ] Migraciones aplicadas en dev; backfill verificado (Task 2 Step 7): 0 cobros sin linea de servicio y `SUM(detalles)===total` por cobro.
- [ ] `scripts/gate-productos.ps1` verde (lo corre el owner con la API en :3000). Gates previos (aseguradoras, prepago, etc.) corren como regresion.
- [ ] Flag apagado: el modulo es invisible (nav, modal de cobro sin bloque de productos, sin boton venta directa). Flag encendido: todo aparece.
- [ ] Migracion de prod: aditiva salvo el aflojado de `NOT NULL` en `Cobro.citaId` (no destructivo). El backfill se entrega con el SQL de verificacion de Task 2 para correr antes del deploy. NO deployar por iniciativa propia.

## Notas y limites de P1 (fuera de alcance)

- Compras/ingreso de stock + kardex (`MovimientoStock`): P2.
- Ajuste de inventario por conteo + reportes de utilidad: P3.
- Correccion de una venta de cita YA confirmada (COBRADO/CON_DEUDA): en P1 se hace por anulacion de pagos; la restitucion automatica de stock solo ocurre al reabrir una cita (camino acotado por la maquina de estados) o al anular una venta directa. Una "anulacion total de venta confirmada con restitucion" mas general queda para P2 junto al kardex.
- Reprogramacion con cambio de servicio: el recompute de `cobro.total` no reescribe la linea de servicio del `DetalleCobro` en P1 (el total del cobro sigue siendo la fuente para caja/deuda). Documentado en Task 5 Step 2.
- Variantes/SKU, lotes, vencimientos, multiples depositos, stock fraccionado, POS dedicado, lector de codigos: YAGNI.
