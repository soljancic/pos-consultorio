# Notas manuscritas con lapiz — Plan de implementacion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el psicologo escriba la nota de sesion completa a mano con Apple Pencil o lapiz Android, en hojas A4 dentro del modal de Atencion, y pueda transcribirla a texto en el campo "Evolucion / notas".

**Architecture:** Los trazos se guardan como vectores (puntos con presion) en una tabla nueva `hojas_manuscritas` en Postgres, colgada de `Atencion`. Nunca se guarda una imagen: el dispositivo redibuja la hoja desde los trazos, tanto para editar como para ver en la historia clinica. Para transcribir, el cliente rasteriza la hoja a PNG y la manda al API, que llama a `claude-opus-5` y devuelve el texto; ese PNG es un intermedio de la request y no se persiste.

**Tech Stack:** NestJS + Prisma 7 + PostgreSQL · React 19 + Vite + TanStack Query v5 + Tailwind 4 · `perfect-freehand` v1.2.3 (trazos) · `@anthropic-ai/sdk` (transcripcion) · Pointer Events API.

**Spec:** `docs/superpowers/specs/2026-08-10-notas-manuscritas-design.md`

## Global Constraints

Estas reglas aplican a **todas** las tareas. Estan en `CLAUDE.md` y en `PLAN.md` §8b.

- `consultorioId` **siempre** sale del JWT (`@CurrentUser()`), **nunca** del body ni de los params. Todo `findFirst`/`findMany`/`update` filtra por `consultorioId`.
- Todo DTO necesita decoradores `class-validator` o el `ValidationPipe` global (whitelist + forbidNonWhitelisted) devuelve 400.
- Borrado siempre soft (`deletedAt`). Nunca `DELETE` de filas.
- Operaciones multi-tabla en `prisma.$transaction`. Acciones criticas escriben en la tabla `logs`.
- Roles: `@Roles(Rol.ADMIN)` con el enum de `@pos/types`, nunca strings.
- **Prohibido `window.confirm` / `alert` / `prompt`**. Usar los modales del design system (patron `ConfirmarModal`).
- **Copy visible al usuario en espanol CON acentos.** Identificadores de codigo sin acentos.
  **Esto incluye los mensajes de `BadRequestException` / `NotFoundException` / `ForbiddenException` del API**: el frontend los muestra tal cual con `toast.fromError`, asi que son copy visible. Decision del owner 2026-08-10, que ademas pidio corregir los mensajes ya existentes del modulo de atenciones (Task 3, Step 2).
- **Toda UI nueva o modificada pasa por los skills `impeccable` + `ui-ux-pro-max` + `frontend-design` ANTES de escribir el JSX.** Esta como paso explicito en cada tarea de UI.
- Tokens de `apps/web/src/lib/ui.ts` (`cardUI`, `inputUI`, `btnPrimaryUI`, `btnOutlineUI`, `btnIconUI`, `errorUI`). Touch targets >= 44px, `focus-visible` ring, color + forma (no solo color), transiciones 150-300ms.
- **La pagina nunca scrollea en X.** Contenido ancho en su propia caja `overflow-x-auto`.
- `queryKey` jerarquicas, nunca planas: `['hojas', citaId]`.
- Fechas: rangos UTC con strings `Z` en el API (`new Date(\`${fecha}T00:00:00Z\`)`). **Nunca `setHours()` en services.**
- **NO deployar a Railway.** Al terminar, avisar que queda listo; el owner decide.
- **NUNCA borrar datos de la BD de produccion.** Las migraciones de este plan son aditivas (crean tabla), seguras.
- Tras tocar `packages/types`: `cd packages/types && pnpm build` (obligatorio).
- Verificacion antes de cada commit: `cd apps/api && npx tsc --noEmit` y `cd apps/web && npx tsc --noEmit`.
- **Los gates `.ps1` los corre el owner**, no el agente: necesitan la API levantada y el agente no logra bootear `nest start:dev` en su shell. El agente los escribe y avisa.

### Constantes del dominio (valores exactos)

| Constante | Valor |
|---|---|
| Version del formato de trazos | `1` |
| Ancho logico de la hoja | `1240` |
| Alto logico de la hoja | `1754` |
| Maximo de hojas por atencion | `20` |
| Maximo de bytes del JSON de trazos | `2_097_152` (2 MB) |
| Maximo de puntos por trazo | `10_000` |
| Lado largo del PNG para OCR | `2576` px |
| Modelo de transcripcion por defecto | `claude-opus-5` |

---

## Estructura de archivos

**Crear:**

| Archivo | Responsabilidad |
|---|---|
| `packages/types/src/entities/manuscrito.ts` | Tipos y constantes compartidos entre api y web (`TrazosHoja`, `Trazo`, `PuntoTrazo`, limites). |
| `apps/api/src/modules/atenciones/manuscrito.validator.ts` | Funcion pura que valida el JSON de trazos y calcula el siguiente `orden`. Sin dependencias de Nest ni Prisma. |
| `apps/api/src/modules/atenciones/manuscrito.validator.spec.ts` | Unit tests de lo anterior. |
| `apps/api/src/modules/atenciones/hojas.service.ts` | CRUD de hojas manuscritas + DTOs. |
| `apps/api/src/modules/atenciones/transcripcion.service.ts` | Unica puerta hacia el proveedor de OCR. Cambiar de proveedor = tocar solo este archivo. |
| `apps/api/src/modules/atenciones/transcripcion.prompt.ts` | Construccion del prompt + resolucion del modelo desde env (puro, testeable). |
| `apps/api/src/modules/atenciones/transcripcion.prompt.spec.ts` | Unit tests de lo anterior. |
| `apps/web/src/components/manuscrito/HojaRenderer.tsx` | **Solo lectura.** Recibe `trazos` y los pinta en un canvas. Lo usan la miniatura, el visor y el editor. |
| `apps/web/src/components/manuscrito/dibujar.ts` | Funciones puras de dibujo (trazo -> path en canvas) y de cuantizacion de puntos. |
| `apps/web/src/components/manuscrito/borradorLocal.ts` | Persistencia en IndexedDB del borrador de la hoja en edicion. |
| `apps/web/src/components/manuscrito/rasterizar.ts` | Redibuja una hoja a PNG de 2576 px para mandar al OCR. |
| `apps/web/src/features/agenda/LienzoManuscrito.tsx` | Editor a pantalla completa: captura, herramientas, hojas, autoguardado. |
| `apps/web/src/features/agenda/HojasManuscritasPanel.tsx` | Bloque dentro de `AtencionModal`: boton de escribir, lista de hojas, boton de transcribir. |
| `scripts/gate-manuscrito.ps1` | Gate de API. |
| `apps/web/e2e/manuscrito.spec.ts` | E2E de Playwright. |

**Modificar:**

| Archivo | Cambio |
|---|---|
| `apps/api/prisma/schema.prisma` | `model HojaManuscrita` + relacion `hojas` en `Atencion`. |
| `apps/api/src/modules/atenciones/atenciones.controller.ts` | 5 rutas nuevas. |
| `apps/api/src/modules/atenciones/atenciones.module.ts` | Registrar `HojasService` y `TranscripcionService`. |
| `apps/api/.env.example` | `ANTHROPIC_API_KEY` y `TRANSCRIPCION_MODEL`. |
| `packages/types/src/entities/index.ts` | Reexportar `manuscrito`. |
| `apps/web/src/features/agenda/AtencionModal.tsx` | Montar `HojasManuscritasPanel` bajo el campo "Evolucion / notas". |
| `apps/web/src/features/pacientes/HistoriaClinicaTimeline.tsx` | Miniaturas de hojas en solo lectura. |
| `apps/web/package.json` | Dependencia `perfect-freehand`. |
| `apps/api/package.json` | Dependencia `@anthropic-ai/sdk`. |

---

## Task 1: Tipos compartidos y validador de trazos

Arranca por el nucleo puro: sin BD, sin red, sin React. Todo lo demas se apoya en esto.

**Files:**
- Create: `packages/types/src/entities/manuscrito.ts`
- Modify: `packages/types/src/entities/index.ts`
- Create: `apps/api/src/modules/atenciones/manuscrito.validator.ts`
- Test: `apps/api/src/modules/atenciones/manuscrito.validator.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `TrazosHoja = { v: number; w: number; h: number; strokes: Trazo[] }`
  - `Trazo = { c: string; s: number; p: PuntoTrazo[] }`
  - `PuntoTrazo = [number, number, number]` (x, y, presion)
  - `TRAZOS_VERSION: 1`, `HOJA_W: 1240`, `HOJA_H: 1754`, `MAX_HOJAS_POR_ATENCION: 20`, `MAX_TRAZOS_BYTES: 2097152`, `MAX_PUNTOS_POR_TRAZO: 10000`, `OCR_LADO_LARGO: 2576`, `COLORES_LAPIZ`, `GROSORES_LAPIZ`
  - `hojaVacia(): TrazosHoja`
  - `HojaManuscritaApi` — forma de la hoja tal como la devuelve la API (la usan Tasks 10, 12, 13, 14)
  - `validarTrazos(valor: unknown): TrazosHoja` — lanza `Error` con mensaje en espanol si algo no cumple.
  - `siguienteOrden(ordenesExistentes: number[]): number`

- [ ] **Step 1: Crear el archivo de tipos compartidos**

`packages/types/src/entities/manuscrito.ts`:

```typescript
// Notas manuscritas (2026-08-10). El formato se versiona con `v` para poder
// cambiarlo sin romper hojas ya guardadas.

/** [x, y, presion]. Coordenadas en espacio logico de la hoja, no en pixeles. */
export type PuntoTrazo = [number, number, number]

export interface Trazo {
  /** Color en hex, ej "#111827" */
  c: string
  /** Grosor base del trazo */
  s: number
  /** Puntos del trazo */
  p: PuntoTrazo[]
}

export interface TrazosHoja {
  /** Version del formato */
  v: number
  /** Ancho logico de la hoja */
  w: number
  /** Alto logico de la hoja */
  h: number
  strokes: Trazo[]
}

export const TRAZOS_VERSION = 1

/** A4 vertical a ~150dpi */
export const HOJA_W = 1240
export const HOJA_H = 1754

export const MAX_HOJAS_POR_ATENCION = 20
export const MAX_TRAZOS_BYTES = 2_097_152
export const MAX_PUNTOS_POR_TRAZO = 10_000

/** Lado largo del PNG que se manda a transcribir */
export const OCR_LADO_LARGO = 2576

export const COLORES_LAPIZ = ['#111827', '#1d4ed8', '#b91c1c'] as const
export const GROSORES_LAPIZ = [2, 4, 7] as const

export function hojaVacia(): TrazosHoja {
  return { v: TRAZOS_VERSION, w: HOJA_W, h: HOJA_H, strokes: [] }
}

/**
 * Forma en que la API devuelve una hoja. `trazos` viaja como JSON generico en
 * Prisma, asi que del lado del cliente hay que castearlo a TrazosHoja tras
 * leerlo (el server ya lo valido con validarTrazos al guardarlo).
 */
