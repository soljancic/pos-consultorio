# Aseguradoras y Convenios — F1 (Fundaciones + Catalogo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habilitar el modulo de aseguradoras detras de un flag por consultorio y entregar el catalogo CRUD (aseguradoras, categorias/planes, tarifario), sin tocar todavia pacientes/citas/cobros.

**Architecture:** 3 modelos nuevos de catalogo (Aseguradora, CategoriaSeguro, TarifaCobertura) + una columna `trabajaConAseguradoras` en Consultorio. El flag viaja en el objeto `user` del login (auth store, cero red); el front oculta todo el modulo cuando esta off. El modulo API `aseguradoras` clona el patron de `tipos-gasto` (borrar-si-no-usado, sino desactivar). UI: tab "Aseguradoras" en Catalogo + toggle en Configuracion, reutilizando el switch-container ya hecho en DoctorModal.

**Tech Stack:** NestJS + Prisma + PostgreSQL (api), React 19 + Vite + TanStack Query v5 + Tailwind (web), @pos/types (tipos compartidos, TS crudo).

## Global Constraints

- `consultorioId` SIEMPRE del JWT (`@CurrentUser()`), NUNCA del body/params.
- Todo DTO con decoradores class-validator (ValidationPipe global whitelist + forbidNonWhitelisted => 400 si falta o sobra propiedad).
- Roles: `@Roles(Rol.ADMIN)` con `Rol` de `@pos/types`. RolesGuard ya es global.
- Dinero en `Decimal` de Prisma; en JSON llega como string, el front convierte con `Number()`.
- Borrado soft: `activa: false`. Catalogo: borra si no esta usado; si la FK lo impide, desactiva y avisa (patron `tipos-gasto`).
- Enums: backend desde `@prisma/client`, frontend desde `@pos/types`, valores identicos.
- Rutas NestJS: declarar segmentos literales antes que los parametrizados; aca se evita el conflicto usando 3 controllers separados (`/aseguradoras`, `/categorias-seguro`, `/tarifas-cobertura`).
- Migraciones: solo `prisma migrate dev` en local. NUNCA destructivas en produccion. Las de F1 son 100% aditivas.
- UI: cada pantalla nueva/modificada pasa por los skills impeccable + ui-ux-pro-max + frontend-design ANTES del JSX. Tokens de `lib/ui.ts` (cardUI, inputUI, btnPrimaryUI, btnOutlineUI, btnIconUI, errorUI, chipIconUI). Copy visible en espanol CON acentos; identificadores de codigo sin acentos. Touch >=44px, focus-visible ring, tabular-nums en montos, transiciones 150-300ms. NO window.confirm/alert/prompt: usar ConfirmarModal del design system.
- Verificacion obligatoria antes de cada commit: `cd apps/api && npx tsc --noEmit` y `cd apps/web && npx tsc --noEmit`. Tras cambiar `packages/types`: `cd packages/types && pnpm build`.
- El agente NO bootea el dev server; los gates `.ps1` los corre el owner con la API en :3000.
- Branches: commitear directo en master (no crear branch salvo pedido del owner).

---

### Task 1: Schema Prisma + migracion (catalogo + flag)

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

**Interfaces:**
- Produces (modelos Prisma): `Aseguradora`, `CategoriaSeguro`, `TarifaCobertura`; campo `Consultorio.trabajaConAseguradoras Boolean @default(false)`.

- [ ] **Step 1: Agregar la columna del flag a Consultorio**

En `model Consultorio`, despues de `emailCierreCaja String?` (antes de `createdAt`), agregar:

```prisma
  // Modulo Aseguradoras (F1): habilita catalogo, cobertura en cita y liquidaciones.
  // Default off: la mayoria de los consultorios no usa el modulo.
  trabajaConAseguradoras Boolean @default(false)
```

En las back-relations de `Consultorio` (junto a `tiposGasto`, `tiposCuenta`), agregar:

```prisma
  aseguradoras     Aseguradora[]
  categoriasSeguro CategoriaSeguro[]
  tarifasCobertura TarifaCobertura[]
```

- [ ] **Step 2: Agregar la back-relation en Servicio**

En `model Servicio`, junto a `preciosDoctor DoctorServicioPrecio[]`, agregar:

```prisma
  tarifasCobertura TarifaCobertura[]
```

- [ ] **Step 3: Agregar los 3 modelos nuevos**

Al final del schema (despues del ultimo modelo de catalogo o donde queden agrupados los del consultorio), agregar:

