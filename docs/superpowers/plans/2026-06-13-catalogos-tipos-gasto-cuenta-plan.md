# Catálogo TipoGasto / TipoCuenta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar los enums globales `CategoriaGasto`/`CuentaGasto` por dos tablas por consultorio (`TipoGasto`, `TipoCuenta`) con CRUD ADMIN en `CatalogoPage`, soft delete (`activo`), flag `esEfectivo` en `TipoCuenta` que hace dinámico el arqueo de caja, y migración de datos sin pérdida.

**Architecture:** `TipoGasto` y `TipoCuenta` son tablas tenant (FK a `Consultorio`), patrón de `Servicio` (soft delete via `activo`). `Gasto.categoria/cuenta` (enums) → `Gasto.tipoGastoId/tipoCuentaId` (FK). El arqueo de caja deja de filtrar `cuenta === 'CAJA_EFECTIVO'` y pasa a `tipoCuenta.esEfectivo === true`. Dos módulos NestJS simétricos (`tipos-gasto`, `tipos-cuenta`) patrón `servicios`. Seeding de defaults al registrar consultorio. Migración SQL custom: crea tablas, siembra defaults por consultorio, mapea filas existentes, dropea enums.

**Tech Stack:** Prisma + PostgreSQL, NestJS, React 19 + TanStack Query, @pos/types.

**Decisiones:** `TipoCuenta` se nombra genérico (no "cuenta de gasto") porque servirá también a cobros (fuera de alcance ahora). Solo 0-1 `TipoCuenta` con `esEfectivo=true` por consultorio: al marcar una nueva, la anterior se desmarca (no se rechaza). No se puede inactivar un tipo con gastos no borrados (409).

---

### Task 1: Schema + migración con datos

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_tipos_gasto_cuenta/migration.sql`

- [ ] **Step 1: Editar schema**

En `schema.prisma`, agregar los dos modelos (después de `model Servicio`):

```prisma
model TipoGasto {
  id            Int      @id @default(autoincrement())
  consultorioId Int
  consultorio   Consultorio @relation(fields: [consultorioId], references: [id])
  nombre        String
  activo        Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  gastos Gasto[]
  @@index([consultorioId])
  @@map("tipos_gasto")
}

model TipoCuenta {
  id            Int      @id @default(autoincrement())
  consultorioId Int
  consultorio   Consultorio @relation(fields: [consultorioId], references: [id])
  nombre        String
  activo        Boolean  @default(true)
  esEfectivo    Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  gastos Gasto[]
  @@index([consultorioId])
  @@map("tipos_cuenta")
}
```

En `model Gasto`, reemplazar:
```prisma
  categoria       CategoriaGasto
  cuenta          CuentaGasto @default(CAJA_EFECTIVO)
```
por:
```prisma
  tipoGastoId     Int
  tipoGasto       TipoGasto  @relation(fields: [tipoGastoId], references: [id])
  tipoCuentaId    Int
  tipoCuenta      TipoCuenta @relation(fields: [tipoCuentaId], references: [id])
```

En `model Consultorio`, agregar a las relaciones inversas (junto a `gastos Gasto[]`):
```prisma
  tiposGasto   TipoGasto[]
  tiposCuenta  TipoCuenta[]