export interface HojaManuscritaApi {
  id: number
  atencionId: number
  orden: number
  trazos: TrazosHoja
  transcripcion: string | null
  transcritoAt: string | null
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 2: Reexportar desde el barrel de entities**

Agregar a `packages/types/src/entities/index.ts` (junto a los export existentes):

```typescript
export * from './manuscrito'
```

- [ ] **Step 3: Buildear @pos/types**

```bash
cd packages/types && pnpm build
```

Esperado: sin errores. **Obligatorio tras tocar tipos compartidos** o el api y el web no resuelven los nuevos simbolos.

- [ ] **Step 4: Escribir los tests que fallan**

`apps/api/src/modules/atenciones/manuscrito.validator.spec.ts`:

```typescript
import {
  HOJA_H,
  HOJA_W,
  MAX_PUNTOS_POR_TRAZO,
  MAX_TRAZOS_BYTES,
  TRAZOS_VERSION,
} from '@pos/types'
import { siguienteOrden, validarTrazos } from './manuscrito.validator'

function hojaValida() {
  return {
    v: TRAZOS_VERSION,
    w: HOJA_W,
    h: HOJA_H,
    strokes: [{ c: '#111827', s: 4, p: [[10, 20, 0.5], [11, 21, 0.6]] }],
  }
}

describe('validarTrazos', () => {
  it('acepta una hoja bien formada y la devuelve', () => {
    const hoja = hojaValida()
    expect(validarTrazos(hoja)).toEqual(hoja)
  })

  it('acepta una hoja sin trazos', () => {
    const hoja = { v: TRAZOS_VERSION, w: HOJA_W, h: HOJA_H, strokes: [] }
    expect(validarTrazos(hoja)).toEqual(hoja)
  })

  it('rechaza null y tipos que no son objeto', () => {
    expect(() => validarTrazos(null)).toThrow(/trazos/i)
    expect(() => validarTrazos('hola')).toThrow(/trazos/i)
    expect(() => validarTrazos([])).toThrow(/trazos/i)
  })

  it('rechaza una version desconocida', () => {
    expect(() => validarTrazos({ ...hojaValida(), v: 99 })).toThrow(/version/i)
  })

  it('rechaza dimensiones que no son las de la hoja', () => {
    expect(() => validarTrazos({ ...hojaValida(), w: 800 })).toThrow(/dimensiones/i)
    expect(() => validarTrazos({ ...hojaValida(), h: 100 })).toThrow(/dimensiones/i)
  })

  it('rechaza un color que no es hex de 6 digitos', () => {
    const hoja = hojaValida()
    hoja.strokes[0].c = 'red'
    expect(() => validarTrazos(hoja)).toThrow(/color/i)
  })

  it('rechaza un grosor fuera de rango', () => {
    const hoja = hojaValida()
    hoja.strokes[0].s = 0
    expect(() => validarTrazos(hoja)).toThrow(/grosor/i)
  })

  it('rechaza un punto que no es una tripleta numerica', () => {
    const hoja = hojaValida()
    hoja.strokes[0].p = [[10, 20] as never]
    expect(() => validarTrazos(hoja)).toThrow(/punto/i)
  })

  it('rechaza coordenadas fuera de la hoja', () => {
    const hoja = hojaValida()
    hoja.strokes[0].p = [[HOJA_W + 50, 20, 0.5]]
    expect(() => validarTrazos(hoja)).toThrow(/fuera/i)
  })

  it('rechaza una presion fuera de 0..1', () => {
    const hoja = hojaValida()
    hoja.strokes[0].p = [[10, 20, 3]]
    expect(() => validarTrazos(hoja)).toThrow(/presion/i)
  })

  it('rechaza un trazo con demasiados puntos', () => {
    const hoja = hojaValida()
    hoja.strokes[0].p = Array.from(
      { length: MAX_PUNTOS_POR_TRAZO + 1 },
      () => [1, 1, 0.5] as [number, number, number],
    )
    expect(() => validarTrazos(hoja)).toThrow(/puntos/i)
  })

  it('rechaza una hoja mas pesada que el tope', () => {
    // Un trazo por debajo del tope de puntos, repetido hasta pasar 2 MB.
    const trazo = {
      c: '#111827',
      s: 4,
      p: Array.from({ length: 5000 }, () => [1234.5, 1234.5, 0.55] as [number, number, number]),
    }
    const hoja = { v: TRAZOS_VERSION, w: HOJA_W, h: HOJA_H, strokes: Array.from({ length: 40 }, () => trazo) }
    expect(Buffer.byteLength(JSON.stringify(hoja))).toBeGreaterThan(MAX_TRAZOS_BYTES)
    expect(() => validarTrazos(hoja)).toThrow(/pesa/i)
  })
})

describe('siguienteOrden', () => {
  it('arranca en 1 cuando no hay hojas', () => {
    expect(siguienteOrden([])).toBe(1)
  })

  it('usa el maximo mas uno', () => {
    expect(siguienteOrden([1, 2, 3])).toBe(4)
  })

  // Regresion: una hoja borrada (soft delete) sigue ocupando su `orden` por el
  // @@unique([atencionId, orden]). Si se calculara sobre las hojas vivas, borrar
  // la ultima y crear otra chocaria contra la fila borrada.
  it('cuenta tambien los ordenes de hojas borradas', () => {
    expect(siguienteOrden([1, 2, 3 /* borrada */])).toBe(4)
  })

  it('no se rompe con ordenes desordenados o con huecos', () => {
    expect(siguienteOrden([5, 1, 3])).toBe(6)
  })
})
```

- [ ] **Step 5: Correr los tests y verificar que fallan**

```bash
cd apps/api && npx jest manuscrito.validator
```

Esperado: FAIL — `Cannot find module './manuscrito.validator'`.

- [ ] **Step 6: Implementar el validador**

`apps/api/src/modules/atenciones/manuscrito.validator.ts`:

```typescript
import {
  HOJA_H,
  HOJA_W,
  MAX_PUNTOS_POR_TRAZO,
  MAX_TRAZOS_BYTES,
  TRAZOS_VERSION,
  type TrazosHoja,
} from '@pos/types'

const HEX = /^#[0-9a-fA-F]{6}$/
// Margen de tolerancia: el trazo puede salirse un poco del borde al dibujar
// cerca del limite y no queremos rechazar una hoja legitima por 2 pixeles.
const MARGEN = 50

function esObjetoPlano(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Valida el JSON de trazos que manda el cliente. Lanza Error con mensaje en
 * espanol al primer problema. Funcion pura: no conoce Nest ni Prisma, para que
 * sea trivial de testear. El caller la envuelve en BadRequestException.
 */
export function validarTrazos(valor: unknown): TrazosHoja {
  if (!esObjetoPlano(valor)) {
    throw new Error('Los trazos deben ser un objeto')
  }
  if (valor.v !== TRAZOS_VERSION) {
    throw new Error(`Version de trazos no soportada (esperada ${TRAZOS_VERSION})`)
  }
  if (valor.w !== HOJA_W || valor.h !== HOJA_H) {
    throw new Error(`Dimensiones de hoja invalidas (esperadas ${HOJA_W}x${HOJA_H})`)
  }
  if (!Array.isArray(valor.strokes)) {
    throw new Error('Los trazos deben traer un arreglo strokes')
  }

  // El tope de peso se chequea primero sobre el JSON completo: es la defensa
  // real contra una fila patologica, independiente de cuantos trazos tenga.
  if (Buffer.byteLength(JSON.stringify(valor)) > MAX_TRAZOS_BYTES) {
    throw new Error('La hoja pesa mas de 2 MB')
  }

  for (const trazo of valor.strokes) {
    if (!esObjetoPlano(trazo)) {
      throw new Error('Cada trazo debe ser un objeto')
    }
    if (typeof trazo.c !== 'string' || !HEX.test(trazo.c)) {
      throw new Error('Color de trazo invalido (se espera hex de 6 digitos)')
    }
    if (typeof trazo.s !== 'number' || !Number.isFinite(trazo.s) || trazo.s <= 0 || trazo.s > 64) {
      throw new Error('Grosor de trazo invalido')
    }
    if (!Array.isArray(trazo.p)) {
      throw new Error('Cada trazo debe traer un arreglo de puntos')
    }
    if (trazo.p.length > MAX_PUNTOS_POR_TRAZO) {
      throw new Error(`Un trazo supera el maximo de ${MAX_PUNTOS_POR_TRAZO} puntos`)
    }
    for (const punto of trazo.p) {
      if (!Array.isArray(punto) || punto.length !== 3 || !punto.every((n) => typeof n === 'number' && Number.isFinite(n))) {
        throw new Error('Cada punto debe ser [x, y, presion] numerico')
      }
      const [x, y, presion] = punto as [number, number, number]
      if (x < -MARGEN || x > HOJA_W + MARGEN || y < -MARGEN || y > HOJA_H + MARGEN) {
        throw new Error('Hay un punto fuera de la hoja')
      }
      if (presion < 0 || presion > 1) {
        throw new Error('La presion debe estar entre 0 y 1')
      }
    }
  }

  return valor as unknown as TrazosHoja
}

/**
 * Siguiente `orden` para una hoja nueva.
 *
 * OJO: recibe los ordenes de TODAS las filas de la atencion, incluidas las que
 * tienen deletedAt. Una hoja borrada sigue ocupando su `orden` por el
 * @@unique([atencionId, orden]); calcular sobre las vivas chocaria contra ella.
 */
export function siguienteOrden(ordenesExistentes: number[]): number {
  if (ordenesExistentes.length === 0) return 1
  return Math.max(...ordenesExistentes) + 1
}
```

- [ ] **Step 7: Correr los tests y verificar que pasan**

```bash
cd apps/api && npx jest manuscrito.validator
```

Esperado: PASS, 15 tests.

- [ ] **Step 8: Typecheck**

```bash
cd apps/api && npx tsc --noEmit
cd apps/web && npx tsc --noEmit
```

Esperado: sin errores en ninguno.

- [ ] **Step 9: Commit**

```bash
git add packages/types/src/entities/manuscrito.ts packages/types/src/entities/index.ts apps/api/src/modules/atenciones/manuscrito.validator.ts apps/api/src/modules/atenciones/manuscrito.validator.spec.ts
git commit -m "feat(manuscrito): tipos compartidos y validador de trazos"
```

---

## Task 2: Schema Prisma y migracion

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (bloque `model Atencion`, ~linea 381)

**Interfaces:**
- Consumes: nada.
- Produces: modelo Prisma `HojaManuscrita` con campos `id`, `atencionId`, `orden`, `trazos`, `transcripcion`, `transcritoAt`, `createdAt`, `updatedAt`, `deletedAt`. Cliente Prisma expone `prisma.hojaManuscrita`.

- [ ] **Step 1: Agregar la relacion en Atencion**

En `apps/api/prisma/schema.prisma`, dentro de `model Atencion`, junto a `recetas Receta[]`:

```prisma
  recetas Receta[]
  hojas   HojaManuscrita[]
```

- [ ] **Step 2: Agregar el modelo nuevo**

Justo despues de `model Receta` (antes del separador `─── FINANCIERO ───`):

```prisma
// Notas manuscritas (2026-08-10): el doctor escribe la sesion a mano con lapiz.
// Se guardan los TRAZOS (vectores con presion), no una imagen: durable en
// Postgres, editable, liviano y redibujable en cualquier resolucion.
model HojaManuscrita {
  id            Int       @id @default(autoincrement())
  atencionId    Int
  atencion      Atencion  @relation(fields: [atencionId], references: [id])
  // Numero de hoja dentro de la atencion. Lo asigna el server (max + 1 sobre
  // TODAS las filas, incluidas las borradas: el @@unique las sigue ocupando).
  orden         Int
  // { v, w, h, strokes: [{ c, s, p: [[x, y, presion]] }] } — ver @pos/types
  trazos        Json
  // Ultimo texto devuelto por el OCR. Se guarda para auditoria; el texto que el
  // doctor edita vive en Atencion.evolucion.
  transcripcion String?
  transcritoAt  DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  @@unique([atencionId, orden])
  // FK de cobertura (claude-db M11): hojas por atencion
  @@index([atencionId])
  @@map("hojas_manuscritas")
}
```

- [ ] **Step 3: Crear y aplicar la migracion**

```bash
cd apps/api && npx prisma migrate dev --name add_hojas_manuscritas
```

Esperado: crea `apps/api/prisma/migrations/<timestamp>_add_hojas_manuscritas/migration.sql` con un `CREATE TABLE "hojas_manuscritas"` y sus indices. **Migracion aditiva**: no toca ni borra nada existente.

- [ ] **Step 4: Verificar que la migracion no es destructiva**

```bash
cd apps/api && cat prisma/migrations/*_add_hojas_manuscritas/migration.sql
```

Esperado: solo `CREATE TABLE`, `CREATE UNIQUE INDEX`, `CREATE INDEX` y `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY`. **Si aparece cualquier `DROP` o `ALTER COLUMN`, parar y avisar al owner** — la regla de oro del proyecto prohibe migraciones destructivas.

- [ ] **Step 5: Regenerar el cliente de Prisma**

```bash
cd apps/api && npx prisma generate
```

- [ ] **Step 6: Typecheck**

```bash
cd apps/api && npx tsc --noEmit
```

Esperado: sin errores. `prisma.hojaManuscrita` ya existe en el cliente.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(manuscrito): tabla hojas_manuscritas (migracion aditiva)"
```

---

## Task 3: Service CRUD de hojas

**Files:**
- Create: `apps/api/src/modules/atenciones/hojas.service.ts`

**Interfaces:**
- Consumes: `validarTrazos`, `siguienteOrden` (Task 1); `prisma.hojaManuscrita` (Task 2); `AtencionesService.citaConGuardDeEscritura(consultorioId, citaId, usuarioId, rol)` (existente, `atenciones.service.ts:63`).
- Produces:
  - `class GuardarHojaDto { trazos: unknown }`
  - `HojasService.listar(consultorioId, citaId)`
  - `HojasService.crear(consultorioId, citaId, dto, usuarioId, rol)`
  - `HojasService.actualizar(consultorioId, citaId, hojaId, dto, usuarioId, rol)`
  - `HojasService.eliminar(consultorioId, citaId, hojaId, usuarioId, rol)`
  - `HojasService.hojaConGuardDeEscritura(consultorioId, citaId, hojaId, usuarioId, rol)` — usado por `TranscripcionService` en Task 5.

- [ ] **Step 1: Escribir el service**

`apps/api/src/modules/atenciones/hojas.service.ts`:

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { IsObject } from 'class-validator'
import { MAX_HOJAS_POR_ATENCION } from '@pos/types'
import { PrismaService } from '../../prisma/prisma.service'
import { AtencionesService } from './atenciones.service'
import { siguienteOrden, validarTrazos } from './manuscrito.validator'

export class GuardarHojaDto {
  // El shape fino lo valida validarTrazos(); class-validator solo garantiza que
  // llegue un objeto (sin decorador, el ValidationPipe global tira 400).
  @IsObject()
  trazos: unknown
}

@Injectable()
export class HojasService {
  constructor(
    private prisma: PrismaService,
    private atenciones: AtencionesService,
  ) {}

  /** Lectura abierta al staff del consultorio, igual que el resto de la atencion. */
  async listar(consultorioId: number, citaId: number) {
    const atencion = await this.prisma.atencion.findFirst({
      where: { citaId, cita: { consultorioId, deletedAt: null } },
      select: { id: true },
    })
    if (!atencion) return []
    return this.prisma.hojaManuscrita.findMany({
      where: { atencionId: atencion.id, deletedAt: null },
      orderBy: { orden: 'asc' },
    })
  }

  async crear(
    consultorioId: number,
    citaId: number,
    dto: GuardarHojaDto,
    usuarioId: number,
    rol: string,
  ) {
    const cita = await this.atenciones.citaConGuardDeEscritura(consultorioId, citaId, usuarioId, rol)
    if (!cita.atencion) {
      throw new BadRequestException('Registre la atencion antes de escribir a mano')
    }

    const trazos = this.parsear(dto.trazos)

    const vivas = await this.prisma.hojaManuscrita.count({
      where: { atencionId: cita.atencion.id, deletedAt: null },
    })
    if (vivas >= MAX_HOJAS_POR_ATENCION) {
      throw new BadRequestException(`Maximo ${MAX_HOJAS_POR_ATENCION} hojas por atencion`)
    }

    // Incluye las borradas a proposito: siguen ocupando su `orden` por el @@unique.
    const todas = await this.prisma.hojaManuscrita.findMany({
      where: { atencionId: cita.atencion.id },
      select: { orden: true },
    })
    const orden = siguienteOrden(todas.map((h) => h.orden))

    const [hoja] = await this.prisma.$transaction([
      this.prisma.hojaManuscrita.create({
        data: { atencionId: cita.atencion.id, orden, trazos: trazos as object },
      }),
      this.prisma.log.create({
        data: {
          consultorioId,
          usuarioId,
          entidad: 'HojaManuscrita',
          entidadId: citaId,
          accion: 'CREATE',
          payloadDespues: { orden, trazos: trazos.strokes.length },
        },
      }),
    ])
    return hoja
  }

  async actualizar(
    consultorioId: number,
    citaId: number,
    hojaId: number,
    dto: GuardarHojaDto,
    usuarioId: number,
    rol: string,
  ) {
    const hoja = await this.hojaConGuardDeEscritura(consultorioId, citaId, hojaId, usuarioId, rol)
    const trazos = this.parsear(dto.trazos)

    const [actualizada] = await this.prisma.$transaction([
      this.prisma.hojaManuscrita.update({
        where: { id: hoja.id },
        data: { trazos: trazos as object },
      }),
      this.prisma.log.create({
        data: {
          consultorioId,
          usuarioId,
          entidad: 'HojaManuscrita',
          entidadId: citaId,
          accion: 'UPDATE',
          payloadDespues: { hojaId: hoja.id, orden: hoja.orden, trazos: trazos.strokes.length },
        },
      }),
    ])
    return actualizada
  }

  async eliminar(
    consultorioId: number,
    citaId: number,
    hojaId: number,
    usuarioId: number,
    rol: string,
  ) {
    const hoja = await this.hojaConGuardDeEscritura(consultorioId, citaId, hojaId, usuarioId, rol)

    // Borrado soft: la fila queda y sigue ocupando su `orden`.
    const [borrada] = await this.prisma.$transaction([
      this.prisma.hojaManuscrita.update({
        where: { id: hoja.id },
        data: { deletedAt: new Date() },
      }),
      this.prisma.log.create({
        data: {
          consultorioId,
          usuarioId,
          entidad: 'HojaManuscrita',
          entidadId: citaId,
          accion: 'DELETE',
          payloadAntes: { hojaId: hoja.id, orden: hoja.orden },
        },
      }),
    ])
    return borrada
  }

  /**
   * Guard de escritura + resolucion de la hoja dentro de la cita. El where
   * cruza citaId y consultorioId: una hoja de otro tenant no se encuentra.
   * Publico: lo usa TranscripcionService.
   */
  async hojaConGuardDeEscritura(
    consultorioId: number,
    citaId: number,
    hojaId: number,
    usuarioId: number,
    rol: string,
  ) {
    await this.atenciones.citaConGuardDeEscritura(consultorioId, citaId, usuarioId, rol)
    const hoja = await this.prisma.hojaManuscrita.findFirst({
      where: {
        id: hojaId,
        deletedAt: null,
        atencion: { citaId, cita: { consultorioId, deletedAt: null } },
      },
    })
    if (!hoja) throw new NotFoundException('Hoja no encontrada')
    return hoja
  }

  private parsear(valor: unknown) {
    try {
      return validarTrazos(valor)
    } catch (e) {
      throw new BadRequestException((e as Error).message)
    }
  }
}
```

- [ ] **Step 2: Poner acentos en los mensajes de error del modulo**

Decision del owner (2026-08-10): los mensajes de excepcion del API son copy visible
—`toast.fromError` los muestra tal cual— asi que van en espanol correcto. Ademas
de escribir los nuevos con acentos, **corregir los que ya existen** en el modulo.

Barrer los tres archivos del modulo y poner tildes donde faltan, **sin cambiar la
redaccion ni el significado de ningun mensaje**:

- `apps/api/src/modules/atenciones/atenciones.service.ts`
- `apps/api/src/modules/atenciones/recetas.service.ts`
- `apps/api/src/modules/atenciones/atenciones.controller.ts`

Los que cambian (buscar tambien los que usan template literals con backticks, que
un grep de comillas simples no encuentra):

| Antes | Despues |
|---|---|
| `La cita no tiene atencion registrada` | `La cita no tiene atención registrada` |
| `Registre la atencion antes de adjuntar archivos` | `Registre la atención antes de adjuntar archivos` |
| `Registre la atencion antes de emitir una receta` | `Registre la atención antes de emitir una receta` |
| `Solo el doctor o el administrador registran la atencion` | `Solo el doctor o el administrador registran la atención` |
| `No se puede registrar atencion en una cita ${cita.estado}` | `No se puede registrar atención en una cita ${cita.estado}` |
| `El archivo supera el maximo de 5 MB` | `El archivo supera el máximo de 5 MB` |
| `Maximo ${MAX_ADJUNTOS_POR_ATENCION} adjuntos por atencion` | `Máximo ${MAX_ADJUNTOS_POR_ATENCION} adjuntos por atención` |
| `Ruta de adjunto invalida` | `Ruta de adjunto inválida` |
| `Solo se aceptan imagenes (JPG, PNG, WebP) o PDF` | `Solo se aceptan imágenes (JPG, PNG, WebP) o PDF` |
| `Los pagos registrados superan el precio del nuevo servicio: anule pagos antes de cambiarlo` | sin cambios (ya esta correcto) |

**No tocar:** nombres de variables, claves de `payloadAntes`/`payloadDespues`,
valores de `entidad` en los logs, ni comentarios. Solo los strings que viajan al
usuario.

Y aplicar la misma regla a los mensajes nuevos de `hojas.service.ts` del Step 1:

| En el Step 1 | Corregido |
|---|---|
| `Registre la atencion antes de escribir a mano` | `Registre la atención antes de escribir a mano` |
| `Maximo ${MAX_HOJAS_POR_ATENCION} hojas por atencion` | `Máximo ${MAX_HOJAS_POR_ATENCION} hojas por atención` |
| `Hoja no encontrada` | sin cambios |

Los mensajes de `manuscrito.validator.ts` (Task 1) tambien llegan al usuario via
`BadRequestException`: corregirlos igual — `Version de trazos no soportada`,
`Dimensiones de hoja invalidas`, `Color de trazo invalido`, `Grosor de trazo
invalido`, `Cada punto debe ser [x, y, presion] numerico`, `La presion debe estar
entre 0 y 1`, `Un trazo supera el maximo de N puntos`, `La hoja pesa mas de 2 MB`.

**OJO:** los tests de Task 1 hacen match con regex (`/version/i`, `/presion/i`,
`/dimensiones/i`, `/puntos/i`, `/pesa/i`, `/color/i`, `/grosor/i`, `/punto/i`,
`/fuera/i`). Poner tildes rompe `/version/i` contra `Versión` y `/presion/i` contra
`presión`. Al cambiar los mensajes, **actualizar los regex de
`manuscrito.validator.spec.ts` en el mismo commit** y volver a correr los tests.

- [ ] **Step 3: Typecheck**

```bash
cd apps/api && npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 4: Correr la suite de unit tests (regresion)**

```bash
cd apps/api && npx jest
```

Esperado: PASS. Los tests de Task 1 (con los regex ya actualizados) y los de la
maquina de estados siguen verdes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/atenciones/
git commit -m "feat(manuscrito): service CRUD de hojas + acentos en mensajes del modulo"
```

---

## Task 4: Controller y modulo

**Files:**
- Modify: `apps/api/src/modules/atenciones/atenciones.controller.ts`
- Modify: `apps/api/src/modules/atenciones/atenciones.module.ts`

**Interfaces:**
- Consumes: `HojasService` (Task 3).
- Produces: rutas `GET|POST /atenciones/cita/:citaId/hojas` y `PUT|DELETE /atenciones/cita/:citaId/hojas/:id`.

- [ ] **Step 1: Registrar el service en el modulo**

En `apps/api/src/modules/atenciones/atenciones.module.ts`, importar `HojasService` y sumarlo al array `providers` junto a `AtencionesService` y `RecetasService`.

- [ ] **Step 2: Inyectar el service en el controller**

En `apps/api/src/modules/atenciones/atenciones.controller.ts`, agregar al constructor:

```typescript
    private hojas: HojasService,
```

y el import correspondiente:

```typescript
import { HojasService, GuardarHojaDto } from './hojas.service'
```

- [ ] **Step 3: Agregar las rutas**

En `atenciones.controller.ts`, **antes** de las rutas de recetas (para agrupar por recurso; el orden literal-antes-que-parametrizada ya se respeta porque `hojas` es un segmento literal):

```typescript
  @Get('cita/:citaId/hojas')
  @ApiOperation({ summary: 'Hojas manuscritas de la atencion' })
  listarHojas(@CurrentUser() user: JwtPayload, @Param('citaId', ParseIntPipe) citaId: number) {
    return this.hojas.listar(user.consultorioId, citaId)
  }

  @Post('cita/:citaId/hojas')
  @ApiOperation({ summary: 'Crear una hoja manuscrita (ADMIN o el doctor de la cita)' })
  crearHoja(
    @CurrentUser() user: JwtPayload,
    @Param('citaId', ParseIntPipe) citaId: number,
    @Body() dto: GuardarHojaDto,
  ) {
    return this.hojas.crear(user.consultorioId, citaId, dto, user.sub, user.rol)
  }

  @Put('cita/:citaId/hojas/:id')
  @ApiOperation({ summary: 'Actualizar los trazos de una hoja (ADMIN o el doctor de la cita)' })
  actualizarHoja(
    @CurrentUser() user: JwtPayload,
    @Param('citaId', ParseIntPipe) citaId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GuardarHojaDto,
  ) {
    return this.hojas.actualizar(user.consultorioId, citaId, id, dto, user.sub, user.rol)
  }

  @Delete('cita/:citaId/hojas/:id')
  @ApiOperation({ summary: 'Eliminar una hoja manuscrita (borrado soft)' })
  eliminarHoja(
    @CurrentUser() user: JwtPayload,
    @Param('citaId', ParseIntPipe) citaId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.hojas.eliminar(user.consultorioId, citaId, id, user.sub, user.rol)
  }
```

- [ ] **Step 4: Subir el limite de body de JSON**

El tope de trazos es 2 MB por hoja, y el limite por defecto de `body-parser` en Express es **100 KB**: sin esto, guardar una hoja con escritura densa falla con 413 antes de llegar al service.

En `apps/api/src/main.ts`, junto al resto de la configuracion de la app, agregar:

```typescript
  // Las hojas manuscritas mandan hasta 2 MB de trazos en JSON (el default de
  // body-parser es 100 KB). El tope real por hoja lo valida validarTrazos().
  app.use(express.json({ limit: '3mb' }))
```

Si `express` no esta importado en `main.ts`, agregarlo: `import express from 'express'`. Verificar que la linea quede **antes** de `app.useGlobalPipes(...)`.

- [ ] **Step 5: Typecheck**

```bash
cd apps/api && npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/atenciones/atenciones.controller.ts apps/api/src/modules/atenciones/atenciones.module.ts apps/api/src/main.ts
git commit -m "feat(manuscrito): endpoints CRUD de hojas + limite de body a 3mb"
```

---

## Task 5: Servicio de transcripcion (OCR)

**Files:**
- Create: `apps/api/src/modules/atenciones/transcripcion.prompt.ts`
- Test: `apps/api/src/modules/atenciones/transcripcion.prompt.spec.ts`
- Create: `apps/api/src/modules/atenciones/transcripcion.service.ts`
- Modify: `apps/api/src/modules/atenciones/atenciones.controller.ts`
- Modify: `apps/api/src/modules/atenciones/atenciones.module.ts`
- Modify: `apps/api/.env.example`

**Interfaces:**
- Consumes: `HojasService.hojaConGuardDeEscritura` (Task 3).
- Produces:
  - `PROMPT_TRANSCRIPCION: string`
  - `modeloTranscripcion(env: NodeJS.ProcessEnv): string`
  - `mediaTypeDeImagen(buffer: Buffer): 'image/png' | 'image/jpeg' | null`
  - `TranscripcionService.disponible(): boolean`
  - `TranscripcionService.transcribir(consultorioId, citaId, hojaId, usuarioId, rol, file)` → `{ texto: string }`
  - Ruta `POST /atenciones/cita/:citaId/hojas/:id/transcribir`
  - Ruta `GET /atenciones/transcripcion/estado` → `{ disponible: boolean }` (la consume Task 13)

- [ ] **Step 1: Instalar el SDK**

```bash
cd apps/api && pnpm add @anthropic-ai/sdk
```

- [ ] **Step 2: Escribir los tests que fallan**

`apps/api/src/modules/atenciones/transcripcion.prompt.spec.ts`:

```typescript
import { mediaTypeDeImagen, modeloTranscripcion, PROMPT_TRANSCRIPCION } from './transcripcion.prompt'

describe('modeloTranscripcion', () => {
  it('usa claude-opus-5 por defecto', () => {
    expect(modeloTranscripcion({})).toBe('claude-opus-5')
  })

  it('respeta TRANSCRIPCION_MODEL cuando esta seteado', () => {
    expect(modeloTranscripcion({ TRANSCRIPCION_MODEL: 'claude-sonnet-5' })).toBe('claude-sonnet-5')
  })

  it('ignora un valor vacio o solo espacios', () => {
    expect(modeloTranscripcion({ TRANSCRIPCION_MODEL: '   ' })).toBe('claude-opus-5')
  })
})

describe('mediaTypeDeImagen', () => {
  it('reconoce PNG por su magic number', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
    expect(mediaTypeDeImagen(png)).toBe('image/png')
  })

  it('reconoce JPEG por su magic number', () => {
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])
    expect(mediaTypeDeImagen(jpg)).toBe('image/jpeg')
  })

  it('devuelve null para cualquier otra cosa', () => {
    expect(mediaTypeDeImagen(Buffer.from('no soy una imagen'))).toBeNull()
    expect(mediaTypeDeImagen(Buffer.alloc(0))).toBeNull()
  })
})

describe('PROMPT_TRANSCRIPCION', () => {
  it('pide solo la transcripcion, sin comentarios del modelo', () => {
    expect(PROMPT_TRANSCRIPCION).toMatch(/solo la transcripcion|unicamente la transcripcion/i)
  })

  it('marca lo ilegible con [ilegible]', () => {
    expect(PROMPT_TRANSCRIPCION).toContain('[ilegible]')
  })
})
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

```bash
cd apps/api && npx jest transcripcion.prompt
```

Esperado: FAIL — `Cannot find module './transcripcion.prompt'`.

- [ ] **Step 4: Implementar el prompt y los helpers**

`apps/api/src/modules/atenciones/transcripcion.prompt.ts`:

```typescript
export const MODELO_TRANSCRIPCION_DEFAULT = 'claude-opus-5'

/**
 * Modelo a usar para transcribir. Configurable por env para poder bajar a
 * claude-sonnet-5 (mas barato) sin un deploy de codigo.
 */
export function modeloTranscripcion(env: NodeJS.ProcessEnv | Record<string, string | undefined>): string {
  const valor = env.TRANSCRIPCION_MODEL?.trim()
  return valor ? valor : MODELO_TRANSCRIPCION_DEFAULT
}

/** PNG y JPEG por magic number. No confiamos en el mimetype que manda el cliente. */
export function mediaTypeDeImagen(buffer: Buffer): 'image/png' | 'image/jpeg' | null {
  if (buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png'
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg'
  return null
}

export const PROMPT_TRANSCRIPCION = [
  'Esta imagen es una hoja de notas clinicas escrita a mano por un psicologo, en espanol.',
  'Transcribi el texto tal como esta escrito, respetando los saltos de linea, las vinetas y la separacion en parrafos.',
  'No corrijas la redaccion, no resumas y no completes lo que falte.',
  'Si una palabra no se entiende, escribi [ilegible] en su lugar.',
  'Si hay dibujos, esquemas o diagramas, describilos brevemente entre corchetes, por ejemplo [esquema familiar].',
  'Responde unicamente con la transcripcion. No agregues introduccion, comentarios ni conclusiones.',
].join(' ')
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

```bash
cd apps/api && npx jest transcripcion.prompt
```

Esperado: PASS, 8 tests.

- [ ] **Step 6: Escribir el service de transcripcion**

`apps/api/src/modules/atenciones/transcripcion.service.ts`:

```typescript
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import Anthropic from '@anthropic-ai/sdk'
import { PrismaService } from '../../prisma/prisma.service'
import { HojasService } from './hojas.service'
import { mediaTypeDeImagen, modeloTranscripcion, PROMPT_TRANSCRIPCION } from './transcripcion.prompt'

const MAX_IMAGEN_BYTES = 8 * 1024 * 1024

/**
 * Unica puerta hacia el proveedor de OCR. Cambiar de proveedor = tocar solo
 * este archivo; el controller y el frontend no se enteran.
 *
 * La imagen NO se persiste en ningun lado: es un intermedio de la request.
 */
@Injectable()
export class TranscripcionService {
  constructor(
    private prisma: PrismaService,
    private hojas: HojasService,
  ) {}

  disponible(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY?.trim())
  }

  async transcribir(
    consultorioId: number,
    citaId: number,
    hojaId: number,
    usuarioId: number,
    rol: string,
    imagen: Buffer,
  ): Promise<{ texto: string }> {
    const hoja = await this.hojas.hojaConGuardDeEscritura(consultorioId, citaId, hojaId, usuarioId, rol)

    if (!this.disponible()) {
      throw new ServiceUnavailableException(
        'La transcripcion no esta configurada en el servidor (falta ANTHROPIC_API_KEY)',
      )
    }
    if (imagen.length > MAX_IMAGEN_BYTES) {
      throw new BadRequestException('La imagen de la hoja supera el maximo de 8 MB')
    }
    const mediaType = mediaTypeDeImagen(imagen)
    if (!mediaType) {
      throw new BadRequestException('La imagen de la hoja debe ser PNG o JPEG')
    }

    const client = new Anthropic()
    let texto: string
    try {
      const respuesta = await client.messages.create({
        model: modeloTranscripcion(process.env),
        max_tokens: 8000,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: imagen.toString('base64') } },
              { type: 'text', text: PROMPT_TRANSCRIPCION },
            ],
          },
        ],
      })

      // El modelo puede declinar la respuesta: hay que mirar stop_reason antes
      // de tocar content, o content[0] revienta.
      if (respuesta.stop_reason === 'refusal') {
        throw new ServiceUnavailableException('El modelo no pudo procesar esta hoja')
      }
      texto = respuesta.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim()
    } catch (e) {
      if (e instanceof ServiceUnavailableException || e instanceof BadRequestException) throw e
      throw new ServiceUnavailableException('No se pudo transcribir la hoja. Intente de nuevo.')
    }

    await this.prisma.$transaction([
      this.prisma.hojaManuscrita.update({
        where: { id: hoja.id },
        data: { transcripcion: texto, transcritoAt: new Date() },
      }),
      this.prisma.log.create({
        data: {
          consultorioId,
          usuarioId,
          entidad: 'HojaManuscrita',
          entidadId: citaId,
          accion: 'UPDATE',
          payloadDespues: { hojaId: hoja.id, transcrito: true, caracteres: texto.length },
        },
      }),
    ])

    return { texto }
  }
}
```

- [ ] **Step 7: Agregar la ruta al controller**

En `atenciones.controller.ts`, junto a las otras rutas de hojas:

```typescript
  @Post('cita/:citaId/hojas/:id/transcribir')
  @ApiOperation({ summary: 'Transcribir una hoja manuscrita a texto' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('imagen', { limits: { fileSize: 8 * 1024 * 1024 } }))
  transcribirHoja(
    @CurrentUser() user: JwtPayload,
    @Param('citaId', ParseIntPipe) citaId: number,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() imagen?: Express.Multer.File,
  ) {
    if (!imagen) throw new BadRequestException('Falta la imagen (campo "imagen")')
    return this.transcripcion.transcribir(user.consultorioId, citaId, id, user.sub, user.rol, imagen.buffer)
  }
```

Inyectar `private transcripcion: TranscripcionService` en el constructor y registrarlo en `providers` del modulo.

Y la ruta de disponibilidad, para que el frontend pueda deshabilitar el boton con motivo en vez de dejar al doctor descubrir el 503 recien al apretar. Va **antes** de las rutas parametrizadas (gotcha conocido de Nest: una ruta literal declarada despues de `:citaId` nunca se alcanza):

```typescript
  @Get('transcripcion/estado')
  @ApiOperation({ summary: 'Si el servidor tiene configurada la transcripcion' })
  estadoTranscripcion() {
    return { disponible: this.transcripcion.disponible() }
  }
```

- [ ] **Step 8: Documentar las variables de entorno**

Agregar al final de `apps/api/.env.example`:

```
# Transcripcion de notas manuscritas (OCR). Vacio = el boton "Transcribir"
# queda deshabilitado; el resto del modulo de hojas sigue funcionando.
ANTHROPIC_API_KEY=
# Opcional: claude-sonnet-5 para bajar el costo por hoja. Default: claude-opus-5
TRANSCRIPCION_MODEL=
```

**No poner la key real en ningun archivo versionado.** El owner la carga en `apps/api/.env` (gitignoreado) y en las variables de Railway.

- [ ] **Step 9: Typecheck y suite completa**

```bash
cd apps/api && npx tsc --noEmit && npx jest
```

Esperado: sin errores de tipos, todos los tests PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/atenciones/transcripcion.prompt.ts apps/api/src/modules/atenciones/transcripcion.prompt.spec.ts apps/api/src/modules/atenciones/transcripcion.service.ts apps/api/src/modules/atenciones/atenciones.controller.ts apps/api/src/modules/atenciones/atenciones.module.ts apps/api/.env.example apps/api/package.json pnpm-lock.yaml
git commit -m "feat(manuscrito): transcripcion de hojas a texto con claude-opus-5"
```

---

## Task 6: Gate de API

El agente escribe el gate; **lo corre el owner** con la API levantada.

**Files:**
- Create: `scripts/gate-manuscrito.ps1`

**Interfaces:**
- Consumes: todos los endpoints de Tasks 4 y 5.
- Produces: nada de codigo. Un script de verificacion.

- [ ] **Step 1: Escribir el gate**

`scripts/gate-manuscrito.ps1`:

```powershell
# Gate notas manuscritas: CRUD de hojas + guards + topes (API :3000)
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmssff"
$email = "man$ts@test.com"

function Esperar-Error($accion, $codigoEsperado, $etiqueta) {
  try {
    & $accion | Out-Null
    Write-Output "$etiqueta : FALLO (no dio error, esperado $codigoEsperado)"
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status -eq $codigoEsperado) { Write-Output "$etiqueta : OK ($status)" }
    else { Write-Output "$etiqueta : FALLO (dio $status, esperado $codigoEsperado)" }
  }
}

function Hoja($nPuntos) {
  $puntos = @()
  for ($i = 0; $i -lt $nPuntos; $i++) { $puntos += ,@(($i % 1200), 100.5, 0.6) }
  return @{ v = 1; w = 1240; h = 1754; strokes = @(@{ c = "#111827"; s = 4; p = $puntos }) }
}

Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "Man $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }

$srv = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Sesion"; duracionMin = 50; precioBase = 200 } | ConvertTo-Json)
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dra. Psi" } | ConvertTo-Json)
$pac = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Ana"; apellido = "Manuscrita" } | ConvertTo-Json)

$fh = (Get-Date -Hour 10 -Minute 0 -Second 0).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$cita = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $srv.id; fechaHora = $fh } | ConvertTo-Json)

