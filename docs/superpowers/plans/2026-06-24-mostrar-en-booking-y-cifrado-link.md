# mostrarEnBooking + Cifrado corto de IDs en el link — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir ocultar servicios del portal público de reservas (sin bloquear su reserva por deep-link) y cifrar corto los IDs de doctor/servicio en el link de reserva.

**Architecture:** (1) Flag `mostrarEnBooking` en `Servicio`; `info()` del portal filtra por él, pero `dias`/`slots`/`reservas` no (bypass por link). Endpoint público chico resuelve el nombre de un servicio oculto deep-linkeado. (2) Cifrado Sqids front-only: el generador del link codifica, `ReservarPage` decodifica al cargar; de ahí todo sigue numérico.

**Tech Stack:** NestJS + Prisma (api), React 19 + Vite + Tailwind + TanStack Query (web), `sqids` (nuevo, web).

**Spec:** `docs/superpowers/specs/2026-06-24-mostrar-en-booking-y-cifrado-link-design.md`

## Global Constraints

- `consultorioId` SIEMPRE del JWT (`@CurrentUser()`), nunca del body/params. Endpoints públicos lo derivan del slug.
- Todo DTO necesita decoradores class-validator (si no, 400).
- Soft delete / flags; nunca borrar registros.
- UI nueva/modificada pasa antes por los skills impeccable + ui-ux-pro-max + frontend-design (regla del owner). Copy visible en español con tildes.
- Verificar antes de cada commit: `cd apps/api && npx tsc --noEmit` y `cd apps/web && npx tsc --noEmit`.
- Migraciones destructivas solo en dev/local; el owner aplica en producción.
- El cifrado es ofuscación, no seguridad: el backend igual valida que el servicio pertenezca al consultorio y esté `activo`.

---

### Task 1: Campo `mostrarEnBooking` en el modelo Servicio

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `Servicio`, ~línea 201)
- Create (genera Prisma): `apps/api/prisma/migrations/<timestamp>_servicio_mostrar_en_booking/migration.sql`

**Interfaces:**
- Produces: columna `Servicio.mostrarEnBooking: boolean` (default `true`).

- [ ] **Step 1: Agregar el campo al schema**

En `model Servicio`, debajo de `activo Boolean @default(true)`:

```prisma
  activo            Boolean     @default(true)
  // El servicio aparece en el dropdown del portal publico. false = oculto
  // (solo reservable por deep-link &servicio=). No bloquea la reserva.
  mostrarEnBooking  Boolean     @default(true)
```

- [ ] **Step 2: Crear la migración (no destructiva)**

Run: `cd apps/api && npx prisma migrate dev --name servicio_mostrar_en_booking`
Expected: crea la migración y aplica en la BD local. El SQL debe ser solo
`ALTER TABLE "servicios" ADD COLUMN "mostrarEnBooking" BOOLEAN NOT NULL DEFAULT true;`

- [ ] **Step 3: Regenerar el client y verificar tipos**

Run: `cd apps/api && npx prisma generate && npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(servicios): campo mostrarEnBooking en Servicio (default true)"
```

---

### Task 2: DTO de Servicio acepta `mostrarEnBooking`

**Files:**
- Modify: `apps/api/src/modules/servicios/servicios.service.ts:6-23` (DTOs)

**Interfaces:**
- Consumes: `Servicio.mostrarEnBooking` (Task 1).
- Produces: `CreateServicioDto.mostrarEnBooking?: boolean`, heredado en `UpdateServicioDto`. `findAll` ya devuelve el campo (no usa `select`).

- [ ] **Step 1: Agregar el campo al CreateServicioDto**

En `CreateServicioDto`, después de `precioBase`:

```ts
  @IsNumber() @Min(0)
  precioBase: number

  @IsBoolean() @IsOptional()
  mostrarEnBooking?: boolean
```

(`IsBoolean` ya está importado en la línea 2.)

- [ ] **Step 2: Verificar tipos**