```prisma
// ─── ASEGURADORAS (F1) ───────────────────────────────────────────────────────

model Aseguradora {
  id            Int      @id @default(autoincrement())
  consultorioId Int
  consultorio   Consultorio @relation(fields: [consultorioId], references: [id])
  nombre        String
  contacto      String?
  telefono      String?
  email         String?
  observaciones String?
  activa        Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  categorias CategoriaSeguro[]

  @@index([consultorioId])
  @@map("aseguradoras")
}

model CategoriaSeguro {
  id                  Int      @id @default(autoincrement())
  consultorioId       Int
  consultorio         Consultorio @relation(fields: [consultorioId], references: [id])
  aseguradoraId       Int
  aseguradora         Aseguradora @relation(fields: [aseguradoraId], references: [id])
  nombre              String
  porcentajeCobertura Decimal  @db.Decimal(5, 2)
  activa              Boolean  @default(true)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  tarifas TarifaCobertura[]

  @@index([consultorioId])
  @@index([aseguradoraId])
  @@map("categorias_seguro")
}

model TarifaCobertura {
  id                Int      @id @default(autoincrement())
  consultorioId     Int
  consultorio       Consultorio @relation(fields: [consultorioId], references: [id])
  categoriaSeguroId Int
  categoriaSeguro   CategoriaSeguro @relation(fields: [categoriaSeguroId], references: [id])
  servicioId        Int
  servicio          Servicio @relation(fields: [servicioId], references: [id])
  montoPaciente     Decimal  @db.Decimal(10, 2)
  montoAseguradora  Decimal  @db.Decimal(10, 2)
  activa            Boolean  @default(true)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@unique([categoriaSeguroId, servicioId])
  @@index([consultorioId])
  @@map("tarifas_cobertura")
}
```

- [ ] **Step 4: Crear la migracion**

Run: `cd apps/api && npx prisma migrate dev --name aseguradoras_f1`
Expected: crea `apps/api/prisma/migrations/<ts>_aseguradoras_f1/migration.sql` con los 3 `CREATE TABLE` + `ALTER TABLE "consultorios" ADD COLUMN "trabajaConAseguradoras" BOOLEAN NOT NULL DEFAULT false`. El client se regenera. Sin errores.

- [ ] **Step 5: Verificar que el client compila**

Run: `cd apps/api && npx tsc --noEmit`
Expected: PASS (sin errores). Confirma que `prisma.aseguradora`, `prisma.categoriaSeguro`, `prisma.tarifaCobertura` existen en el client.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(aseguradoras): schema catalogo + flag trabajaConAseguradoras (F1)"
```

---

### Task 2: Propagar el flag a AuthUser

**Files:**
- Modify: `packages/types/src/api/index.ts:50-57` (interface AuthUser)
- Modify: `apps/api/src/auth/auth.service.ts` (objetos `user` de login/loginGoogle/register)

**Interfaces:**
- Consumes: `Consultorio.trabajaConAseguradoras` (Task 1).
- Produces: `AuthUser.trabajaConAseguradoras: boolean` disponible en el auth store del front.

- [ ] **Step 1: Agregar el campo a la interface AuthUser**

En `packages/types/src/api/index.ts`, dentro de `interface AuthUser`, despues de `consultorioNombre: string`:

```typescript
  trabajaConAseguradoras: boolean
```

- [ ] **Step 2: Rebuild de @pos/types**

Run: `cd packages/types && pnpm build`
Expected: compila `dist/` sin errores.

- [ ] **Step 3: Localizar todos los sitios que arman el objeto `user`**

Run: `cd apps/api && rg -n "consultorioNombre:" src/auth`
Expected: aparece en `login` (~L94) y `loginGoogle` (~L142). Revisar tambien el flujo de `register` por si devuelve `user`; si lo hace, se trata igual.

- [ ] **Step 4: Incluir el flag en el include y en el objeto user (login)**

En `auth.service.ts`, el `findFirst`/`findUnique` del usuario en `login` incluye `consultorio: { select: { nombre: true } }`. Cambiarlo a:

```typescript
      include: { consultorio: { select: { nombre: true, trabajaConAseguradoras: true } } },
```

Y en el objeto `user` que retorna `login` (despues de `consultorioNombre: usuario.consultorio.nombre,`):

```typescript
        trabajaConAseguradoras: usuario.consultorio.trabajaConAseguradoras,
```

- [ ] **Step 5: Repetir en loginGoogle (y register si aplica)**

En `loginGoogle`, el include ya es `consultorio: { select: { nombre: true } }` (L120): agregar `trabajaConAseguradoras: true`. Y en su objeto `user` agregar la misma linea `trabajaConAseguradoras: usuario.consultorio.trabajaConAseguradoras,`. Si `register` devuelve un `user`, aplicar identico (incluir el campo en el consultorio recien creado: como recien se crea con default `false`, devolver `false`).

- [ ] **Step 6: Verificar compilacion**

Run: `cd apps/api && npx tsc --noEmit`
Expected: PASS. (Si falla por `trabajaConAseguradoras` faltante en algun objeto user, completarlo.)

- [ ] **Step 7: Commit**

```bash
git add packages/types/src/api/index.ts packages/types/dist apps/api/src/auth/auth.service.ts
git commit -m "feat(aseguradoras): exponer trabajaConAseguradoras en AuthUser (F1)"
```

---

### Task 3: Consultorio — flag en DTO y select

**Files:**
- Modify: `apps/api/src/modules/consultorios/consultorios.service.ts` (DTO + `CONSULTORIO_SELECT`)

**Interfaces:**
- Produces: `GET /consultorio` y `PUT /consultorio` devuelven `trabajaConAseguradoras`; `PUT` acepta el booleano.

- [ ] **Step 1: Agregar el campo al DTO**

En `UpdateConsultorioDto` (consultorios.service.ts), despues de `emailCierreCaja`:

```typescript
  @IsBoolean() @IsOptional()
  trabajaConAseguradoras?: boolean