# 1) Sin atencion registrada -> 400
Esperar-Error { Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/hojas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ trazos = (Hoja 5) } | ConvertTo-Json -Depth 10) } 400 "1 SIN ATENCION"

foreach ($estado in @("CONFIRMADA", "LLEGO", "EN_ATENCION")) {
  Invoke-RestMethod -Uri "$base/citas/$($cita.id)/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = $estado } | ConvertTo-Json) | Out-Null
}
Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)" -Method Put -Headers $h -ContentType "application/json" -Body (@{ motivo = "primera sesion" } | ConvertTo-Json) | Out-Null

# 2) Crear hoja -> orden 1
$h1 = Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/hojas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ trazos = (Hoja 5) } | ConvertTo-Json -Depth 10)
Write-Output "2 CREAR HOJA: orden=$($h1.orden) (esp 1)"

# 3) Segunda hoja -> orden 2
$h2 = Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/hojas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ trazos = (Hoja 5) } | ConvertTo-Json -Depth 10)
Write-Output "3 SEGUNDA HOJA: orden=$($h2.orden) (esp 2)"

# 4) Actualizar trazos de la hoja 1
$upd = Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/hojas/$($h1.id)" -Method Put -Headers $h -ContentType "application/json" -Body (@{ trazos = (Hoja 9) } | ConvertTo-Json -Depth 10)
Write-Output "4 ACTUALIZAR: puntos=$($upd.trazos.strokes[0].p.Count) (esp 9)"