```

Eliminar `enum CategoriaGasto { ... }` y `enum CuentaGasto { ... }` del schema.

- [ ] **Step 2: Generar carpeta de migración vacía y escribir SQL custom**

Crear `apps/api/prisma/migrations/<timestamp>_tipos_gasto_cuenta/migration.sql` (timestamp formato `AAAAMMDDHHMMSS`, ej. `20260613120000`). El SQL debe (orden importa):

```sql
-- 1) Tablas nuevas
CREATE TABLE "tipos_gasto" (
  "id" SERIAL NOT NULL,
  "consultorioId" INTEGER NOT NULL,
  "nombre" TEXT NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tipos_gasto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tipos_gasto_consultorioId_idx" ON "tipos_gasto"("consultorioId");
ALTER TABLE "tipos_gasto" ADD CONSTRAINT "tipos_gasto_consultorioId_fkey"
  FOREIGN KEY ("consultorioId") REFERENCES "consultorios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "tipos_cuenta" (
  "id" SERIAL NOT NULL,
  "consultorioId" INTEGER NOT NULL,
  "nombre" TEXT NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "esEfectivo" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tipos_cuenta_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tipos_cuenta_consultorioId_idx" ON "tipos_cuenta"("consultorioId");
ALTER TABLE "tipos_cuenta" ADD CONSTRAINT "tipos_cuenta_consultorioId_fkey"
  FOREIGN KEY ("consultorioId") REFERENCES "consultorios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2) Sembrar defaults por consultorio existente
INSERT INTO "tipos_gasto" ("consultorioId", "nombre", "updatedAt")
SELECT c."id", v.nombre, CURRENT_TIMESTAMP
FROM "consultorios" c
CROSS JOIN (VALUES ('Insumos'),('Sueldos'),('Alquiler'),('Servicios'),('Impuestos'),('Otros')) AS v(nombre);

INSERT INTO "tipos_cuenta" ("consultorioId", "nombre", "esEfectivo", "updatedAt")
SELECT c."id", v.nombre, v.efectivo, CURRENT_TIMESTAMP
FROM "consultorios" c
CROSS JOIN (VALUES ('Caja efectivo', true),('Banco', false),('Otro', false)) AS v(nombre, efectivo);

-- 3) Columnas FK nullable temporal
ALTER TABLE "gastos" ADD COLUMN "tipoGastoId" INTEGER;
ALTER TABLE "gastos" ADD COLUMN "tipoCuentaId" INTEGER;

-- 4) Mapear enum -> FK por nombre del default
UPDATE "gastos" g SET "tipoGastoId" = tg."id"
FROM "tipos_gasto" tg
WHERE tg."consultorioId" = g."consultorioId" AND tg."nombre" = (
  CASE g."categoria"
    WHEN 'INSUMOS' THEN 'Insumos' WHEN 'SUELDOS' THEN 'Sueldos'
    WHEN 'ALQUILER' THEN 'Alquiler' WHEN 'SERVICIOS' THEN 'Servicios'
    WHEN 'IMPUESTOS' THEN 'Impuestos' ELSE 'Otros' END);

UPDATE "gastos" g SET "tipoCuentaId" = tc."id"
FROM "tipos_cuenta" tc
WHERE tc."consultorioId" = g."consultorioId" AND tc."nombre" = (
  CASE g."cuenta"
    WHEN 'CAJA_EFECTIVO' THEN 'Caja efectivo' WHEN 'BANCO' THEN 'Banco' ELSE 'Otro' END);

-- 5) NOT NULL + FKs
ALTER TABLE "gastos" ALTER COLUMN "tipoGastoId" SET NOT NULL;
ALTER TABLE "gastos" ALTER COLUMN "tipoCuentaId" SET NOT NULL;
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_tipoGastoId_fkey"
  FOREIGN KEY ("tipoGastoId") REFERENCES "tipos_gasto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_tipoCuentaId_fkey"
  FOREIGN KEY ("tipoCuentaId") REFERENCES "tipos_cuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6) Drop columnas y enums viejos
ALTER TABLE "gastos" DROP COLUMN "categoria";
ALTER TABLE "gastos" DROP COLUMN "cuenta";
DROP TYPE "CategoriaGasto";
DROP TYPE "CuentaGasto";
```

- [ ] **Step 3: Aplicar migración y regenerar client**

Run:
```bash
cd apps/api && npx prisma migrate deploy && npx prisma generate
```
Expected: migración aplicada sin error, client regenerado. Si la DB local tiene datos, verificar que ningún gasto quedó con FK null (la migración haría fallar el `SET NOT NULL`).

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(catalogos): schema TipoGasto/TipoCuenta + migracion de datos desde enums"
```

---

### Task 2: @pos/types — quitar enums

**Files:**
- Modify: `packages/types/src/enums/index.ts`

- [ ] **Step 1: Eliminar los enums**

Borrar de `packages/types/src/enums/index.ts` los bloques `export enum CategoriaGasto { ... }` y `export enum CuentaGasto { ... }` (líneas ~58-73, incluido el comentario).

- [ ] **Step 2: Rebuild types**