```

(`IsBoolean` ya esta importado de class-validator en este archivo.)

- [ ] **Step 2: Agregar el campo a CONSULTORIO_SELECT**

En `CONSULTORIO_SELECT`, agregar `trabajaConAseguradoras: true,` (junto a `emailCierreCaja: true`).

- [ ] **Step 3: Verificar compilacion**

Run: `cd apps/api && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/consultorios/consultorios.service.ts
git commit -m "feat(aseguradoras): consultorio acepta/expone trabajaConAseguradoras (F1)"
```

---

### Task 4: Modulo API `aseguradoras` — CRUD Aseguradora

**Files:**
- Create: `apps/api/src/modules/aseguradoras/aseguradoras.service.ts`
- Create: `apps/api/src/modules/aseguradoras/aseguradoras.controller.ts`
- Create: `apps/api/src/modules/aseguradoras/aseguradoras.module.ts`
- Modify: `apps/api/src/app.module.ts` (registrar `AseguradorasModule`)

**Interfaces:**
- Produces (REST):
  - `GET /aseguradoras` (ADMIN, todas incl. inactivas)
  - `GET /aseguradoras/activas` (cualquier rol operativo, solo activas)
  - `POST /aseguradoras` (ADMIN)
  - `PUT /aseguradoras/:id` (ADMIN)
  - `DELETE /aseguradoras/:id` (ADMIN) -> `{ eliminado: boolean, enUso?, aseguradora? }`
- Produces (clases para Tasks 5-6): `AseguradorasService` (se le suman metodos de categoria/tarifa), `CreateAseguradoraDto`, `UpdateAseguradoraDto`.

- [ ] **Step 1: Crear el service con CRUD de Aseguradora**

Crear `apps/api/src/modules/aseguradoras/aseguradoras.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common'
import { IsString, IsNotEmpty, IsOptional, IsEmail, IsBoolean, ValidateIf, MaxLength } from 'class-validator'
import { PartialType } from '@nestjs/swagger'
import { PrismaService } from '../../prisma/prisma.service'

export class CreateAseguradoraDto {
  @IsString() @IsNotEmpty() @MaxLength(120)
  nombre: string

  @IsString() @IsOptional() @MaxLength(120)
  contacto?: string

  @IsString() @IsOptional() @MaxLength(40)
  telefono?: string

  @ValidateIf((o) => o.email !== '' && o.email != null)
  @IsEmail() @IsOptional()
  email?: string

  @IsString() @IsOptional() @MaxLength(500)
  observaciones?: string
}

export class UpdateAseguradoraDto extends PartialType(CreateAseguradoraDto) {
  @IsBoolean() @IsOptional()
  activa?: boolean
}

@Injectable()
export class AseguradorasService {
  constructor(private prisma: PrismaService) {}

  findAll(consultorioId: number, incluirInactivas = false) {
    return this.prisma.aseguradora.findMany({
      where: { consultorioId, ...(incluirInactivas ? {} : { activa: true }) },
      orderBy: { nombre: 'asc' },
    })
  }

  create(consultorioId: number, dto: CreateAseguradoraDto) {
    return this.prisma.aseguradora.create({ data: { ...dto, consultorioId } })
  }

  async update(consultorioId: number, id: number, dto: UpdateAseguradoraDto) {
    const a = await this.prisma.aseguradora.findFirst({ where: { id, consultorioId } })
    if (!a) throw new NotFoundException()
    return this.prisma.aseguradora.update({ where: { id }, data: dto })
  }

  // Borrar si no tiene categorias; si las tiene, desactivar (las categorias
  // pueden estar referenciadas por pacientes/citas en fases posteriores).
  async remove(consultorioId: number, id: number) {
    const a = await this.prisma.aseguradora.findFirst({ where: { id, consultorioId } })
    if (!a) throw new NotFoundException()
    const conCategorias = await this.prisma.categoriaSeguro.count({ where: { aseguradoraId: id } })
    if (conCategorias > 0) {
      const aseguradora = await this.prisma.aseguradora.update({ where: { id }, data: { activa: false } })
      return { eliminado: false, enUso: true, aseguradora }
    }
    await this.prisma.aseguradora.delete({ where: { id } })
    return { eliminado: true }
  }
}
```

- [ ] **Step 2: Crear el controller**

Crear `apps/api/src/modules/aseguradoras/aseguradoras.controller.ts`:

```typescript
import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { AseguradorasService, CreateAseguradoraDto, UpdateAseguradoraDto } from './aseguradoras.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { Rol } from '@pos/types'

@ApiTags('Aseguradoras')
@ApiBearerAuth()
@Controller('aseguradoras')
export class AseguradorasController {
  constructor(private service: AseguradorasService) {}

  // Dropdown de seleccion (pacientes/citas en F2): cualquier rol operativo
  @Get('activas')
  activas(@CurrentUser() user: JwtPayload) {
    return this.service.findAll(user.consultorioId, false)
  }

  @Get()
  @Roles(Rol.ADMIN)
  findAll(@CurrentUser() user: JwtPayload, @Query('todos') todos?: string) {
    return this.service.findAll(user.consultorioId, todos === 'true')
  }