# 5) Version invalida -> 400
$mala = Hoja 3; $mala.v = 99
Esperar-Error { Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/hojas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ trazos = $mala } | ConvertTo-Json -Depth 10) } 400 "5 VERSION INVALIDA"

# 6) Punto fuera de la hoja -> 400
$fuera = Hoja 1; $fuera.strokes[0].p = @(,@(99999, 10, 0.5))
Esperar-Error { Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/hojas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ trazos = $fuera } | ConvertTo-Json -Depth 10) } 400 "6 PUNTO FUERA"

# 7) Trazos sin objeto (rompe el DTO) -> 400
Esperar-Error { Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/hojas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ trazos = "no soy objeto" } | ConvertTo-Json) } 400 "7 DTO INVALIDO"

# 8) SECRETARIA: lee si, escribe no
$secEmail = "sec$ts@test.com"
Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Sec"; email = $secEmail; password = "Password123!"; rol = "SECRETARIA" } | ConvertTo-Json) | Out-Null
$loginSec = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $secEmail; password = "Password123!" } | ConvertTo-Json)
$hSec = @{ Authorization = "Bearer $($loginSec.accessToken)" }
$leeSec = Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/hojas" -Headers $hSec
Esperar-Error { Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/hojas" -Method Post -Headers $hSec -ContentType "application/json" -Body (@{ trazos = (Hoja 3) } | ConvertTo-Json -Depth 10) } 403 "8b SECRETARIA ESCRIBE"
Write-Output "8 SECRETARIA LEE: hojas=$(@($leeSec).Count) (esp 2)"

# 9) Otro tenant no ve ni pisa la hoja
$email2 = "otro$ts@test.com"
Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "Otro $ts"; adminNombre = "Admin"; email = $email2; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login2 = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email2; password = "Password123!" } | ConvertTo-Json)
$h2t = @{ Authorization = "Bearer $($login2.accessToken)" }
Esperar-Error { Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/hojas/$($h1.id)" -Method Put -Headers $h2t -ContentType "application/json" -Body (@{ trazos = (Hoja 3) } | ConvertTo-Json -Depth 10) } 404 "9 OTRO TENANT"

# 10) Borrado soft: deja de listarse
Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/hojas/$($h2.id)" -Method Delete -Headers $h | Out-Null
$tras = Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/hojas" -Headers $h
Write-Output "10 BORRADO SOFT: hojas=$(@($tras).Count) (esp 1)"

# 11) El orden de una hoja borrada NO se reutiliza (regresion del @@unique)
$h3 = Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/hojas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ trazos = (Hoja 4) } | ConvertTo-Json -Depth 10)
Write-Output "11 ORDEN TRAS BORRAR: orden=$($h3.orden) (esp 3, NO 2)"