Run:
```bash
cd packages/types && pnpm build
```
Expected: build OK. (El frontend que importa estos enums queda roto hasta Task 6-7; se arregla allí.)

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/enums/index.ts packages/types/dist
git commit -m "refactor(types): quitar enums CategoriaGasto/CuentaGasto"
```

---

### Task 3: Backend — módulos tipos-gasto y tipos-cuenta

**Files:**
- Create: `apps/api/src/modules/tipos-gasto/tipos-gasto.{module,controller,service}.ts`
- Create: `apps/api/src/modules/tipos-cuenta/tipos-cuenta.{module,controller,service}.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: tipos-gasto.service.ts** (patrón `servicios.service.ts`, soft delete + guard de gastos asociados)

```typescript
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator'
import { PartialType } from '@nestjs/swagger'
import { PrismaService } from '../../prisma/prisma.service'

export class CreateTipoGastoDto {
  @IsString() @IsNotEmpty()
  nombre: string
}

export class UpdateTipoGastoDto extends PartialType(CreateTipoGastoDto) {
  @IsBoolean() @IsOptional()
  activo?: boolean
}

@Injectable()
export class TiposGastoService {
  constructor(private prisma: PrismaService) {}

  findAll(consultorioId: number, incluirInactivos = false) {
    return this.prisma.tipoGasto.findMany({
      where: { consultorioId, ...(incluirInactivos ? {} : { activo: true }) },
      orderBy: { nombre: 'asc' },
    })
  }

  create(consultorioId: number, dto: CreateTipoGastoDto) {
    return this.prisma.tipoGasto.create({ data: { ...dto, consultorioId } })
  }

  async update(consultorioId: number, id: number, dto: UpdateTipoGastoDto) {
    const t = await this.prisma.tipoGasto.findFirst({ where: { id, consultorioId } })
    if (!t) throw new NotFoundException()
    // No inactivar un tipo con gastos no borrados
    if (dto.activo === false) {
      const enUso = await this.prisma.gasto.count({
        where: { consultorioId, tipoGastoId: id, deletedAt: null },
      })
      if (enUso > 0) throw new ConflictException('No se puede inactivar: hay gastos con este tipo')
    }
    return this.prisma.tipoGasto.update({ where: { id }, data: dto })
  }
}
```

- [ ] **Step 2: tipos-gasto.controller.ts** (todo ADMIN salvo `activos`, que cualquier rol usa en GastoModal)

```typescript
import { Controller, Get, Post, Put, Body, Param, Query, ParseIntPipe } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { TiposGastoService, CreateTipoGastoDto, UpdateTipoGastoDto } from './tipos-gasto.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { Rol } from '@pos/types'

@ApiTags('TiposGasto')
@ApiBearerAuth()
@Controller('tipos-gasto')
export class TiposGastoController {
  constructor(private service: TiposGastoService) {}

  // Cualquier rol operativo: dropdown de alta de gasto
  @Get('activos')
  activos(@CurrentUser() user: JwtPayload) {
    return this.service.findAll(user.consultorioId, false)
  }

  @Get()
  @Roles(Rol.ADMIN)
  findAll(@CurrentUser() user: JwtPayload) {
    return this.service.findAll(user.consultorioId, true)
  }

  @Post()
  @Roles(Rol.ADMIN)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateTipoGastoDto) {
    return this.service.create(user.consultorioId, dto)
  }

  @Put(':id')
  @Roles(Rol.ADMIN)
  update(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTipoGastoDto) {
    return this.service.update(user.consultorioId, id, dto)
  }
}
```

- [ ] **Step 3: tipos-gasto.module.ts**

```typescript
import { Module } from '@nestjs/common'
import { TiposGastoController } from './tipos-gasto.controller'
import { TiposGastoService } from './tipos-gasto.service'

@Module({ controllers: [TiposGastoController], providers: [TiposGastoService] })
export class TiposGastoModule {}
```

- [ ] **Step 4: tipos-cuenta.service.ts** (igual + `esEfectivo` y desmarcado del anterior)