  @Post()
  @Roles(Rol.ADMIN)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateAseguradoraDto) {
    return this.service.create(user.consultorioId, dto)
  }

  @Put(':id')
  @Roles(Rol.ADMIN)
  update(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAseguradoraDto) {
    return this.service.update(user.consultorioId, id, dto)
  }

  @Delete(':id')
  @Roles(Rol.ADMIN)
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(user.consultorioId, id)
  }
}
```

- [ ] **Step 3: Crear el module**

Crear `apps/api/src/modules/aseguradoras/aseguradoras.module.ts` (los controllers de Tasks 5-6 se agregan en sus tasks):

```typescript
import { Module } from '@nestjs/common'
import { AseguradorasController } from './aseguradoras.controller'
import { AseguradorasService } from './aseguradoras.service'

@Module({ controllers: [AseguradorasController], providers: [AseguradorasService] })
export class AseguradorasModule {}
```

- [ ] **Step 4: Registrar el modulo en AppModule**

En `apps/api/src/app.module.ts`, importar `AseguradorasModule` y agregarlo al array `imports` (junto a `TiposGastoModule`).

- [ ] **Step 5: Verificar compilacion**

Run: `cd apps/api && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/aseguradoras apps/api/src/app.module.ts
git commit -m "feat(aseguradoras): modulo API + CRUD de aseguradora (F1)"
```

---

### Task 5: API — CRUD CategoriaSeguro

**Files:**
- Modify: `apps/api/src/modules/aseguradoras/aseguradoras.service.ts` (metodos de categoria + DTOs)
- Create: `apps/api/src/modules/aseguradoras/categorias-seguro.controller.ts`
- Modify: `apps/api/src/modules/aseguradoras/aseguradoras.module.ts` (registrar controller)

**Interfaces:**
- Consumes: `AseguradorasService`, `PrismaService`.
- Produces (REST):
  - `GET /categorias-seguro?aseguradoraId=N` (ADMIN: todas; `?soloActivas=true` para dropdown)
  - `POST /categorias-seguro` (ADMIN) body `{ aseguradoraId, nombre, porcentajeCobertura }`
  - `PUT /categorias-seguro/:id` (ADMIN)
  - `DELETE /categorias-seguro/:id` (ADMIN) -> `{ eliminado, enUso?, categoria? }`

- [ ] **Step 1: Agregar DTOs + metodos al service**

En `aseguradoras.service.ts`, agregar imports `IsInt`, `IsNumber`, `Min`, `Max`, `Type` y los DTOs + metodos:

```typescript
// (agregar a los imports de class-validator: IsInt, IsNumber, Min, Max)
// (import { Type } from 'class-transformer')

export class CreateCategoriaSeguroDto {
  @Type(() => Number) @IsInt()
  aseguradoraId: number

  @IsString() @IsNotEmpty() @MaxLength(80)
  nombre: string

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100)
  porcentajeCobertura: number
}

// Base nombrada (sin aseguradoraId: la categoria no se mueve de aseguradora)
export class CategoriaSeguroBaseDto {
  @IsString() @IsNotEmpty() @MaxLength(80)
  nombre: string

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100)
  porcentajeCobertura: number
}

export class UpdateCategoriaSeguroDto extends PartialType(CategoriaSeguroBaseDto) {
  @IsBoolean() @IsOptional()
  activa?: boolean
}
```

Y los metodos (dentro de `AseguradorasService`):

```typescript
  async findCategorias(consultorioId: number, aseguradoraId: number, soloActivas = false) {
    return this.prisma.categoriaSeguro.findMany({
      where: { consultorioId, aseguradoraId, ...(soloActivas ? { activa: true } : {}) },
      orderBy: { nombre: 'asc' },
    })
  }

  async createCategoria(consultorioId: number, dto: CreateCategoriaSeguroDto) {
    // La aseguradora debe ser del mismo consultorio (no confiar en el body)
    const aseg = await this.prisma.aseguradora.findFirst({
      where: { id: dto.aseguradoraId, consultorioId },
      select: { id: true },
    })
    if (!aseg) throw new NotFoundException('Aseguradora inexistente')
    return this.prisma.categoriaSeguro.create({
      data: {
        consultorioId,
        aseguradoraId: dto.aseguradoraId,
        nombre: dto.nombre,
        porcentajeCobertura: dto.porcentajeCobertura,
      },
    })
  }

  async updateCategoria(consultorioId: number, id: number, dto: UpdateCategoriaSeguroDto) {
    const c = await this.prisma.categoriaSeguro.findFirst({ where: { id, consultorioId } })
    if (!c) throw new NotFoundException()
    return this.prisma.categoriaSeguro.update({ where: { id }, data: dto })
  }

  async removeCategoria(consultorioId: number, id: number) {
    const c = await this.prisma.categoriaSeguro.findFirst({ where: { id, consultorioId } })
    if (!c) throw new NotFoundException()
    const conTarifas = await this.prisma.tarifaCobertura.count({ where: { categoriaSeguroId: id } })
    if (conTarifas > 0) {
      const categoria = await this.prisma.categoriaSeguro.update({ where: { id }, data: { activa: false } })
      return { eliminado: false, enUso: true, categoria }
    }
    await this.prisma.categoriaSeguro.delete({ where: { id } })
    return { eliminado: true }
  }