Run: `cd apps/api && npx tsc --noEmit`
Expected: 0 errores. `create` y `update` ya hacen spread del dto, así el campo se persiste; `findAll` lo devuelve por defecto.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/servicios/servicios.service.ts
git commit -m "feat(servicios): DTO acepta mostrarEnBooking"
```

---

### Task 3: Portal — filtrar `info()` y resolver servicio oculto

**Files:**
- Modify: `apps/api/src/modules/portal/portal.service.ts` (`info()` ~línea 121; agregar método `servicio()`)
- Modify: `apps/api/src/modules/portal/portal.controller.ts` (nuevo endpoint, antes de las rutas con `:slug/:param` ambiguas)

**Interfaces:**
- Consumes: `Servicio.mostrarEnBooking` (Task 1).
- Produces:
  - `info()` ya NO incluye servicios con `mostrarEnBooking: false`.
  - `GET /public/:slug/servicio/:id` → `{ id: number, nombre: string, duracionMin: number }` (404 si no es del consultorio o no está activo). Devuelve también servicios ocultos (el deep-link es el permiso).

- [ ] **Step 1: Filtrar servicios visibles en `info()`**

En `portal.service.ts`, dentro de `info()`, en el `findMany` de servicios, agregar `mostrarEnBooking: true` al `where`:

```ts
      this.prisma.servicio.findMany({
        where: { consultorioId: c.id, activo: true, mostrarEnBooking: true },
        select: { id: true, nombre: true, duracionMin: true },
        orderBy: { nombre: 'asc' },
      }),
```

- [ ] **Step 2: Agregar el método `servicio()` para resolver el oculto**

En `portal.service.ts`, después de `info()`:

```ts
  // Resuelve el nombre de un servicio para el deep-link (?servicio=). Devuelve
  // tambien servicios ocultos (mostrarEnBooking:false): el link directo es el
  // permiso. Solo exige que pertenezca al consultorio y este activo.
  async servicio(slug: string, servicioId: number) {
    const c = await this.consultorioPorSlug(slug)
    const s = await this.prisma.servicio.findFirst({
      where: { id: servicioId, consultorioId: c.id, activo: true },
      select: { id: true, nombre: true, duracionMin: true },
    })
    if (!s) throw new NotFoundException('Servicio no encontrado')
    return s
  }
```

- [ ] **Step 3: Exponer el endpoint en el controller**

En `portal.controller.ts`, agregar (después del endpoint `info`, antes de `dias`/`slots`):

```ts
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Get(':slug/servicio/:id')
  @ApiOperation({ summary: 'Nombre/duracion de un servicio (resuelve deep-link, incluye ocultos)' })
  servicio(@Param('slug') slug: string, @Param('id', ParseIntPipe) id: number) {
    return this.service.servicio(slug, id)
  }
```

(`ParseIntPipe`, `Param`, `Get`, `Throttle`, `Public` ya están importados.)

- [ ] **Step 4: Verificar tipos**

Run: `cd apps/api && npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/portal/portal.service.ts apps/api/src/modules/portal/portal.controller.ts
git commit -m "feat(portal): info filtra por mostrarEnBooking + endpoint servicio/:id"
```

---

### Task 4: Toggle "Mostrar en reservas online" en ServicioModal

**Files:**
- Modify: `apps/web/src/features/catalogo/ServicioModal.tsx`

**Interfaces:**
- Consumes: DTO `mostrarEnBooking` (Task 2).

- [ ] **Step 1 (UI gate): pasar por los skills de UI antes del JSX**

Antes de escribir el checkbox, invocar impeccable + ui-ux-pro-max + frontend-design (regla del proyecto). Para un toggle dentro de un form ya existente, aplicar: touch target ≥44px, label clickeable, `cursor-pointer`, focus-visible. Reusar el estilo del checkbox "Servicio activo" ya presente en este modal (líneas 104-111) para consistencia.

- [ ] **Step 2: Agregar `mostrarEnBooking` al estado del form**

En el `useState` del form (línea 28):

```ts
  const [form, setForm] = useState({
    nombre: servicio?.nombre ?? '',
    descripcion: servicio?.descripcion ?? '',
    duracionMin: servicio?.duracionMin ?? 30,
    precioBase: Number(servicio?.precioBase ?? 0),
    activo: servicio?.activo ?? true,
    mostrarEnBooking: servicio?.mostrarEnBooking ?? true,
  })