# 12) Hoja inexistente -> 404
Esperar-Error { Invoke-RestMethod -Uri "$base/atenciones/cita/$($cita.id)/hojas/999999" -Method Delete -Headers $h } 404 "12 HOJA INEXISTENTE"

Write-Output ""
Write-Output "Nota: el caso de transcribir sin ANTHROPIC_API_KEY (503) y el tope de 20 hojas"
Write-Output "se verifican a mano; el primero requiere la env vacia y el segundo 20 POSTs."
```

- [ ] **Step 2: Verificar la sintaxis de PowerShell sin ejecutar el gate**

```bash
powershell -NoProfile -Command "\$null = [System.Management.Automation.Language.Parser]::ParseFile('scripts/gate-manuscrito.ps1', [ref]\$null, [ref]\$errs); if (\$errs) { \$errs | ForEach-Object { \$_.Message } } else { 'sintaxis OK' }"
```

Esperado: `sintaxis OK`.

- [ ] **Step 3: Commit**

```bash
git add scripts/gate-manuscrito.ps1
git commit -m "test(manuscrito): gate de API para hojas manuscritas"
```

- [ ] **Step 4: Avisar al owner**

Decirle que corra, con la API levantada:

```powershell
pwsh scripts/gate-manuscrito.ps1
```

Esperado: todos los casos OK; el 11 es el importante (orden 3, no 2).

---

## Task 7: Renderer de trazos (web, solo lectura)

La pieza compartida. La usan la miniatura del modal, el visor de la historia clinica y la capa de fondo del editor.

**Files:**
- Create: `apps/web/src/components/manuscrito/dibujar.ts`
- Create: `apps/web/src/components/manuscrito/HojaRenderer.tsx`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: `TrazosHoja`, `Trazo`, `HOJA_W`, `HOJA_H` de `@pos/types` (Task 1).
- Produces:
  - `pathDeTrazo(trazo: Trazo, simularPresion: boolean): Path2D`
  - `cuantizar(x: number, y: number, presion: number): PuntoTrazo`
  - `pintarHoja(ctx: CanvasRenderingContext2D, trazos: TrazosHoja): void`
  - `<HojaRenderer trazos={...} className={...} />` — componente React que dibuja la hoja escalada a su contenedor.

- [ ] **Step 1: Instalar perfect-freehand**

```bash
cd apps/web && pnpm add perfect-freehand
```

- [ ] **Step 2: Escribir las funciones de dibujo**

`apps/web/src/components/manuscrito/dibujar.ts`:

```typescript
import { getStroke } from 'perfect-freehand'
import type { PuntoTrazo, Trazo, TrazosHoja } from '@pos/types'

// Opciones de perfect-freehand afinadas para escritura (no para dibujo libre):
// streamline bajo mantiene la letra fiel, thinning medio da el efecto pluma.
const OPCIONES_BASE = {
  thinning: 0.55,
  smoothing: 0.5,
  streamline: 0.32,
  last: true,
}

/**
 * Redondea el punto antes de guardarlo: 1 decimal en coordenadas y 2 en la
 * presion recorta el JSON casi a la mitad sin que se note en el trazo.
 */
export function cuantizar(x: number, y: number, presion: number): PuntoTrazo {
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(presion * 100) / 100]
}

/**
 * Convierte un trazo en un Path2D listo para rellenar. getStroke() devuelve el
 * CONTORNO del trazo como poligono; se suaviza con curvas cuadraticas entre
 * puntos medios, que es lo que hace que la letra no se vea facetada.
 */
export function pathDeTrazo(trazo: Trazo, simularPresion: boolean): Path2D {
  const contorno = getStroke(trazo.p as number[][], {
    ...OPCIONES_BASE,
    size: trazo.s * 2,
    simulatePressure: simularPresion,
  }) as number[][]

  const path = new Path2D()
  if (contorno.length === 0) return path

  path.moveTo(contorno[0][0], contorno[0][1])
  for (let i = 0; i < contorno.length; i++) {
    const [x0, y0] = contorno[i]
    const [x1, y1] = contorno[(i + 1) % contorno.length]
    path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
  }
  path.closePath()
  return path
}

/**
 * Pinta la hoja completa. El caller ya dejo el contexto escalado al tamano
 * logico de la hoja y limpio el canvas.
 */
export function pintarHoja(ctx: CanvasRenderingContext2D, trazos: TrazosHoja): void {
  for (const trazo of trazos.strokes) {
    // Si todos los puntos vienen con presion 0.5 exacta, el dispositivo no
    // reporta presion (dedo o mouse): dejamos que la libreria la simule.
    const sinPresionReal = trazo.p.every((p) => p[2] === 0.5)
    ctx.fillStyle = trazo.c
    ctx.fill(pathDeTrazo(trazo, sinPresionReal))
  }
}
```

- [ ] **Step 3: Cargar los skills de UI antes de escribir JSX**

**Obligatorio por la regla del proyecto.** Invocar `impeccable`, `ui-ux-pro-max` y `frontend-design` y aplicar lo que digan al componente del paso siguiente. No saltear este paso.

- [ ] **Step 4: Escribir el componente de solo lectura**

`apps/web/src/components/manuscrito/HojaRenderer.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { HOJA_H, HOJA_W, type TrazosHoja } from '@pos/types'
import { cn } from '../../lib/utils'
import { pintarHoja } from './dibujar'