```

- [ ] **Step 2: Crear el controller de categorias**

Crear `apps/api/src/modules/aseguradoras/categorias-seguro.controller.ts`:

```typescript
import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { AseguradorasService, CreateCategoriaSeguroDto, UpdateCategoriaSeguroDto } from './aseguradoras.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { Rol } from '@pos/types'

@ApiTags('CategoriasSeguro')
@ApiBearerAuth()
@Controller('categorias-seguro')
export class CategoriasSeguroController {
  constructor(private service: AseguradorasService) {}

  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('aseguradoraId', ParseIntPipe) aseguradoraId: number,
    @Query('soloActivas') soloActivas?: string,
  ) {
    return this.service.findCategorias(user.consultorioId, aseguradoraId, soloActivas === 'true')
  }

  @Post()
  @Roles(Rol.ADMIN)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateCategoriaSeguroDto) {
    return this.service.createCategoria(user.consultorioId, dto)
  }

  @Put(':id')
  @Roles(Rol.ADMIN)
  update(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCategoriaSeguroDto) {
    return this.service.updateCategoria(user.consultorioId, id, dto)
  }

  @Delete(':id')
  @Roles(Rol.ADMIN)
  remove(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.service.removeCategoria(user.consultorioId, id)
  }
}
```

- [ ] **Step 3: Registrar el controller en el module**

En `aseguradoras.module.ts`, agregar `CategoriasSeguroController` al array `controllers`.

- [ ] **Step 4: Verificar compilacion**

Run: `cd apps/api && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/aseguradoras
git commit -m "feat(aseguradoras): CRUD de categorias/planes (F1)"
```

---

### Task 6: API — Tarifario (bulk upsert)

**Files:**
- Modify: `apps/api/src/modules/aseguradoras/aseguradoras.service.ts` (metodos de tarifa + DTO)
- Create: `apps/api/src/modules/aseguradoras/tarifas-cobertura.controller.ts`
- Modify: `apps/api/src/modules/aseguradoras/aseguradoras.module.ts`

**Interfaces:**
- Produces (REST):
  - `GET /tarifas-cobertura?categoriaSeguroId=N` (ADMIN) -> `TarifaCobertura[]`
  - `PUT /tarifas-cobertura` (ADMIN) body `{ categoriaSeguroId, tarifas: { servicioId, montoPaciente, montoAseguradora }[] }` -> upsert por (categoria, servicio); celdas omitidas no se tocan.

- [ ] **Step 1: Agregar DTO + metodos al service**

En `aseguradoras.service.ts` agregar (`ValidateNested`, `ArrayMaxSize` de class-validator):

```typescript
export class TarifaItemDto {
  @Type(() => Number) @IsInt()
  servicioId: number

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  montoPaciente: number

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  montoAseguradora: number
}

export class SetTarifasDto {
  @Type(() => Number) @IsInt()
  categoriaSeguroId: number

  @ValidateNested({ each: true }) @Type(() => TarifaItemDto) @ArrayMaxSize(500)
  tarifas: TarifaItemDto[]
}
```

Metodos:

```typescript
  findTarifas(consultorioId: number, categoriaSeguroId: number) {
    return this.prisma.tarifaCobertura.findMany({
      where: { consultorioId, categoriaSeguroId },
      orderBy: { servicioId: 'asc' },
    })
  }

  async setTarifas(consultorioId: number, dto: SetTarifasDto) {
    const cat = await this.prisma.categoriaSeguro.findFirst({
      where: { id: dto.categoriaSeguroId, consultorioId },
      select: { id: true },
    })
    if (!cat) throw new NotFoundException('Categoria inexistente')
    // Solo upsert de las celdas enviadas. Un upsert por servicio en transaccion.
    await this.prisma.$transaction(
      dto.tarifas.map((t) =>
        this.prisma.tarifaCobertura.upsert({
          where: { categoriaSeguroId_servicioId: { categoriaSeguroId: dto.categoriaSeguroId, servicioId: t.servicioId } },
          create: {
            consultorioId,
            categoriaSeguroId: dto.categoriaSeguroId,
            servicioId: t.servicioId,
            montoPaciente: t.montoPaciente,
            montoAseguradora: t.montoAseguradora,
          },
          update: { montoPaciente: t.montoPaciente, montoAseguradora: t.montoAseguradora, activa: true },
        }),
      ),
    )
    return this.findTarifas(consultorioId, dto.categoriaSeguroId)
  }
```

- [ ] **Step 2: Crear el controller**

Crear `apps/api/src/modules/aseguradoras/tarifas-cobertura.controller.ts`:

```typescript
import { Controller, Get, Put, Body, Query, ParseIntPipe } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { AseguradorasService, SetTarifasDto } from './aseguradoras.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { Rol } from '@pos/types'

@ApiTags('TarifasCobertura')
@ApiBearerAuth()
@Controller('tarifas-cobertura')
export class TarifasCoberturaController {
  constructor(private service: AseguradorasService) {}