```typescript
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator'
import { PartialType } from '@nestjs/swagger'
import { PrismaService } from '../../prisma/prisma.service'

export class CreateTipoCuentaDto {
  @IsString() @IsNotEmpty()
  nombre: string

  @IsBoolean() @IsOptional()
  esEfectivo?: boolean
}

export class UpdateTipoCuentaDto extends PartialType(CreateTipoCuentaDto) {
  @IsBoolean() @IsOptional()
  activo?: boolean
}

@Injectable()
export class TiposCuentaService {
  constructor(private prisma: PrismaService) {}

  findAll(consultorioId: number, incluirInactivos = false) {
    return this.prisma.tipoCuenta.findMany({
      where: { consultorioId, ...(incluirInactivos ? {} : { activo: true }) },
      orderBy: { nombre: 'asc' },
    })
  }

  async create(consultorioId: number, dto: CreateTipoCuentaDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.esEfectivo) {
        await tx.tipoCuenta.updateMany({
          where: { consultorioId, esEfectivo: true },
          data: { esEfectivo: false },
        })
      }
      return tx.tipoCuenta.create({ data: { ...dto, consultorioId } })
    })
  }

  async update(consultorioId: number, id: number, dto: UpdateTipoCuentaDto) {
    const t = await this.prisma.tipoCuenta.findFirst({ where: { id, consultorioId } })
    if (!t) throw new NotFoundException()
    if (dto.activo === false) {
      const enUso = await this.prisma.gasto.count({
        where: { consultorioId, tipoCuentaId: id, deletedAt: null },
      })
      if (enUso > 0) throw new ConflictException('No se puede inactivar: hay gastos con esta cuenta')
    }
    return this.prisma.$transaction(async (tx) => {
      if (dto.esEfectivo) {
        await tx.tipoCuenta.updateMany({
          where: { consultorioId, esEfectivo: true, id: { not: id } },
          data: { esEfectivo: false },
        })
      }
      return tx.tipoCuenta.update({ where: { id }, data: dto })
    })
  }
}
```

- [ ] **Step 5: tipos-cuenta.controller.ts** (espejo de tipos-gasto, ruta `tipos-cuenta`, DTOs de cuenta) y **tipos-cuenta.module.ts** (espejo). Copiar el controller del Step 2 cambiando: import de `TiposCuentaService, CreateTipoCuentaDto, UpdateTipoCuentaDto`, `@ApiTags('TiposCuenta')`, `@Controller('tipos-cuenta')`, nombre de clase `TiposCuentaController`, provider `TiposCuentaService`. Copiar el module del Step 3 → `TiposCuentaModule`.

- [ ] **Step 6: Registrar en app.module.ts**

Agregar imports y a `imports: []`:
```typescript
import { TiposGastoModule } from './modules/tipos-gasto/tipos-gasto.module'
import { TiposCuentaModule } from './modules/tipos-cuenta/tipos-cuenta.module'
// ... en imports:
TiposGastoModule,
TiposCuentaModule,
```

- [ ] **Step 7: tsc + commit**

```bash
cd apps/api && npx tsc --noEmit
git add apps/api/src/modules/tipos-gasto apps/api/src/modules/tipos-cuenta apps/api/src/app.module.ts
git commit -m "feat(catalogos): modulos tipos-gasto y tipos-cuenta (CRUD ADMIN)"
```

---

### Task 4: Backend — GastosService, CajaService, ReportesService

**Files:**
- Modify: `apps/api/src/modules/gastos/gastos.service.ts`
- Modify: `apps/api/src/modules/gastos/gastos.controller.ts`
- Modify: `apps/api/src/modules/caja/caja.service.ts`
- Modify: `apps/api/src/modules/reportes/reportes.service.ts`

- [ ] **Step 1: gastos.service.ts — DTO con FKs**

Quitar `import { CategoriaGasto, CuentaGasto } from '@prisma/client'` (dejar `Decimal`). En `CreateGastoDto`, reemplazar los campos `categoria` y `cuenta` por:
```typescript
  @IsInt() @Min(1)
  tipoGastoId: number

  @IsInt() @Min(1)
  tipoCuentaId: number
```
Agregar `IsInt` al import de `class-validator`.

- [ ] **Step 2: gastos.service.ts — findAll**

`findAll`: cambiar el parámetro `categoria?: CategoriaGasto` por `tipoGastoId?: number`; el `where` usa `...(tipoGastoId && { tipoGastoId })`; agregar al objeto:
```typescript
      include: {
        registradoPor: { select: { nombre: true } },
        tipoGasto: { select: { nombre: true } },
        tipoCuenta: { select: { nombre: true, esEfectivo: true } },
      },
```

- [ ] **Step 3: gastos.service.ts — resumen agrupa por tipoGasto.nombre**

En `resumen()`, el `select` pasa a `{ monto: true, tipoGasto: { select: { nombre: true } } }`; el acumulador usa `g.tipoGasto.nombre` como clave en `porCategoria`.