interface Props {
  trazos: TrazosHoja
  /** Ancho de render en pixeles CSS. El alto sale de la proporcion A4. */
  ancho: number
  className?: string
  /** Texto alternativo para lectores de pantalla. */
  etiqueta?: string
}

/**
 * Dibuja una hoja manuscrita en solo lectura. Se usa para la miniatura del
 * modal, el visor de la historia clinica y la capa de trazos ya cerrados del
 * editor. No captura eventos: es puro pixel.
 */
export function HojaRenderer({ trazos, ancho, className, etiqueta }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const alto = Math.round((ancho * HOJA_H) / HOJA_W)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // devicePixelRatio: sin esto el trazo se ve pixelado en pantallas retina.
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    canvas.width = Math.round(ancho * dpr)
    canvas.height = Math.round(alto * dpr)

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    // Escala de espacio logico de hoja -> pixeles fisicos del canvas
    const escala = (ancho * dpr) / HOJA_W
    ctx.setTransform(escala, 0, 0, escala, 0, 0)
    pintarHoja(ctx, trazos)
  }, [trazos, ancho, alto])

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={etiqueta ?? 'Hoja manuscrita'}
      style={{ width: ancho, height: alto }}
      className={cn('bg-white rounded-md border', className)}
    />
  )
}
```

- [ ] **Step 5: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/manuscrito apps/web/package.json pnpm-lock.yaml
git commit -m "feat(manuscrito): renderer de trazos con perfect-freehand"
```

---

## Task 8: Lienzo — captura del lapiz

El corazon del feature. Solo captura y dibujo; las herramientas y las hojas vienen despues.

**Files:**
- Create: `apps/web/src/features/agenda/LienzoManuscrito.tsx`

**Interfaces:**
- Consumes: `pintarHoja`, `pathDeTrazo`, `cuantizar` (Task 7); `hojaVacia`, `HOJA_W`, `HOJA_H`, `COLORES_LAPIZ`, `GROSORES_LAPIZ` (Task 1).
- Produces: `<LienzoManuscrito citaId={number} onClose={() => void} />` — por ahora una sola hoja en memoria, sin persistir.

- [ ] **Step 1: Cargar los skills de UI**

Invocar `impeccable`, `ui-ux-pro-max` y `frontend-design` antes del JSX. Obligatorio.

- [ ] **Step 2: Escribir el esqueleto de pantalla completa con los dos canvas**

Estructura: `fixed inset-0 z-[60] bg-neutral-100 dark:bg-neutral-900 flex flex-col`, con una barra superior (titulo + cerrar), el area de la hoja centrada, y una barra inferior (placeholder por ahora).

El area de la hoja lleva **dos canvas superpuestos** en un contenedor `relative`:

```tsx
<div className="relative touch-none select-none" style={{ width: anchoCss, height: altoCss }}>
  <canvas ref={canvasFondo} className="absolute inset-0 bg-white rounded-md shadow-sm" />
  <canvas
    ref={canvasVivo}
    className="absolute inset-0"
    style={{ touchAction: 'none', overscrollBehavior: 'none' }}
    onPointerDown={alBajar}
    onPointerMove={alMover}
    onPointerUp={alSubir}
    onPointerCancel={alSubir}
  />
</div>
```

`touchAction: 'none'` y `overscrollBehavior: 'none'` son **obligatorios**: sin ellos el navegador hace scroll y zoom mientras el doctor escribe.

- [ ] **Step 3: Implementar la captura**

Dentro del componente:

```tsx
  const trazosRef = useRef<TrazosHoja>(hojaVacia())
  const trazoActivo = useRef<Trazo | null>(null)
  const punteroActivo = useRef<number | null>(null)
  // Rechazo de palma: apenas se ve un lapiz en la sesion, el dedo deja de
  // dibujar. En celular sin lapiz, el dedo sigue dibujando.
  const vioLapiz = useRef(false)

  function aEspacioHoja(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    return {
      x: ((e.clientX - r.left) / r.width) * HOJA_W,
      y: ((e.clientY - r.top) / r.height) * HOJA_H,
    }
  }

  function puedeDibujar(e: React.PointerEvent) {
    if (e.pointerType === 'pen') return true
    if (e.pointerType === 'mouse') return true
    return !vioLapiz.current // touch: solo si nunca aparecio un lapiz
  }

  function alBajar(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.pointerType === 'pen') vioLapiz.current = true
    if (!puedeDibujar(e)) return
    if (punteroActivo.current !== null) return // ya hay un trazo en curso

    e.currentTarget.setPointerCapture(e.pointerId)
    punteroActivo.current = e.pointerId

    const { x, y } = aEspacioHoja(e)
    trazoActivo.current = {
      c: color,
      s: grosor,
      p: [cuantizar(x, y, presionDe(e))],
    }
  }

  function alMover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (punteroActivo.current !== e.pointerId || !trazoActivo.current) return

    // getCoalescedEvents recupera los puntos que el navegador agrupa entre
    // frames (el Pencil muestrea a mas de 120 Hz). Safari lo tiene recien
    // desde la 18.2: sin deteccion, en un iPad viejo esto revienta.
    const eventos =
      typeof e.nativeEvent.getCoalescedEvents === 'function'
        ? e.nativeEvent.getCoalescedEvents()
        : [e.nativeEvent]

    const r = e.currentTarget.getBoundingClientRect()
    for (const ev of eventos) {
      const x = ((ev.clientX - r.left) / r.width) * HOJA_W
      const y = ((ev.clientY - r.top) / r.height) * HOJA_H
      trazoActivo.current.p.push(cuantizar(x, y, presionDe(ev)))
    }
    pintarVivo()
  }

  function alSubir(e: React.PointerEvent<HTMLCanvasElement>) {
    if (punteroActivo.current !== e.pointerId) return
    punteroActivo.current = null
    const trazo = trazoActivo.current
    trazoActivo.current = null
    if (!trazo || trazo.p.length === 0) return

    trazosRef.current = { ...trazosRef.current, strokes: [...trazosRef.current.strokes, trazo] }
    limpiarVivo()
    pintarFondo()
    setSucio(true)
  }
```

Con el helper de presion:

```tsx
// Un dispositivo sin presion reporta 0 (o 0.5 en algunos navegadores) en todos
// los puntos. Normalizamos a 0.5 para que pintarHoja() detecte el caso y deje
// que perfect-freehand simule la presion.
function presionDe(e: { pressure: number; pointerType: string }): number {
  if (e.pointerType !== 'pen') return 0.5
  return e.pressure > 0 ? e.pressure : 0.5
}
```

- [ ] **Step 4: Implementar el pintado de las dos capas**

```tsx
  function contexto(canvas: HTMLCanvasElement | null) {
    if (!canvas) return null
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    if (canvas.width !== Math.round(anchoCss * dpr)) {
      canvas.width = Math.round(anchoCss * dpr)
      canvas.height = Math.round(altoCss * dpr)
    }
    const escala = (anchoCss * dpr) / HOJA_W
    ctx.setTransform(escala, 0, 0, escala, 0, 0)
    return ctx
  }

  /** Redibuja TODOS los trazos cerrados. Solo al cambiar la lista. */
  function pintarFondo() {
    const ctx = contexto(canvasFondo.current)
    if (!ctx) return
    ctx.clearRect(0, 0, HOJA_W, HOJA_H)
    pintarHoja(ctx, trazosRef.current)
  }

  /** Redibuja solo el trazo en curso. Se llama en cada pointermove. */
  function pintarVivo() {
    const ctx = contexto(canvasVivo.current)
    if (!ctx || !trazoActivo.current) return
    ctx.clearRect(0, 0, HOJA_W, HOJA_H)
    ctx.fillStyle = trazoActivo.current.c
    ctx.fill(pathDeTrazo(trazoActivo.current, trazoActivo.current.p.every((p) => p[2] === 0.5)))
  }

  function limpiarVivo() {
    const ctx = contexto(canvasVivo.current)
    ctx?.clearRect(0, 0, HOJA_W, HOJA_H)
  }
```

La separacion es la clave del rendimiento: el canvas de fondo se redibuja solo cuando cambia la lista de trazos, el vivo en cada movimiento pero con un unico trazo.

- [ ] **Step 5: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/agenda/LienzoManuscrito.tsx
git commit -m "feat(manuscrito): captura de lapiz con presion y rechazo de palma"
```

---

## Task 9: Lienzo — herramientas

**Files:**
- Modify: `apps/web/src/features/agenda/LienzoManuscrito.tsx`

**Interfaces:**
- Consumes: el componente de Task 8; `COLORES_LAPIZ`, `GROSORES_LAPIZ` (Task 1).
- Produces: estado `herramienta: 'lapiz' | 'borrador'`, `color: string`, `grosor: number`, y las acciones `deshacer()` / `rehacer()`.

- [ ] **Step 1: Cargar los skills de UI**

`impeccable` + `ui-ux-pro-max` + `frontend-design`. Obligatorio antes del JSX de la barra de herramientas.

- [ ] **Step 2: Implementar deshacer/rehacer**

Pila simple sobre la lista de trazos. No hace falta nada mas sofisticado: el estado de una hoja ES su lista de trazos.

```tsx
  const pilaDeshacer = useRef<Trazo[][]>([])
  const pilaRehacer = useRef<Trazo[][]>([])

  function aplicar(strokes: Trazo[]) {
    trazosRef.current = { ...trazosRef.current, strokes }
    pintarFondo()
    setSucio(true)
    setPuedeDeshacer(pilaDeshacer.current.length > 0)
    setPuedeRehacer(pilaRehacer.current.length > 0)
  }

  /** Llamar ANTES de cada cambio (trazo nuevo, borrado). */
  function registrarCambio() {
    pilaDeshacer.current.push(trazosRef.current.strokes)
    pilaRehacer.current = []
  }

  function deshacer() {
    const anterior = pilaDeshacer.current.pop()
    if (!anterior) return
    pilaRehacer.current.push(trazosRef.current.strokes)
    aplicar(anterior)
  }

  function rehacer() {
    const siguiente = pilaRehacer.current.pop()
    if (!siguiente) return
    pilaDeshacer.current.push(trazosRef.current.strokes)
    aplicar(siguiente)
  }
```

En `alSubir` de Task 8, llamar `registrarCambio()` **antes** de agregar el trazo nuevo.

- [ ] **Step 3: Implementar el borrador por trazo**

Coherente con el modelo vectorial: se borra el trazo entero que el lapiz toca, no pixeles.

```tsx
  const RADIO_BORRADOR = 14 // en espacio logico de hoja

  function borrarEn(x: number, y: number) {
    const quedan = trazosRef.current.strokes.filter(
      (t) => !t.p.some(([px, py]) => Math.hypot(px - x, py - y) < RADIO_BORRADOR + t.s),
    )
    if (quedan.length === trazosRef.current.strokes.length) return
    registrarCambio()
    aplicar(quedan)
  }
```

En `alBajar` y `alMover`, si `herramienta === 'borrador'`, llamar `borrarEn(x, y)` en vez de acumular puntos.

- [ ] **Step 4: Escribir la barra de herramientas**

Barra superior con: cerrar (izquierda), grupo de herramientas (centro), indicador de guardado (derecha).

Requisitos no negociables del design system:
- Cada boton `h-11 w-11` como minimo (44px, WCAG).
- `focus-visible:ring-[3px] focus-visible:ring-ring/60`.
- **Color + forma, no solo color**: el selector de color activo se marca con un anillo Y un check, no solo con el color.
- `aria-pressed` en los toggles de herramienta, color y grosor.
- `aria-label` en espanol con acentos: "Lápiz", "Borrador", "Deshacer", "Rehacer", "Cerrar".
- Transiciones `duration-150`.
- La barra usa `flex-wrap` para no forzar scroll horizontal en celular.

Iconos de `lucide-react` (ya es dependencia): `Pen`, `Eraser`, `Undo2`, `Redo2`, `X`, `Plus`, `ChevronLeft`, `ChevronRight`, `Trash2`.

- [ ] **Step 5: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/agenda/LienzoManuscrito.tsx
git commit -m "feat(manuscrito): herramientas de lapiz, borrador, deshacer y rehacer"
```

---

## Task 10: Lienzo — hojas multiples