  @Get()
  @Roles(Rol.ADMIN)
  findAll(@CurrentUser() user: JwtPayload, @Query('categoriaSeguroId', ParseIntPipe) categoriaSeguroId: number) {
    return this.service.findTarifas(user.consultorioId, categoriaSeguroId)
  }

  @Put()
  @Roles(Rol.ADMIN)
  setTarifas(@CurrentUser() user: JwtPayload, @Body() dto: SetTarifasDto) {
    return this.service.setTarifas(user.consultorioId, dto)
  }
}
```

- [ ] **Step 3: Registrar el controller**

En `aseguradoras.module.ts`, agregar `TarifasCoberturaController` a `controllers`.

- [ ] **Step 4: Verificar compilacion**

Run: `cd apps/api && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/aseguradoras
git commit -m "feat(aseguradoras): tarifario por categoria+servicio (F1)"
```

---

### Task 7: Frontend — toggle en Configuracion + propagacion al store

**Files:**
- Modify: `apps/web/src/features/configuracion/ConfiguracionPage.tsx`

**Interfaces:**
- Consumes: `GET/PUT /consultorio` con `trabajaConAseguradoras` (Task 3); `useAuthStore().setUser`.
- Produces: el admin puede prender/apagar el modulo; el auth store se actualiza al instante.

- [ ] **Step 1: Sumar el campo al type y al estado del form**

En `ConfiguracionPage.tsx`: agregar `trabajaConAseguradoras: boolean` al type `Consultorio`; agregar `trabajaConAseguradoras: false` al estado inicial `consForm`; en el `useEffect` que hidrata el form, agregar `trabajaConAseguradoras: consultorio.trabajaConAseguradoras ?? false,`; en el body del `updateConsultorio.mutate`, incluir `trabajaConAseguradoras: data.trabajaConAseguradoras`.

- [ ] **Step 2: Refrescar el auth store en onSuccess**

Importar el store: `import { useAuthStore } from '../../stores/auth.store'`. Dentro del componente: `const user = useAuthStore((s) => s.user); const setUser = useAuthStore((s) => s.setUser)`. En `updateConsultorio` cambiar la firma del mutation a que devuelva la respuesta y en `onSuccess` recibir `(res)`:

```typescript
  const updateConsultorio = useMutation({
    mutationFn: (data: typeof consForm) =>
      api.put('/consultorio', { /* ...campos existentes... */
        trabajaConAseguradoras: data.trabajaConAseguradoras,
      }).then((r) => r.data),
    onSuccess: (cons) => {
      qc.invalidateQueries({ queryKey: ['consultorio'] })
      setMonedaActual(consForm.moneda)
      // Propagar el flag al auth store (no hay /auth/me): el admin lo ve sin re-login
      if (user) setUser({ ...user, trabajaConAseguradoras: cons.trabajaConAseguradoras })
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2000)
    },
  })
```

- [ ] **Step 3: Agregar el switch-container "Trabaja con aseguradoras"**

En la tab `consultorio`, agregar una seccion `border-t pt-4` (antes del boton "Guardar cambios"). Reutilizar el patron switch-container de `DoctorModal.tsx` (boton `role="switch"`, fila clickeable >=44px, helper que explica). UI: pasar antes por los skills impeccable + ui-ux-pro-max + frontend-design. Estructura:

```tsx
<div className="border-t pt-4">
  <button
    type="button"
    role="switch"
    aria-checked={consForm.trabajaConAseguradoras}
    onClick={() => setConsForm((f) => ({ ...f, trabajaConAseguradoras: !f.trabajaConAseguradoras }))}
    className={cn(
      'flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60',
      consForm.trabajaConAseguradoras ? 'border-input bg-card hover:bg-muted/40' : 'border-input bg-muted/40 hover:bg-muted/60',
    )}
  >
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-medium text-foreground">Trabaja con aseguradoras</span>
      <span className="mt-0.5 block text-xs text-muted-foreground">
        Habilita el catálogo de aseguradoras, la cobertura por cita y las liquidaciones. Si lo apagás, el módulo queda oculto.
      </span>
    </span>
    <span aria-hidden="true" className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200', consForm.trabajaConAseguradoras ? 'bg-primary' : 'bg-muted-foreground/30')}>
      <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200', consForm.trabajaConAseguradoras ? 'translate-x-[22px]' : 'translate-x-0.5')} />
    </span>
  </button>
  <p className="text-xs text-muted-foreground mt-1.5">Se aplica al guardar.</p>
</div>
```

- [ ] **Step 4: Verificar compilacion web**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/configuracion/ConfiguracionPage.tsx
git commit -m "feat(aseguradoras): toggle en Configuracion + propagacion al auth store (F1)"
```

---

### Task 8: Frontend — tab "Aseguradoras" en Catalogo (lista + alta/edicion)

**Files:**
- Create: `apps/web/src/features/catalogo/AseguradorasPanel.tsx`
- Create: `apps/web/src/features/catalogo/AseguradoraModal.tsx`
- Modify: `apps/web/src/features/catalogo/CatalogoPage.tsx` (tab condicional)