- [ ] **Step 4: gastos.service.ts — create valida pertenencia + usa FKs**

En `create()`, antes del `prisma.gasto.create`, validar:
```typescript
    const [tg, tc] = await Promise.all([
      this.prisma.tipoGasto.findFirst({ where: { id: dto.tipoGastoId, consultorioId } }),
      this.prisma.tipoCuenta.findFirst({ where: { id: dto.tipoCuentaId, consultorioId } }),
    ])
    if (!tg) throw new NotFoundException('Tipo de gasto no encontrado')
    if (!tc) throw new NotFoundException('Tipo de cuenta no encontrado')
```
En el `data:` del create, reemplazar `categoria: dto.categoria` y `cuenta: dto.cuenta` por `tipoGastoId: dto.tipoGastoId` y `tipoCuentaId: dto.tipoCuentaId`. En el `log.create` payloadDespues, cambiar `categoria`/`cuenta` por `tipoGastoId`/`tipoCuentaId`.

En `update()`: reemplazar las líneas `...(dto.categoria !== undefined && { categoria: dto.categoria })` y `...(dto.cuenta !== undefined && { cuenta: dto.cuenta })` por `tipoGastoId`/`tipoCuentaId`. En los logs payloadAntes/Despues que referencian `gasto.categoria`/`actualizado.categoria`, usar `tipoGastoId`. En `remove()` payloadAntes, cambiar `categoria: gasto.categoria` por `tipoGastoId: gasto.tipoGastoId`.

- [ ] **Step 5: gastos.controller.ts — query param**

Quitar `import { CategoriaGasto } from '@prisma/client'`. En `findAll`, cambiar `@Query('categoria') categoria?: CategoriaGasto` por `@Query('tipoGastoId') tipoGastoId?: string` y pasar `tipoGastoId ? Number(tipoGastoId) : undefined` al service.

- [ ] **Step 6: caja.service.ts — arqueo dinámico por esEfectivo**

En `egresosDelDia`, cambiar el `select` a `{ monto: true, tipoCuenta: { select: { esEfectivo: true } } }` y el filtro a `.filter((g) => g.tipoCuenta.esEfectivo)`.

- [ ] **Step 7: reportes.service.ts — agrupar por tipoGasto**

Cambiar el `groupBy({ by: ['categoria'], ... })` por `by: ['tipoGastoId']`. Tras el `Promise.all`, cargar los nombres:
```typescript
    const tiposGasto = await this.prisma.tipoGasto.findMany({
      where: { consultorioId }, select: { id: true, nombre: true },
    })
    const nombreTipo = new Map(tiposGasto.map((t) => [t.id, t.nombre]))
```
En el return, `porCategoria` pasa a:
```typescript
        porCategoria: gastos.map((g) => ({
          categoria: nombreTipo.get(g.tipoGastoId) ?? 'Otros',
          total: Number(g._sum.monto ?? 0),
        })),
```

- [ ] **Step 8: tsc + commit**

```bash
cd apps/api && npx tsc --noEmit
git add apps/api/src/modules/gastos apps/api/src/modules/caja apps/api/src/modules/reportes
git commit -m "feat(catalogos): gastos/caja/reportes usan TipoGasto/TipoCuenta (arqueo por esEfectivo)"
```

---

### Task 5: Backend — seeding de defaults al registrar consultorio

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts`

- [ ] **Step 1: Sembrar tipos en `register`**

En `auth.service.ts`, dentro del `prisma.consultorio.create`, agregar al `data:` (junto a `usuarios`):
```typescript
        tiposGasto: {
          create: [
            { nombre: 'Insumos' }, { nombre: 'Sueldos' }, { nombre: 'Alquiler' },
            { nombre: 'Servicios' }, { nombre: 'Impuestos' }, { nombre: 'Otros' },
          ],
        },
        tiposCuenta: {
          create: [
            { nombre: 'Caja efectivo', esEfectivo: true },
            { nombre: 'Banco' }, { nombre: 'Otro' },
          ],
        },