**Files:**
- Modify: `apps/web/src/features/agenda/LienzoManuscrito.tsx`

**Interfaces:**
- Consumes: endpoints de Task 4 via `api` (`apps/web/src/lib/api-client.ts`).
- Produces: navegacion entre hojas y creacion/borrado, con la query `['hojas', citaId]`.

- [ ] **Step 1: Cargar los skills de UI**

Obligatorio antes del JSX de la barra inferior.

- [ ] **Step 2: Cablear la query y las mutations**

```tsx
  const qc = useQueryClient()
  const { data: hojas = [], isLoading } = useQuery<HojaManuscritaApi[]>({
    queryKey: ['hojas', citaId],
    queryFn: () => api.get(`/atenciones/cita/${citaId}/hojas`).then((r) => r.data),
  })

  const crearHoja = useMutation({
    mutationFn: () =>
      api.post(`/atenciones/cita/${citaId}/hojas`, { trazos: hojaVacia() }).then((r) => r.data),
    onSuccess: (nueva) => {
      qc.invalidateQueries({ queryKey: ['hojas', citaId] })
      setHojaActivaId(nueva.id)
    },
    onError: (err: any) => toast.fromError(err, 'No se pudo crear la hoja'),
  })

  const guardarHoja = useMutation({
    mutationFn: ({ id, trazos }: { id: number; trazos: TrazosHoja }) =>
      api.put(`/atenciones/cita/${citaId}/hojas/${id}`, { trazos }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hojas', citaId] }),
    onError: (err: any) => toast.fromError(err, 'No se pudo guardar la hoja'),
  })

  const borrarHoja = useMutation({
    mutationFn: (id: number) => api.delete(`/atenciones/cita/${citaId}/hojas/${id}`),
    onSuccess: () => {
      setHojaABorrar(null)
      qc.invalidateQueries({ queryKey: ['hojas', citaId] })
    },
    onError: (err: any) => {
      setHojaABorrar(null)
      toast.fromError(err, 'No se pudo eliminar la hoja')
    },
  })
```

`queryKey` jerarquica `['hojas', citaId]`, nunca plana. `toast.fromError` es el patron del proyecto para errores de mutation.

- [ ] **Step 3: Cambiar de hoja guardando la actual**

Al navegar, **primero se guarda la hoja actual si esta sucia**, despues se carga la otra. Perder trazos al pasar de hoja seria el peor bug posible en este feature.

```tsx
  async function irAHoja(id: number) {
    if (id === hojaActivaId) return
    if (sucio && hojaActivaId !== null) {
      await guardarHoja.mutateAsync({ id: hojaActivaId, trazos: trazosRef.current })
      setSucio(false)
    }
    const destino = hojas.find((h) => h.id === id)
    trazosRef.current = (destino?.trazos as TrazosHoja) ?? hojaVacia()
    pilaDeshacer.current = []
    pilaRehacer.current = []
    setHojaActivaId(id)
    pintarFondo()
  }
```

- [ ] **Step 4: Escribir la barra inferior**

"Hoja 2 / 3" con `tabular-nums`, flechas anterior/siguiente (deshabilitadas en los extremos), boton "+ Hoja" y boton de eliminar la hoja actual.

Eliminar abre un `ConfirmarModal` (**nunca `window.confirm`**):

```tsx
      {hojaABorrar !== null && (
        <ConfirmarModal
          titulo="Eliminar hoja"
          mensaje={`Se eliminará la hoja ${indiceDe(hojaABorrar) + 1} de la historia clínica. Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          pendiente={borrarHoja.isPending}
          onConfirm={() => borrarHoja.mutate(hojaABorrar)}
          onClose={() => setHojaABorrar(null)}
        />
      )}
```

Con "+ Hoja" deshabilitado al llegar a `MAX_HOJAS_POR_ATENCION`, con la leyenda "Máximo 20 hojas por atención".

- [ ] **Step 5: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/agenda/LienzoManuscrito.tsx
git commit -m "feat(manuscrito): hojas multiples con navegacion y guardado al cambiar"
```

---

## Task 11: Autoguardado y borrador local

Es una nota clinica escrita en vivo frente al paciente. Perderla por un corte de red no es aceptable.

**Files:**
- Create: `apps/web/src/components/manuscrito/borradorLocal.ts`
- Modify: `apps/web/src/features/agenda/LienzoManuscrito.tsx`

**Interfaces:**
- Consumes: `TrazosHoja` (Task 1).
- Produces:
  - `guardarBorrador(hojaId: number, trazos: TrazosHoja): Promise<void>`
  - `leerBorrador(hojaId: number): Promise<{ trazos: TrazosHoja; guardadoAt: number } | null>`
  - `borrarBorrador(hojaId: number): Promise<void>`

- [ ] **Step 1: Escribir el modulo de IndexedDB**

`apps/web/src/components/manuscrito/borradorLocal.ts`:

```typescript
import type { TrazosHoja } from '@pos/types'

// IndexedDB a mano: son 50 lineas y evita sumar una dependencia por esto.
// localStorage no sirve — es sincrono y bloquearia el hilo mientras se escribe.
const DB = 'consultech-manuscrito'
const STORE = 'borradores'

interface Borrador {
  hojaId: number
  trazos: TrazosHoja
  guardadoAt: number
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'hojaId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function conStore<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await abrir()
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(STORE, modo).objectStore(STORE))
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
  }).finally(() => db.close())
}

export async function guardarBorrador(hojaId: number, trazos: TrazosHoja): Promise<void> {
  const borrador: Borrador = { hojaId, trazos, guardadoAt: Date.now() }
  await conStore<void>('readwrite', (s) => s.put(borrador))
}

export async function leerBorrador(hojaId: number): Promise<Borrador | null> {
  const r = await conStore<Borrador | undefined>('readonly', (s) => s.get(hojaId))
  return r ?? null
}

export async function borrarBorrador(hojaId: number): Promise<void> {
  await conStore<void>('readwrite', (s) => s.delete(hojaId))
}
```

- [ ] **Step 2: Cablear el autoguardado al servidor**

En `LienzoManuscrito`, un efecto que cada 10 segundos guarda si hay cambios:

```tsx
  useEffect(() => {
    if (!sucio || hojaActivaId === null) return
    const t = setTimeout(() => {
      guardarHoja.mutate({ id: hojaActivaId, trazos: trazosRef.current })
      setSucio(false)
    }, 10_000)
    return () => clearTimeout(t)
  }, [sucio, hojaActivaId])
```

Y al cerrar la pantalla, guardar lo pendiente antes de desmontar.

- [ ] **Step 3: Cablear el borrador local**

Guardar en IndexedDB cada 5 trazos (barato, no bloquea) y limpiar cuando el guardado al servidor confirma:

```tsx
  // En alSubir(), despues de agregar el trazo:
  if (hojaActivaId !== null && trazosRef.current.strokes.length % 5 === 0) {
    void guardarBorrador(hojaActivaId, trazosRef.current)
  }

  // En onSuccess de guardarHoja:
  void borrarBorrador(id)
```

- [ ] **Step 4: Ofrecer recuperar el borrador al abrir**

Al cargar una hoja, si hay borrador local con mas trazos que lo que vino del servidor, ofrecer recuperarlo con un `ConfirmarModal`:

```tsx
  // Al entrar a una hoja:
  const borrador = await leerBorrador(id)
  const delServidor = (destino?.trazos as TrazosHoja) ?? hojaVacia()
  if (borrador && borrador.trazos.strokes.length > delServidor.strokes.length) {
    setRecuperable({ id, borrador: borrador.trazos, servidor: delServidor })
  }
```

Con el mensaje: *"Encontramos trazos sin guardar de esta hoja, probablemente por un corte de conexión. ¿Querés recuperarlos?"* — botones "Recuperar" y "Descartar".

- [ ] **Step 5: Indicador de estado**

En la barra superior, texto discreto: "Guardando…" mientras `guardarHoja.isPending`, "Guardado" cuando `!sucio`, "Sin guardar" cuando `sucio`. Con `aria-live="polite"` para que un lector de pantalla lo anuncie.

- [ ] **Step 6: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/manuscrito/borradorLocal.ts apps/web/src/features/agenda/LienzoManuscrito.tsx
git commit -m "feat(manuscrito): autoguardado cada 10s + borrador en IndexedDB"
```

---

## Task 12: Integracion en AtencionModal

**Files:**
- Create: `apps/web/src/features/agenda/HojasManuscritasPanel.tsx`
- Modify: `apps/web/src/features/agenda/AtencionModal.tsx` (bajo el `FloatingTextarea` de Evolucion, ~linea 189)

**Interfaces:**
- Consumes: `LienzoManuscrito` (Tasks 8-11), `HojaRenderer` (Task 7).
- Produces: `<HojasManuscritasPanel cita={Cita} puedeEditar={boolean} hayAtencion={boolean} onTranscribir={(texto: string) => void} />`

- [ ] **Step 1: Cargar los skills de UI**

Obligatorio.

- [ ] **Step 2: Escribir la deteccion de dispositivo tactil**

Escribir es **solo tablet y celular** (decision del owner). Leer es en cualquier lado.

```tsx
// Modulo aparte o al tope del archivo. Se evalua una vez: el tipo de puntero de
// un dispositivo no cambia durante la sesion.
const ESCRITURA_DISPONIBLE =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0)
```

- [ ] **Step 3: Escribir el panel**

Sigue el patron visual exacto de los bloques "Adjuntos" y "Recetas" que ya estan en `AtencionModal` (`AtencionModal.tsx:200-305`): titulo a la izquierda, accion en link a la derecha, lista abajo, y una leyenda cuando esta vacio.

- Titulo: "Notas manuscritas".
- Accion derecha (solo si `puedeEditar && hayAtencion && ESCRITURA_DISPONIBLE`): "Escribir a mano" con icono `PenLine`.
- Lista: miniaturas con `<HojaRenderer ancho={64} />`, numero de hoja y fecha, en una fila con `overflow-x-auto` (**nunca overflow horizontal de la página**).
- Vacio: `hayAtencion ? 'Sin notas manuscritas' : 'Guarde la atención para poder escribir a mano'`.
- Si hay hojas y `puedeEditar`: boton "Transcribir a texto" con icono `FileText`.
- En un dispositivo sin puntero tactil con hojas ya escritas: se ven las miniaturas y se pueden abrir en solo lectura, pero no aparece "Escribir a mano". Leyenda: "Para escribir a mano, abrí esta atención desde una tablet o un celular con lápiz."

- [ ] **Step 4: Montar el panel en AtencionModal**

Justo despues del `FloatingTextarea` de "Evolución / notas" y antes del `FloatingInput` de "Próximo control":

```tsx
            <HojasManuscritasPanel
              cita={cita}
              puedeEditar={puedeEditar}
              hayAtencion={!!atencion}
              onTranscribir={(texto) => set('evolucion', texto)}
            />
```

- [ ] **Step 5: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/agenda/HojasManuscritasPanel.tsx apps/web/src/features/agenda/AtencionModal.tsx
git commit -m "feat(manuscrito): panel de hojas en el modal de Atencion"
```

---

## Task 13: Transcribir desde la UI

**Files:**
- Create: `apps/web/src/components/manuscrito/rasterizar.ts`
- Modify: `apps/web/src/features/agenda/HojasManuscritasPanel.tsx`

**Interfaces:**
- Consumes: `pintarHoja` (Task 7), `OCR_LADO_LARGO` (Task 1), endpoint de Task 5.
- Produces: `rasterizarHoja(trazos: TrazosHoja): Promise<Blob>` — PNG con el lado largo en 2576 px.

- [ ] **Step 1: Escribir el rasterizador**

`apps/web/src/components/manuscrito/rasterizar.ts`:

```typescript
import { HOJA_H, HOJA_W, OCR_LADO_LARGO, type TrazosHoja } from '@pos/types'
import { pintarHoja } from './dibujar'

/**
 * Redibuja la hoja a un PNG de 2576 px de lado largo, que es el maximo que
 * aprovecha la vision del modelo. El blob es efimero: se manda y se descarta,
 * nunca se guarda.
 */
export async function rasterizarHoja(trazos: TrazosHoja): Promise<Blob> {
  const escala = OCR_LADO_LARGO / HOJA_H // A4 vertical: el lado largo es el alto
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(HOJA_W * escala)
  canvas.height = Math.round(HOJA_H * escala)

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo preparar la imagen de la hoja')

  // Fondo blanco explicito: un PNG transparente le da mucho menos contraste al
  // modelo y baja la precision de la transcripcion.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.setTransform(escala, 0, 0, escala, 0, 0)
  pintarHoja(ctx, trazos)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen de la hoja'))),
      'image/png',
    )
  })
}
```

- [ ] **Step 2: Cablear la mutation de transcripcion**

```tsx
  const transcribir = useMutation({
    mutationFn: async () => {
      const textos: string[] = []
      for (const hoja of hojas) {
        const blob = await rasterizarHoja(hoja.trazos as TrazosHoja)
        const fd = new FormData()
        fd.append('imagen', blob, `hoja-${hoja.orden}.png`)
        const { data } = await api.post(`/atenciones/cita/${cita.id}/hojas/${hoja.id}/transcribir`, fd)
        if (data.texto) textos.push(data.texto)
      }
      return textos.join('\n\n')
    },
    onSuccess: (texto) => {
      if (!texto) {
        toast.error('No se pudo leer texto en las hojas')
        return
      }
      qc.invalidateQueries({ queryKey: ['hojas', cita.id] })
      setTextoTranscrito(texto) // abre el modal de decision si ya hay evolucion
    },
    onError: (err: any) => toast.fromError(err, 'No se pudo transcribir'),
  })
```

Las hojas se transcriben **en orden** y se unen con una linea en blanco. Secuencial a proposito: son pocas hojas y en paralelo el costo y el rate limit se disparan sin ganancia real.

- [ ] **Step 3: Modal de reemplazar o agregar**

Si "Evolución" ya tiene texto, hay que preguntar. Con un modal del design system, nunca `window.confirm`.

- Titulo: "Transcripción lista".
- Mensaje: "El campo Evolución ya tiene texto. ¿Qué querés hacer con la transcripción?"
- Botones: "Reemplazar" (destructivo), "Agregar abajo" (primario), "Cancelar" (outline).
- "Agregar abajo" une con `\n\n`.

Si el campo esta vacio, se llena directo sin preguntar.

- [ ] **Step 4: Aviso de revision**

Tras insertar, mostrar bajo el campo un aviso inline hasta que el doctor guarde:

> "Texto generado desde tu escritura. Revisalo antes de guardar."

Con icono `AlertCircle` y `role="status"`. Sin estado persistido: vive en el componente.

- [ ] **Step 5: Estado de carga honesto**

La transcripcion tarda varios segundos por hoja. El boton muestra "Transcribiendo hoja 2 de 3…" con el contador real, no un spinner mudo.

- [ ] **Step 6: Deshabilitar el boton si el servidor no tiene la key**

Sin esto el doctor descubre que falta la configuracion recien al apretar y comerse un 503.

```tsx
  const { data: estadoOcr } = useQuery<{ disponible: boolean }>({
    queryKey: ['transcripcion', 'estado'],
    queryFn: () => api.get('/atenciones/transcripcion/estado').then((r) => r.data),
    staleTime: Infinity, // no cambia sin reiniciar el servidor
  })
```

Con `disabled={!estadoOcr?.disponible}` en el boton y, cuando esta deshabilitado, la leyenda: *"La transcripción automática no está configurada en el servidor."* Las hojas se siguen escribiendo y guardando normalmente: solo se cae la transcripcion.

- [ ] **Step 7: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/manuscrito/rasterizar.ts apps/web/src/features/agenda/HojasManuscritasPanel.tsx
git commit -m "feat(manuscrito): transcribir hojas a texto desde el modal"
```

---

## Task 14: Solo lectura en la historia clinica

**Files:**
- Modify: `apps/web/src/features/pacientes/HistoriaClinicaTimeline.tsx`

**Interfaces:**
- Consumes: `HojaRenderer` (Task 7).
- Produces: nada nuevo.

- [ ] **Step 1: Cargar los skills de UI**

Obligatorio.

- [ ] **Step 2: Exponer las hojas en la linea de tiempo del API**

En `atenciones.service.ts`, en `findByPaciente` (~linea 99), agregar al `include`:

```typescript
        hojas: {
          where: { deletedAt: null },
          orderBy: { orden: 'asc' },
          select: { id: true, orden: true, trazos: true },
        },
```

Asi la miniatura se dibuja sin una request extra por atencion.

- [ ] **Step 3: Mostrar las miniaturas**

En cada entrada de la linea de tiempo con hojas, una fila de miniaturas (`<HojaRenderer ancho={56} />`) dentro de un contenedor `overflow-x-auto`. Al tocar una, se abre un visor a pantalla completa en **solo lectura**, con flechas para pasar de hoja y boton de cerrar.

Esto se ve **en cualquier dispositivo, incluida la PC**: la restriccion a tablet/celular es solo para escribir.

- [ ] **Step 4: Typecheck**

```bash
cd apps/api && npx tsc --noEmit
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/atenciones/atenciones.service.ts apps/web/src/features/pacientes/HistoriaClinicaTimeline.tsx
git commit -m "feat(manuscrito): hojas en solo lectura en la historia clinica"
```

---

## Task 15: Aviso de Scribble y ayuda

iPadOS Scribble intercepta trazos del Pencil sobre el canvas cuando el patron parece escritura — que es exactamente lo que hace el doctor. Sin opt-out desde la web.

**Files:**
- Modify: `apps/web/src/features/agenda/LienzoManuscrito.tsx`
- Modify: `apps/web/src/features/ayuda/contenido.ts`

- [ ] **Step 1: Cargar los skills de UI**

Obligatorio.

- [ ] **Step 2: Detectar iPad y mostrar el aviso una sola vez**

```tsx
// iPadOS 13+ se reporta como Mac; maxTouchPoints lo distingue de una Mac real.
const ES_IPAD =
  typeof navigator !== 'undefined' &&
  (/iPad/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

const CLAVE_AVISO = 'consultech:aviso-scribble'
```

Al montar el lienzo, si `ES_IPAD` y no hay marca en `localStorage`, mostrar un aviso descartable:

> **Si se te cortan los trazos, apagá Scribble**
> iPadOS intenta convertir tu escritura a texto y a veces se queda con un trazo. Andá a **Ajustes → Apple Pencil → Scribble** y desactivalo. La transcripción a texto la hace este sistema con el botón "Transcribir".

Botones: "Entendido" (marca `localStorage` y no vuelve a aparecer) y "Ver en Ayuda".

- [ ] **Step 3: Documentar en /ayuda**

El manual vive en datos, no en JSX: `apps/web/src/features/ayuda/contenido.ts` exporta `AYUDA: SeccionAyuda[]`, y la pagina solo lo renderiza. Agregar un `TemaAyuda` al array `temas` de la seccion con `rol: Rol.DOCTOR`:

```typescript
      {
        id: 'escribir-a-mano',
        titulo: 'Escribir la nota a mano',
        intro:
          'Desde una tablet o un celular con lápiz podés escribir la sesión a mano y después pasarla a texto.',
        pasos: [
          'Abrí la cita y tocá "Atención". Guardá la atención una primera vez: recién ahí se habilita escribir a mano.',
          'En el bloque "Notas manuscritas", tocá "Escribir a mano". Se abre la hoja a pantalla completa.',
          'Escribí con el lápiz. Podés cambiar grosor y color, borrar trazos y deshacer. La hoja se guarda sola cada pocos segundos.',
          'Tocá "+ Hoja" para agregar más hojas. Se numeran solas y podés pasar de una a otra con las flechas.',
          'Al terminar, cerrá la hoja y tocá "Transcribir a texto": el sistema lee tu escritura y la escribe en "Evolución / notas". Revisá el texto antes de guardar.',
          'En iPad, si notás que se te cortan los trazos, andá a Ajustes → Apple Pencil → Scribble y desactivalo. Scribble intenta convertir tu escritura a texto por su cuenta y a veces se queda con un trazo.',
          'Desde una computadora podés ver las hojas escritas, pero no escribir: para eso hace falta una tablet o un celular con lápiz.',
        ],
      },
```

El campo `imagen` se deja sin poner: se cablea en la fase de capturas, igual que el resto de los temas.

- [ ] **Step 4: Typecheck**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/agenda/LienzoManuscrito.tsx apps/web/src/features/ayuda/contenido.ts
git commit -m "feat(manuscrito): aviso de Scribble en iPad y seccion en Ayuda"
```

---

## Task 16: E2E, verificacion final y entrega

**Files:**
- Create: `apps/web/e2e/manuscrito.spec.ts`

- [ ] **Step 1: Escribir el spec de Playwright**

Cubre solo el camino automatizable con puntero generico. **La presion y `pointerType: 'pen'` no se simulan con la API estandar de Playwright**: si hace falta cubrirlos hay que bajar a CDP, y conviene verificar la API exacta al escribirlo en vez de asumirla. Si resulta caro, quedan fuera del E2E y los cubre la prueba manual del Step 4.

Casos:
1. Login, ir a la agenda, poner una cita `EN_ATENCION`, abrir Atención y guardarla.
2. El bloque "Notas manuscritas" aparece con la leyenda de vacio.
3. Abrir el lienzo, dibujar con `mouse.move`/`down`/`up`, verificar que el contador de trazos sube.
4. Deshacer: el trazo desaparece.
5. "+ Hoja": la barra pasa a "Hoja 2 / 2".
6. Cerrar y reabrir: los trazos siguen ahí.
7. Eliminar una hoja: aparece el `ConfirmarModal` (**no** un `window.confirm`) y tras confirmar queda una sola.

La suite E2E necesita `LOGIN_RATE_LIMIT` alto en `apps/api/.env`.

- [ ] **Step 2: Correr la suite E2E**

```bash
cd apps/web && npx playwright test manuscrito
```

Esperado: PASS. **Requiere API en :3000 y vite en :5173.** Si el agente no logra levantarlos, escribir el spec, dejarlo commiteado y pedirle al owner que lo corra.

- [ ] **Step 3: Verificacion completa**

```bash
cd apps/api && npx tsc --noEmit && npx jest
cd apps/web && npx tsc --noEmit
cd packages/types && pnpm build
```

Esperado: todo verde. Despues, correr la suite E2E entera (no solo manuscrito) como regresion.

- [ ] **Step 4: Lista de prueba manual para el owner**

Escribirla en el mensaje de entrega. En hardware real, nada de emulador:

- [ ] iPad + Apple Pencil: escribir un parrafo de cursiva **con Scribble encendido** y contar si se pierden trazos. Es el gotcha del spec §4.
- [ ] Repetir **con Scribble apagado**: no se debe perder ninguno.
- [ ] Apoyar la palma mientras se escribe: no debe dibujar.
- [ ] Apretar mas fuerte: el trazo debe engrosar.
- [ ] Android con lapiz: lo mismo.
- [ ] Celular sin lapiz: el dedo debe dibujar.
- [ ] Cortar el WiFi a mitad de la nota, seguir escribiendo, volver: debe ofrecer recuperar el borrador.
- [ ] Transcribir una hoja real y comparar el texto con lo escrito.
- [ ] Anotar la version de iPadOS del dispositivo (18.2+ habilita `getCoalescedEvents`).

- [ ] **Step 5: Commit final y aviso**

```bash
git add apps/web/e2e/manuscrito.spec.ts
git commit -m "test(manuscrito): E2E del lienzo y las hojas"
```

Avisar al owner que queda **listo para deploy**, sin deployar y sin preguntar si hay que deployar. Recordarle los tres pendientes:

1. `pnpm install` en la raiz (dependencias nuevas: `perfect-freehand`, `@anthropic-ai/sdk`).
2. `ANTHROPIC_API_KEY` en `apps/api/.env` y en las variables de Railway.
3. Correr `pwsh scripts/gate-manuscrito.ps1` con la API levantada.

Y el pendiente independiente del spec: **verificar si el servicio de Railway tiene volumen montado en `UPLOADS_DIR`**, porque si no lo tiene, los adjuntos clinicos ya subidos se pierden en cada deploy.