**Interfaces:**
- Consumes: `GET /aseguradoras?todos=true`, `POST/PUT/DELETE /aseguradoras`; `useAuthStore().user.trabajaConAseguradoras`.
- Produces: `AseguradorasPanel` (tab content), `AseguradoraModal` (form alta/edicion).

- [ ] **Step 1: Crear AseguradoraModal**

Crear `apps/web/src/features/catalogo/AseguradoraModal.tsx` siguiendo el patron de modal del proyecto (ModalHeader + FloatingInput/Textarea + mutation, ver `DoctorModal.tsx`/`TipoGastoModal.tsx`). Campos: nombre (required), contacto, telefono, email, observaciones (textarea); en edicion, el switch-container "Aseguradora activa" arriba (mismo patron que DoctorModal). `onSuccess`: `qc.invalidateQueries({ queryKey: ['aseguradoras'] }); onClose()`. UI por skills antes del JSX. queryKey de invalidacion: `['aseguradoras']`.

- [ ] **Step 2: Crear AseguradorasPanel (lista)**

Crear `apps/web/src/features/catalogo/AseguradorasPanel.tsx`: tabla de aseguradoras (columnas: Nombre, Contacto, Teléfono, Estado, acciones editar + "Categorías y tarifario") con el patron de tabla de `CatalogoPage` (cardUI + thead bg-muted/50). Query `['aseguradoras','todos'] -> GET /aseguradoras?todos=true`. Boton "Nueva aseguradora" abre `AseguradoraModal`. El boton "Categorías y tarifario" de cada fila navega al drill-in (Task 9; por ahora dejar el handler `onGestionar(aseguradora)` como prop o estado local que Task 9 consume). EmptyState con icono `ShieldCheck` (lucide) cuando no hay aseguradoras. DELETE via ConfirmarModal: si `res.eliminado === false`, avisar que se desactivo por tener categorias.

- [ ] **Step 3: Enganchar la tab condicional en CatalogoPage**

En `CatalogoPage.tsx`: leer `const trabajaConAseguradoras = useAuthStore((s) => s.user?.trabajaConAseguradoras)`. Extender el union del estado `tab` a incluir `'aseguradoras'`. Agregar al array `TABS` (despues de finanzas): `...(esAdmin && trabajaConAseguradoras ? [{ id: 'aseguradoras' as const, label: 'Aseguradoras' }] : [])`. Render: `{tab === 'aseguradoras' && esAdmin && trabajaConAseguradoras && <AseguradorasPanel />}`.