```

- [ ] **Step 3: Agregar el campo a la interfaz local y al payload**

En `interface Servicio` (línea 10), agregar `mostrarEnBooking?: boolean`. En el `payload` de la mutation (línea 38), agregar `mostrarEnBooking: data.mostrarEnBooking` (siempre, en create y edit):

```ts
      const payload = {
        nombre: data.nombre,
        descripcion: data.descripcion || undefined,
        duracionMin: data.duracionMin,
        precioBase: data.precioBase,
        mostrarEnBooking: data.mostrarEnBooking,
        ...(editando ? { activo: data.activo } : {}),
      }
```

- [ ] **Step 4: Renderizar el toggle (antes del bloque de "Servicio activo")**

Insertar después del `</div>` del grid de duración/precio (línea 103), antes del `{editando && (` del checkbox activo:

```tsx
          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <input type="checkbox" checked={form.mostrarEnBooking}
              onChange={(e) => setForm((f) => ({ ...f, mostrarEnBooking: e.target.checked }))}
              className="rounded" />
            Mostrar en reservas online
          </label>
```

- [ ] **Step 5: Verificar tipos**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/catalogo/ServicioModal.tsx
git commit -m "feat(catalogo): toggle Mostrar en reservas online en ServicioModal"
```

---

### Task 5: Instalar `sqids` y crear el codec en el front

**Files:**
- Modify: `apps/web/package.json` (dep `sqids`)
- Create: `apps/web/src/lib/portal-codec.ts`

**Interfaces:**
- Produces:
  - `encodeId(id: number): string`
  - `decodeId(code: string): number | null` (null si el código es inválido)

- [ ] **Step 1: Instalar sqids en apps/web**

Run: `pnpm --filter web add sqids`
Expected: agrega `"sqids"` a `apps/web/package.json` dependencies.

- [ ] **Step 2: Confirmar la API del paquete**

Run: `node -e "const S=require('sqids').default; const s=new S({minLength:4}); const c=s.encode([7]); console.log(c, s.decode(c))"`
Expected: imprime un código (ej. `Xk9p`) y `[ 7 ]`. (Si el import difiere, ajustar el `import` del Step 3 a la forma real del paquete.)

- [ ] **Step 3: Crear `portal-codec.ts`**

```ts
import Sqids from 'sqids'

// Ofuscacion (no seguridad) de los ids numericos de doctor/servicio en el link
// de reserva: doctor=5 -> doctor=aB2k. Mismo id -> mismo codigo. El backend
// igual valida pertenencia/activo. minLength 4 para que ids chicos no salgan
// de 1-2 chars. Alfabeto fijo barajado (estable: no cambiar o se rompen los
// links ya compartidos).
const ALFABETO = 'fhpwxKQRTUVbn23456789ABCDEFGHJKLMNPqrstuvyz'
const sqids = new Sqids({ alphabet: ALFABETO, minLength: 4 })

export function encodeId(id: number): string {
  return sqids.encode([id])
}

export function decodeId(code: string): number | null {
  const out = sqids.decode(code)
  return out.length === 1 ? out[0] : null
}
```

- [ ] **Step 4: Verificar tipos**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 5: Verificar round-trip con un script de un solo uso**

Crear `apps/web/scratch-codec.mjs`:

```js
import Sqids from 'sqids'
const ALFABETO = 'fhpwxKQRTUVbn23456789ABCDEFGHJKLMNPqrstuvyz'
const s = new Sqids({ alphabet: ALFABETO, minLength: 4 })
const enc = (n) => s.encode([n])
const dec = (c) => { const o = s.decode(c); return o.length === 1 ? o[0] : null }
for (const n of [1, 5, 7, 42, 1000]) {
  const c = enc(n)
  console.log(n, '->', c, '->', dec(c), dec(c) === n ? 'OK' : 'FAIL')
}
console.log('basura ->', dec('???'))
```

Run: `node apps/web/scratch-codec.mjs && rm apps/web/scratch-codec.mjs`
Expected: cada línea `OK`, y `basura -> null`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/lib/portal-codec.ts
git commit -m "feat(portal): codec Sqids para ofuscar ids del link de reserva"
```

---

### Task 6: Codificar en el link y decodificar en ReservarPage

**Files:**
- Modify: `apps/web/src/features/agenda/NuevaCitaModal.tsx` (`buildLinkReserva`, ~línea 174)
- Modify: `apps/web/src/features/portal/ReservarPage.tsx` (lectura de params + resolver nombre del oculto)

**Interfaces:**
- Consumes: `encodeId`, `decodeId` (Task 5); `GET /public/:slug/servicio/:id` (Task 3).

- [ ] **Step 1: Codificar en `buildLinkReserva`**

En `NuevaCitaModal.tsx`, importar el codec (junto a los imports de `lib/`):

```ts
import { encodeId } from '../../lib/portal-codec'
```

Cambiar `buildLinkReserva` (líneas 174-181):

```ts
  function buildLinkReserva() {
    const query = new URLSearchParams()
    if (doctorId) query.set('doctor', encodeId(Number(doctorId)))
    if (servicioId) query.set('servicio', encodeId(Number(servicioId)))
    if (pacienteSeleccionado && tokenPortal?.token) query.set('p', tokenPortal.token)
    const qs = query.toString()
    return `${publicBaseUrl()}/reservar/${consultorio!.slug}${qs ? `?${qs}` : ''}`
  }
```

- [ ] **Step 2: Decodificar los params al cargar ReservarPage**

En `ReservarPage.tsx`, importar el codec:

```ts
import { decodeId } from '../../lib/portal-codec'
```

Reemplazar la lectura cruda (líneas 30, 39-40). Hoy:

```ts
  const doctorFijo = params.get('doctor')
  ...
  const [servicioId, setServicioId] = useState(params.get('servicio') ?? '')
  const [doctorId, setDoctorId] = useState(doctorFijo ?? '')
```

Nuevo (decodificar código → id numérico string; código inválido → vacío):

```ts
  // El link trae doctor/servicio cifrados con Sqids (ofuscacion). Se decodifican
  // a id numerico; un codigo invalido se ignora (el paciente elige normal).
  const decodeParam = (raw: string | null) => {
    if (!raw) return ''
    const n = decodeId(raw)
    return n != null ? String(n) : ''
  }
  const doctorFijo = decodeParam(params.get('doctor'))
  ...
  const [servicioId, setServicioId] = useState(decodeParam(params.get('servicio')))
  const [doctorId, setDoctorId] = useState(doctorFijo)
```

(Nota: `doctorFijo` se usa más abajo como string id; con el decode queda `''` o el id numérico, manteniendo el tipo string. Revisar que los usos de `doctorFijo` —filtros de doctores, líneas ~255-271— sigan comparando contra `String(d.id)`, que ya es el patrón actual.)

- [ ] **Step 3: Resolver el nombre del servicio oculto deep-linkeado**

En `ReservarPage.tsx`, agregar una query que, cuando hay `servicioId` y NO está en `info.servicios` (porque está oculto/filtrado), pida el nombre al endpoint nuevo. Insertar después de la query `info` (línea 60-64):

```ts
  // Si el link trae un servicio que no esta en la lista publica (oculto), pedir
  // su nombre/duracion para mostrarlo como seleccionado.
  const servicioEnLista = info?.servicios.some((s) => String(s.id) === servicioId)
  const { data: servicioOculto } = useQuery<{ id: number; nombre: string; duracionMin: number }>({
    queryKey: ['portal-servicio', slug, servicioId],
    queryFn: () => api.get(`/public/${slug}/servicio/${servicioId}`).then((r) => r.data),
    enabled: !!servicioId && !!info && !servicioEnLista,
    retry: 0,
  })
```

Luego, donde el componente arma la lista/nombre del servicio seleccionado para mostrar, incluir `servicioOculto` como fallback. Construir el nombre a mostrar:

```ts
  const nombreServicioSel =
    info?.servicios.find((s) => String(s.id) === servicioId)?.nombre ??
    servicioOculto?.nombre ??
    ''
```

Usar `nombreServicioSel` en el lugar donde hoy se muestra el nombre del servicio elegido (selector/encabezado de confirmación). Si el dropdown de servicios solo lista `info.servicios`, y el servicio es oculto, mostrarlo como opción fija seleccionada (no editable) usando `nombreServicioSel`.

- [ ] **Step 4: Verificar tipos**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/agenda/NuevaCitaModal.tsx apps/web/src/features/portal/ReservarPage.tsx
git commit -m "feat(portal): link cifra ids con Sqids y ReservarPage resuelve servicio oculto"
```

---

### Task 7: Gate de regresión (owner-runnable)

**Files:**
- Create: `apps/api/scripts/gate-mostrar-en-booking.ps1` (o `scripts/`, según dónde vivan los gates del repo — usar la misma carpeta que `gate-e3-noshow.ps1`)

**Interfaces:**
- Consumes: endpoints de Tasks 1-3.

- [ ] **Step 1: Escribir el gate**

Reusar el harness de creación de tenant + login de un gate existente (ej. `scripts/gate-aseguradoras-f2.ps1`): registrar consultorio, loguear, obtener token. Luego, con el token (ADMIN), las aserciones específicas:

1. Crear servicio A `mostrarEnBooking: true` y servicio B `mostrarEnBooking: false` (`POST /servicios`).
2. Activar portal del consultorio y setear slug (según el harness de portal usado por gates previos).
3. `GET /public/:slug` → `servicios` incluye A, NO incluye B.
4. `GET /public/:slug/servicio/:idB` → 200 con `nombre` de B (oculto, resuelto por id).
5. `GET /public/:slug/servicio/:idInexistente` → 404.
6. (Opcional, si el harness ya crea doctor+disponibilidad) `GET /public/:slug/dias?doctorId=...&servicioId=:idB&mes=...` no falla por estar oculto (bypass).

Estructura PowerShell (PS 5.1: `ConvertFrom-Json -InputObject`; arrays no se enumeran en el pipeline):

```powershell
# ... harness: $base, $token, $slug ya seteados ...
$h = @{ Authorization = "Bearer $token" }
$svcA = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType 'application/json' -Body (@{ nombre='Consulta'; duracionMin=30; precioBase=100; mostrarEnBooking=$true } | ConvertTo-Json)
$svcB = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType 'application/json' -Body (@{ nombre='Reconsulta'; duracionMin=20; precioBase=80; mostrarEnBooking=$false } | ConvertTo-Json)

$info = Invoke-RestMethod -Uri "$base/public/$slug" -Method Get
$ids = @($info.servicios | ForEach-Object { $_.id })
if ($ids -contains $svcB.id) { throw 'FAIL: servicio oculto aparece en info' }
if (-not ($ids -contains $svcA.id)) { throw 'FAIL: servicio visible no aparece en info' }

$resuelto = Invoke-RestMethod -Uri "$base/public/$slug/servicio/$($svcB.id)" -Method Get
if ($resuelto.nombre -ne 'Reconsulta') { throw 'FAIL: no resolvio el servicio oculto' }

try {
  Invoke-RestMethod -Uri "$base/public/$slug/servicio/999999" -Method Get | Out-Null
  throw 'FAIL: servicio inexistente no dio 404'
} catch { if ($_.Exception.Response.StatusCode.value__ -ne 404) { throw } }

Write-Host 'GATE mostrar-en-booking: PASS' -ForegroundColor Green
```

- [ ] **Step 2: Commit (el owner corre el gate con la API levantada)**

```bash
git add apps/api/scripts/gate-mostrar-en-booking.ps1
git commit -m "test(portal): gate de mostrarEnBooking + resolver servicio oculto"
```

---

## Notas de cierre

- Tras todo: `cd apps/api && npx tsc --noEmit` y `cd apps/web && npx tsc --noEmit` en verde.
- El owner corre el gate (`scripts/gate-mostrar-en-booking.ps1`) con la API en `:3000`.
- Listo para deploy cuando el owner lo pida (no deployar por iniciativa propia).