```

- [ ] **Step 2: tsc + commit**

```bash
cd apps/api && npx tsc --noEmit
git add apps/api/src/auth/auth.service.ts
git commit -m "feat(catalogos): sembrar tipos gasto/cuenta default al registrar consultorio"
```

---

### Task 6: Frontend — CatalogoPage: dos secciones + modales

**Files:**
- Modify: `apps/web/src/features/catalogo/CatalogoPage.tsx`
- Create: `apps/web/src/features/catalogo/TipoGastoModal.tsx`
- Create: `apps/web/src/features/catalogo/TipoCuentaModal.tsx`

- [ ] **Step 1: TipoGastoModal.tsx** (patrón `ServicioModal`, input nombre + toggle activo solo en edición)

```tsx
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, AlertCircle } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn } from '../../lib/utils'
import { inputUI, btnPrimaryUI, btnOutlineUI, btnIconUI, errorUI } from '../../lib/ui'

interface TipoGasto { id: number; nombre: string; activo: boolean }
interface Props { tipo?: TipoGasto | null; onClose: () => void }

export function TipoGastoModal({ tipo, onClose }: Props) {
  const qc = useQueryClient()
  const editando = !!tipo?.id
  const [error, setError] = useState('')
  const [nombre, setNombre] = useState(tipo?.nombre ?? '')
  const [activo, setActivo] = useState(tipo?.activo ?? true)

  const mutation = useMutation({
    mutationFn: () => {
      const payload = editando ? { nombre, activo } : { nombre }
      return editando ? api.put(`/tipos-gasto/${tipo!.id}`, payload) : api.post('/tipos-gasto', payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tipos-gasto'] })
      onClose()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al guardar')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-xl border shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-foreground">{editando ? 'Editar tipo de gasto' : 'Nuevo tipo de gasto'}</h2>
          <button onClick={onClose} aria-label="Cerrar" className={cn(btnIconUI, 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate() }} className="p-6 space-y-4">
          <div>
            <label htmlFor="tg-nombre" className="block text-sm font-medium text-foreground mb-1.5">Nombre *</label>
            <input id="tg-nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Marketing" className={inputUI} />
          </div>
          {editando && (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
              Activo
            </label>
          )}
          {error && (<p role="alert" className={errorUI}><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{error}</p>)}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className={cn(btnOutlineUI, 'flex-1')}>Cancelar</button>
            <button type="submit" disabled={mutation.isPending} className={cn(btnPrimaryUI, 'flex-1')}>
              {mutation.isPending ? 'Guardando...' : editando ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TipoCuentaModal.tsx** (igual + checkbox esEfectivo)

Copiar TipoGastoModal con estos cambios: interfaz `TipoCuenta { id; nombre; activo; esEfectivo }`, estado extra `const [esEfectivo, setEsEfectivo] = useState(tipo?.esEfectivo ?? false)`, payload `editando ? { nombre, activo, esEfectivo } : { nombre, esEfectivo }`, endpoints `/tipos-cuenta`, invalidate `['tipos-cuenta']`, títulos "tipo de cuenta". Agregar antes del bloque error:
```tsx
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={esEfectivo} onChange={(e) => setEsEfectivo(e.target.checked)} />
            Es cuenta de efectivo (participa en el arqueo de caja)
          </label>
```

- [ ] **Step 3: CatalogoPage.tsx — dos secciones nuevas**

Importar:
```tsx
import { TipoGastoModal } from './TipoGastoModal'
import { TipoCuentaModal } from './TipoCuentaModal'
```
Agregar estado (junto a los existentes):
```tsx
  const [tgEdit, setTgEdit] = useState<any | null>(null)
  const [tgModal, setTgModal] = useState(false)
  const [tcEdit, setTcEdit] = useState<any | null>(null)
  const [tcModal, setTcModal] = useState(false)
```
Agregar queries:
```tsx
  const { data: tiposGasto = [] } = useQuery({
    queryKey: ['tipos-gasto', 'todos'],
    queryFn: () => api.get('/tipos-gasto').then((r) => r.data),
    enabled: esAdmin,
  })
  const { data: tiposCuenta = [] } = useQuery({
    queryKey: ['tipos-cuenta', 'todos'],
    queryFn: () => api.get('/tipos-cuenta').then((r) => r.data),
    enabled: esAdmin,
  })
```
Después de la sección Doctores (antes de los modales al final), agregar dos `<section>` envueltas en `{esAdmin && (...)}`. Cada una replica la estructura de la tabla de Servicios: header con título ("Tipos de gasto" / "Tipos de cuenta") + botón "Nuevo", tabla con columna Nombre, columna Estado (badge activo/inactivo igual que Servicios), y para Tipos de cuenta una columna extra "Efectivo" con un badge si `esEfectivo`. Botón editar por fila llama `setTgEdit(t); setTgModal(true)` (resp. tc). Filas:
```tsx
{(tiposGasto as any[]).map((t) => (
  <tr key={t.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors duration-150">
    <td className="px-4 py-3 font-medium">{t.nombre}</td>
    <td className="px-4 py-3">
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.activo ? 'bg-accent/10 text-accent' : 'bg-muted text-muted-foreground'}`}>
        {t.activo ? 'Activo' : 'Inactivo'}
      </span>
    </td>
    <td className="px-4 py-3 text-right">
      <button onClick={() => { setTgEdit(t); setTgModal(true) }} aria-label={`Editar ${t.nombre}`}
        className={cn(btnIconUI, 'text-muted-foreground/70 hover:text-foreground hover:bg-muted')}>
        <Pencil className="h-4 w-4" aria-hidden="true" />
      </button>
    </td>
  </tr>
))}
```
Para Tipos de cuenta, agregar entre Nombre y Estado:
```tsx
    <td className="px-4 py-3">
      {t.esEfectivo && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-primary/10 text-primary">Efectivo</span>}
    </td>
```
Montar al final, junto a los otros modales:
```tsx
{tgModal && <TipoGastoModal tipo={tgEdit} onClose={() => setTgModal(false)} />}
{tcModal && <TipoCuentaModal tipo={tcEdit} onClose={() => setTcModal(false)} />}
```

- [ ] **Step 4: tsc + commit**

```bash
cd apps/web && npx tsc --noEmit
git add apps/web/src/features/catalogo
git commit -m "feat(catalogos): secciones Tipos de gasto y Tipos de cuenta en Catalogo"
```

---

### Task 7: Frontend — GastoModal, GastosPage, ReportesPage usan tipos dinámicos

**Files:**
- Modify: `apps/web/src/features/gastos/GastoModal.tsx`
- Modify: `apps/web/src/features/gastos/GastosPage.tsx`
- Modify: `apps/web/src/features/reportes/ReportesPage.tsx`

- [ ] **Step 1: GastoModal.tsx — dropdowns desde la API**

Quitar `import { CategoriaGasto, CuentaGasto } from '@pos/types'` y los `LABEL_CATEGORIA`/`LABEL_CUENTA` exportados. Agregar `useQuery`. Tipos locales:
```tsx
interface TipoGasto { id: number; nombre: string }
interface TipoCuenta { id: number; nombre: string; esEfectivo: boolean }
export interface GastoEditable {
  id: number; fecha: string; tipoGastoId: number; monto: string | number;
  descripcion: string; personal: string | null; tipoCuentaId: number
}
```
Cargar:
```tsx
  const { data: tiposGasto = [] } = useQuery<TipoGasto[]>({
    queryKey: ['tipos-gasto', 'activos'],
    queryFn: () => api.get('/tipos-gasto/activos').then((r) => r.data),
  })
  const { data: tiposCuenta = [] } = useQuery<TipoCuenta[]>({
    queryKey: ['tipos-cuenta', 'activos'],
    queryFn: () => api.get('/tipos-cuenta/activos').then((r) => r.data),
  })
```
`form` inicial: `tipoGastoId: gasto?.tipoGastoId ?? 0`, `tipoCuentaId: gasto?.tipoCuentaId ?? 0`. Con un `useEffect`, cuando lleguen los tipos y el form esté en 0 (alta), setear el primer tipoGasto y la tipoCuenta con `esEfectivo` (o la primera). Payload manda `tipoGastoId`/`tipoCuentaId` (Number). Selects:
```tsx
<select id="gasto-categoria" value={form.tipoGastoId} onChange={(e) => set('tipoGastoId', Number(e.target.value))} className={inputUI}>
  {tiposGasto.map((t) => (<option key={t.id} value={t.id}>{t.nombre}</option>))}
</select>
```
(análogo para cuenta con `tiposCuenta`). El aviso de efectivo: `{tiposCuenta.find((c) => c.id === form.tipoCuentaId)?.esEfectivo && (<p ...>Los gastos en efectivo descuentan del arqueo...</p>)}`. Si `tiposGasto.length === 0`, mostrar un aviso "Configure tipos de gasto en Catálogo" y deshabilitar submit.

- [ ] **Step 2: GastosPage.tsx — filtro dinámico**

Quitar `import { CategoriaGasto } from '@pos/types'` y `LABEL_CATEGORIA, LABEL_CUENTA` del import de GastoModal (ya no se exportan). Cambiar el estado `const [categoria, setCategoria]` por `const [tipoGastoId, setTipoGastoId] = useState('')`. La query usa `&tipoGastoId=${tipoGastoId}`. Cargar `tiposGasto` activos con useQuery (como en GastoModal). El `<select>` del filtro itera `tiposGasto` con `value={t.id}`. En la tabla, la celda de categoría muestra `g.tipoGasto?.nombre ?? '-'` y la de cuenta `g.tipoCuenta?.nombre ?? '-'`. Pasar a GastoModal `gasto` con `tipoGastoId`/`tipoCuentaId` (vienen en la fila).

- [ ] **Step 3: ReportesPage.tsx — labels pass-through**

El backend ya devuelve `categoria` como nombre legible. Reemplazar los usos `LABEL_CATEGORIA[g.categoria] ?? g.categoria` por `g.categoria` directo, y borrar el `const LABEL_CATEGORIA` local (líneas ~22-29).

- [ ] **Step 4: tsc + commit**

```bash
cd apps/web && npx tsc --noEmit
git add apps/web/src/features/gastos apps/web/src/features/reportes
git commit -m "feat(catalogos): GastoModal/GastosPage/Reportes usan tipos dinamicos"
```

---

### Task 8: Verificación — gate + regresión

**Files:**
- Create: `scripts/gate-tipos-gasto-cuenta.ps1`

- [ ] **Step 1: Escribir gate** (patrón `gate-e2m8.ps1`: register → login → abrir caja). Casos:
  1. `GET /tipos-gasto` trae los 6 defaults; `GET /tipos-cuenta` los 3, con "Caja efectivo" `esEfectivo=true`.
  2. `POST /tipos-gasto { nombre: 'Marketing' }` → aparece en la lista (7).
  3. `POST /tipos-cuenta { nombre: 'Mercado Pago', esEfectivo: true }` → la nueva tiene esEfectivo; "Caja efectivo" pasó a false (verificar con GET).
  4. Crear gasto con `tipoGastoId`/`tipoCuentaId` (la cuenta efectivo) → `GET /gastos` lo trae con `tipoGasto.nombre` y `tipoCuenta.nombre`.
  5. `GET /caja/hoy` → `egresosEfectivo` = monto del gasto (filtró por esEfectivo dinámico).
  6. Intentar `PUT /tipos-gasto/:id { activo: false }` sobre el tipo del gasto creado → 409.
  7. `POST /gastos` sin `tipoGastoId` → 400.
  8. SECRETARIA: `POST /tipos-gasto` → 403 (solo ADMIN); `GET /tipos-gasto/activos` → OK.

- [ ] **Step 2: Correr gate** (API en :3000). Run: `pwsh scripts/gate-tipos-gasto-cuenta.ps1`. Expected: todos OK.

- [ ] **Step 3: Regresión** — correr `gate-e2m8.ps1` adaptado o verificar que el viejo ya no aplica (usaba `categoria`/`cuenta` enum; actualizar sus bodies a `tipoGastoId`/`tipoCuentaId` o marcarlo reemplazado por el nuevo gate). Correr `gate-e2m9`/caja y la suite jest. `npx tsc --noEmit` en api y web.

- [ ] **Step 4: Commit**

```bash
git add scripts/gate-tipos-gasto-cuenta.ps1 scripts/gate-e2m8.ps1
git commit -m "test(catalogos): gate tipos-gasto/cuenta + ajuste regresion e2m8"
```

---

### Task 9: Cierre — PLAN.md + memoria

- [ ] Actualizar `PLAN.md`: modelo de datos (tablas `tipos_gasto`/`tipos_cuenta`, FKs en `gastos`), §7 endpoints (`/tipos-gasto`, `/tipos-cuenta`), nota de que el arqueo usa `esEfectivo`. Marcar el ítem correspondiente.
- [ ] Commit `docs(plan): catalogo tipos gasto/cuenta documentado`.
```