- [ ] **Step 4: Verificar compilacion web**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/catalogo
git commit -m "feat(aseguradoras): tab Catalogo con lista y alta/edicion (F1)"
```

---

### Task 9: Frontend — drill-in categorias + grilla de tarifario

**Files:**
- Create: `apps/web/src/features/catalogo/CategoriaSeguroModal.tsx`
- Create: `apps/web/src/features/catalogo/TarifarioPanel.tsx`
- Modify: `apps/web/src/features/catalogo/AseguradorasPanel.tsx` (drill-in a una aseguradora)

**Interfaces:**
- Consumes: `GET /categorias-seguro?aseguradoraId=`, `POST/PUT/DELETE /categorias-seguro`, `GET /tarifas-cobertura?categoriaSeguroId=`, `PUT /tarifas-cobertura`, `GET /servicios?todos=true`.

- [ ] **Step 1: Drill-in en AseguradorasPanel**

Estado `const [gestion, setGestion] = useState<Aseguradora | null>(null)`. Cuando `gestion` esta seteada, mostrar la vista de gestion (boton "← Volver", titulo con el nombre de la aseguradora) en vez de la tabla; debajo: seccion Categorías + seccion Tarifario.

- [ ] **Step 2: Crear CategoriaSeguroModal**

Crear `CategoriaSeguroModal.tsx`: form con nombre (required) + porcentajeCobertura (number 0-100, tabular-nums) + switch activa (en edicion). En alta envia `aseguradoraId` (de la aseguradora en gestion). `onSuccess`: invalidar `['categorias-seguro', aseguradoraId]`. UI por skills.

- [ ] **Step 3: Seccion Categorías dentro de la gestion**

En la vista de gestion: query `['categorias-seguro', gestion.id] -> GET /categorias-seguro?aseguradoraId=${gestion.id}`. Tabla (nombre, % cobertura, estado, acciones editar/eliminar + seleccionar para tarifario). Boton "Nueva categoría". DELETE via ConfirmarModal (si `eliminado:false`, avisar que se desactivo por tener tarifas).

- [ ] **Step 4: Crear TarifarioPanel (grilla categoria seleccionada x servicios)**

Crear `TarifarioPanel.tsx`. Props: `categoriaSeguroId`. Queries: `['servicios','todos'] -> GET /servicios?todos=true` y `['tarifas-cobertura', categoriaSeguroId] -> GET /tarifas-cobertura?categoriaSeguroId=`. Render: por cada servicio activo una fila con nombre + input `montoPaciente` + input `montoAseguradora` (number, inputMode decimal, tabular-nums, mismo estilo que la grilla de precios de `DoctorModal.tsx`), precargados desde la tarifa existente. Estado local `Record<servicioId, { montoPaciente: string; montoAseguradora: string }>`. Boton "Guardar tarifario": arma `tarifas` con las filas donde AMBOS montos estan cargados (no-vacios) y hace `PUT /tarifas-cobertura` con `{ categoriaSeguroId, tarifas }`. `onSuccess`: invalidar `['tarifas-cobertura', categoriaSeguroId]`. Contenedor scrolleable (`max-h-*` + overflow) por la cantidad de servicios. UI por skills.

- [ ] **Step 5: Verificar compilacion web**

Run: `cd apps/web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/catalogo
git commit -m "feat(aseguradoras): categorias + grilla de tarifario (F1)"
```

---

### Task 10: Gate de regresion `gate-aseguradoras.ps1`

**Files:**
- Create: `scripts/gate-aseguradoras.ps1`

**Interfaces:**
- Consumes: la API corriendo en `:3000` (la levanta el owner). Crea su propio tenant via `/auth/register`.

- [ ] **Step 1: Escribir el gate**

Crear `scripts/gate-aseguradoras.ps1` siguiendo el patron de `scripts/gate-tipos-gasto-cuenta.ps1` (helper `Esperar-Error`, register+login, header `$h`). Casos a cubrir:

1. Tras register, `GET /consultorio` -> `trabajaConAseguradoras = False` (default).
2. `PUT /consultorio { trabajaConAseguradoras = $true }` -> el body de respuesta trae `trabajaConAseguradoras = True`.
3. El `user` del login ya trae el flag: re-login y verificar `$login.user.trabajaConAseguradoras` (False antes del cambio en un tenant nuevo).
4. `POST /aseguradoras { nombre = "BISA" }` -> crea; `GET /aseguradoras` -> count 1.
5. `POST /aseguradoras` sin nombre -> 400 (DTO invalido).
6. `POST /categorias-seguro { aseguradoraId, nombre = "Cat 80%", porcentajeCobertura = 80 }` -> crea.
7. `POST /categorias-seguro` con `porcentajeCobertura = 150` -> 400 (Max 100).
8. Crear un servicio (`POST /servicios`), luego `PUT /tarifas-cobertura { categoriaSeguroId, tarifas = @(@{ servicioId; montoPaciente = 0; montoAseguradora = 168 }) }` -> `GET /tarifas-cobertura?categoriaSeguroId=` trae 1 fila con `montoAseguradora = 168.00`.
9. `DELETE /aseguradoras/:id` con categorias -> `{ eliminado = $false, enUso = $true }` y queda `activa:false`.
10. Rol SECRETARIA: `POST /aseguradoras` -> 403; `GET /aseguradoras/activas` -> OK (lee activas).

Notas PS 5.1: envolver resultados en `@()` antes de `.Count`; arrays de tarifas con `@(@{...})` y `ConvertTo-Json -Depth 5`.

- [ ] **Step 2: (Owner) Correr el gate con la API en :3000**

Run: `pwsh scripts/gate-aseguradoras.ps1`
Expected: cada linea imprime `OK` o el valor esperado (esp ...). Sin `FALLO`.

- [ ] **Step 3: Commit**

```bash
git add scripts/gate-aseguradoras.ps1
git commit -m "test(aseguradoras): gate de catalogo + flag (F1)"
```

---

## Fases siguientes (planes propios, NO en este plan)

Cada fase se planifica con su propio doc cuando se llegue (writing-plans), reusando este spec:

- **F2 — Paciente + cita + cobro:** enum `EstadoLiquidacion` + modelo `LiquidacionItem` + campos de seguro en `Paciente` y snapshot en `Cita` (migracion aditiva); seccion "Seguro" en PacienteModal; bloque "Cobertura" en la cita; integracion transaccional con `Cobro` (`total = montoPaciente`) + creacion de `LiquidacionItem`; manejo de reprogramacion/cambio de servicio (citas.service ~L603) y cancelacion. Fallback particular si no hay tarifa.
- **F3 — Liquidaciones:** modulo API + pagina; filtros (aseguradora/fechas/estado/paciente); transiciones de estado (PENDIENTE->FACTURADO->PAGADO / RECHAZADO) con logs; generar liquidacion mensual; export PDF + Excel (`exceljs`; libreria PDF a definir en ese plan).
- **F4 — Reportes:** reportes Aseguradoras (atenciones/pacientes/ingresos/pendiente/cobrado/rechazado) + Cobertura (con/sin seguro, distribucion por aseguradora y categoria).

## Self-review (cobertura del spec en F1)

- Flag `trabajaConAseguradoras`: Tasks 1 (columna), 2 (AuthUser), 3 (DTO/select), 7 (toggle + store). OK.
- Acceso via auth store sin `/auth/me`: Task 7 (setUser desde la respuesta del PUT). OK.
- Catalogo Aseguradoras/Categorias/Tarifario: Tasks 4/5/6 (API), 8/9 (UI). OK.
- Borrar-si-no-usado / desactivar: Tasks 4/5 (service). OK.
- Placement tab al lado de "Tipos de gasto y cuenta", gated por flag + ADMIN: Task 8 Step 3. OK.
- Paciente/cita/cobro/liquidaciones/reportes: fuera de F1 por diseno (fases F2-F4). OK.
