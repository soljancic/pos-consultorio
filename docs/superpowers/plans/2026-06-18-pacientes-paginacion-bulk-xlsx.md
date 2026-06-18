# Pacientes: paginacion + bulk XLSX + restyle header — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer escalable la pagina de Pacientes con paginacion server-side + scroll infinito, agregar carga/baja masiva XLSX (import con crear/actualizar, export, archivo de ejemplo) y reestilar el header (buscador centrado + split button).

**Architecture:** Backend NestJS/Prisma: `GET /pacientes` pasa a offset paginado `{items,total}`; tres endpoints ADMIN nuevos (`POST /pacientes/import`, `GET /pacientes/export`, `GET /pacientes/import/sample`) usando `exceljs`. Frontend React: `useInfiniteQuery` + IntersectionObserver para la lista, split-button con menu accesible nuevo, y modal de import.

**Tech Stack:** NestJS, Prisma, class-validator, exceljs, multer (memoryStorage, ya presente), React 19, TanStack Query v5 (`useInfiniteQuery`), Tailwind, axios.

## Global Constraints

- Multi-tenant: `consultorioId` SIEMPRE del JWT (`@CurrentUser()`), nunca del body/params.
- DTOs con class-validator (ValidationPipe global con whitelist + forbidNonWhitelisted).
- Roles con enum: `@Roles(Rol.ADMIN)` (Rol de `@pos/types`). RolesGuard ya es global.
- Rutas literales declaradas ANTES de las parametrizadas (`:id`) en el controller.
- Borrado soft (no aplica aca, pero export incluye activos + archivados, `deletedAt: null`).
- Decimal de Prisma → string en JSON; `Number()` solo para mostrar.
- Frontend manda `undefined` (no `''`) en opcionales vacios.
- UI nueva/modificada pasa por skills **impeccable + ui-ux-pro-max + frontend-design** ANTES del JSX. Respeta tokens de `lib/ui.ts`, FloatingInput/Select/Textarea, touch >=44px, focus-visible, tabular-nums. Copy en espanol con tildes. Sin `window.confirm/alert/prompt`.
- Verificacion por tarea: `cd apps/api && npx tsc --noEmit` y/o `cd apps/web && npx tsc --noEmit`.
- Tests de integracion de API corren con la API levantada (los corre el owner): `scripts/gate-*.ps1`. El agente NO puede bootear el API; corre tsc y jest unit.
- Commits directos en master (sin branch salvo pedido). No deployar.

## File Structure

**Backend (`apps/api`):**
- `package.json` — add dep `exceljs`.
- `src/modules/pacientes/pacientes.service.ts` — `findAll` paginado; nuevos metodos `importXlsx`, `exportXlsx`, `sampleXlsx`; helpers de mapeo/validacion de fila.
- `src/modules/pacientes/pacientes.xlsx.ts` — NUEVO: definicion de columnas (set completo), parser de filas, generador de workbook (aisla exceljs).
- `src/modules/pacientes/pacientes.controller.ts` — `findAll` con `page`/`limit`; rutas `export`, `import/sample`, `import` (literales antes de `:id`).
- `src/modules/pacientes/pacientes.xlsx.spec.ts` — NUEVO: unit tests del parser/columnas (jest, sin DB).
- `scripts/gate-pacientes-bulk.ps1` — NUEVO: gate de integracion (lo corre el owner).

**Frontend (`apps/web`):**
- `src/features/pacientes/PacientesPage.tsx` — header 3 zonas, scroll infinito.
- `src/components/shared/SplitButton.tsx` — NUEVO: boton primario + caret + menu accesible.
- `src/features/pacientes/ImportarPacientesModal.tsx` — NUEVO: modal de import.
- `src/lib/descargas.ts` — NUEVO: helper para bajar un blob autenticado (export/sample).
- `src/features/agenda/NuevaCitaModal.tsx` — `.data` → `.data.items`.
- `src/features/reportes/components/ReportFilters.tsx` — `.data` → `.data.items`.

---

## FASE 1 — Paginacion + scroll infinito

### Task 1: Backend — `findAll` paginado

**Files:**
- Modify: `apps/api/src/modules/pacientes/pacientes.service.ts` (metodo `findAll`, ~line 59)
- Modify: `apps/api/src/modules/pacientes/pacientes.controller.ts` (`findAll`, lines 12-21)

**Interfaces:**
- Produces: `PacientesService.findAll(consultorioId: number, opts: { search?: string; incluirInactivos?: boolean; page?: number; limit?: number }): Promise<{ items: PacienteListItem[]; total: number }>`
- Controller `GET /pacientes?page&limit&search&incluirInactivos` → `{ items, total }`.

- [ ] **Step 1: Reescribir `findAll` en el service**

Reemplazar el metodo `findAll` actual por:

```ts
async findAll(
  consultorioId: number,
  opts: { search?: string; incluirInactivos?: boolean; page?: number; limit?: number } = {},
) {
  const page = Math.max(1, opts.page ?? 1)
  const limit = Math.min(100, Math.max(1, opts.limit ?? 50))
  const search = opts.search?.trim()
  const where = {
    consultorioId,
    deletedAt: null,
    ...(opts.incluirInactivos ? {} : { activo: true }),
    ...(search && {
      OR: [
        { nombre: { contains: search, mode: 'insensitive' as const } },
        { apellido: { contains: search, mode: 'insensitive' as const } },
        { dni: { contains: search } },
        { telefono: { contains: search } },
      ],
    }),
  }
  const [items, total] = await this.prisma.$transaction([
    this.prisma.paciente.findMany({
      where,
      orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, nombre: true, apellido: true, dni: true, telefono: true,
        pais: true, email: true, deudaTotal: true, requierePrepago: true,
        activo: true, createdAt: true,
      },
    }),
    this.prisma.paciente.count({ where }),
  ])
  return { items, total }
}
```

- [ ] **Step 2: Actualizar el controller `findAll`**

Reemplazar lines 12-21 por:

```ts
@Get()
@ApiOperation({ summary: 'Listar pacientes paginado (con busqueda)' })
findAll(
  @CurrentUser() user: JwtPayload,
  @Query('search') search?: string,
  @Query('incluirInactivos') incluirInactivos?: string,
  @Query('page') page?: string,
  @Query('limit') limit?: string,
) {
  return this.service.findAll(user.consultorioId, {
    search,
    incluirInactivos: incluirInactivos === 'true',
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
  })
}
```

- [ ] **Step 3: tsc**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/pacientes/pacientes.service.ts apps/api/src/modules/pacientes/pacientes.controller.ts
git commit -m "feat(pacientes): paginacion offset en GET /pacientes ({items,total})"
```

---

### Task 2: Frontend — migrar pickers al nuevo shape

**Files:**
- Modify: `apps/web/src/features/agenda/NuevaCitaModal.tsx:55`
- Modify: `apps/web/src/features/reportes/components/ReportFilters.tsx:40`

**Interfaces:**
- Consumes: `GET /pacientes` → `{ items: Paciente[]; total: number }` (Task 1).

- [ ] **Step 1: NuevaCitaModal — leer `.items`**

Cambiar la `queryFn` (line ~55) de:
```ts
api.get(`/pacientes${pacienteQuery ? `?search=${pacienteQuery}` : ''}`).then((r) => r.data),
```
a:
```ts
api.get(`/pacientes?limit=50${pacienteQuery ? `&search=${encodeURIComponent(pacienteQuery)}` : ''}`).then((r) => r.data.items),
```

- [ ] **Step 2: ReportFilters — leer `.items`**

Cambiar la `queryFn` (line ~40) de:
```ts
api.get(`/pacientes?search=${encodeURIComponent(debouncedSearch)}`).then((r) => r.data),
```
a:
```ts
api.get(`/pacientes?limit=50&search=${encodeURIComponent(debouncedSearch)}`).then((r) => r.data.items),
```

- [ ] **Step 3: tsc**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/agenda/NuevaCitaModal.tsx apps/web/src/features/reportes/components/ReportFilters.tsx
git commit -m "refactor(pacientes): pickers leen {items} del GET /pacientes paginado"
```

---

### Task 3: Frontend — lista con scroll infinito

**Files:**
- Modify: `apps/web/src/features/pacientes/PacientesPage.tsx`

**Interfaces:**
- Consumes: `GET /pacientes?page&limit&search&incluirInactivos` → `{ items, total }`.

- [ ] **Step 1: Pasar por los skills de UI** (regla del proyecto)

Invocar impeccable + ui-ux-pro-max + frontend-design para la lista infinita (sentinela de carga, spinner al pie, contador "N pacientes"). NO escribir JSX antes.

- [ ] **Step 2: Reemplazar el `useQuery` por `useInfiniteQuery`**

En `PacientesPage.tsx`, cambiar el import y el hook:

```ts
import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
```

```ts
const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
  useInfiniteQuery<{ items: Paciente[]; total: number }>({
    queryKey: ['pacientes', debouncedSearch],
    queryFn: ({ pageParam }) =>
      api
        .get(
          `/pacientes?page=${pageParam}&limit=50${debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}&incluirInactivos=true` : ''}`,
        )
        .then((r) => r.data),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const cargados = allPages.reduce((n, p) => n + p.items.length, 0)
      return cargados < lastPage.total ? allPages.length + 1 : undefined
    },
  })

const pacientes = data?.pages.flatMap((p) => p.items) ?? []
const total = data?.pages[0]?.total ?? 0
```

- [ ] **Step 3: Sentinela IntersectionObserver al pie de la tabla**

Agregar antes del `return`:

```ts
const sentinelRef = useRef<HTMLTableRowElement | null>(null)
useEffect(() => {
  const el = sentinelRef.current
  if (!el || !hasNextPage) return
  const io = new IntersectionObserver(
    (entries) => { if (entries[0].isIntersecting && !isFetchingNextPage) fetchNextPage() },
    { rootMargin: '200px' },
  )
  io.observe(el)
  return () => io.disconnect()
}, [hasNextPage, isFetchingNextPage, fetchNextPage])
```

Y al final del `<tbody>`, despues del `.map`, agregar una fila sentinela + spinner:

```tsx
{hasNextPage && (
  <tr ref={sentinelRef}>
    <td colSpan={4} className="px-4 py-4 text-center text-sm text-muted-foreground">
      {isFetchingNextPage ? 'Cargando más...' : ''}
    </td>
  </tr>
)}
```

(El bloque `{pacientes.length === 0 && ...}` del empty-state se mantiene igual.)

- [ ] **Step 4: tsc**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/pacientes/PacientesPage.tsx
git commit -m "feat(pacientes): lista con scroll infinito (useInfiniteQuery)"
```

---

## FASE 2 — Header restyle + split button

### Task 4: Componente `SplitButton` accesible

**Files:**
- Create: `apps/web/src/components/shared/SplitButton.tsx`

**Interfaces:**
- Produces:
```ts
type SplitMenuItem = { label: string; icon?: LucideIcon; onClick: () => void }
function SplitButton(props: {
  label: string
  icon?: LucideIcon
  onPrimary: () => void
  items: SplitMenuItem[]
}): JSX.Element
```

- [ ] **Step 1: Pasar por los skills de UI** (split button + menu, estados focus/hover, a11y).

- [ ] **Step 2: Implementar el componente**

```tsx
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import { btnPrimaryUI } from '../../lib/ui'

export type SplitMenuItem = { label: string; icon?: LucideIcon; onClick: () => void }

export function SplitButton({
  label, icon: Icon, onPrimary, items,
}: { label: string; icon?: LucideIcon; onPrimary: () => void; items: SplitMenuItem[] }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div ref={wrapRef} className="relative inline-flex">
      <button type="button" onClick={onPrimary} className={cn(btnPrimaryUI, 'rounded-r-none')}>
        {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
        {label}
      </button>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Más acciones"
        onClick={() => setOpen((v) => !v)}
        className={cn(btnPrimaryUI, 'rounded-l-none border-l border-white/25 px-2 min-h-[44px]')}
      >
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-44 overflow-hidden rounded-lg border bg-card shadow-lg"
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); it.onClick() }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:bg-muted transition-colors duration-150"
            >
              {it.icon && <it.icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: tsc**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores (si `btnPrimaryUI` no soporta el `min-h`, verificar token en `lib/ui.ts`).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/shared/SplitButton.tsx
git commit -m "feat(ui): SplitButton accesible (primario + menu)"
```

---

### Task 5: Header de Pacientes — buscador centrado + split button

**Files:**
- Modify: `apps/web/src/features/pacientes/PacientesPage.tsx`

**Interfaces:**
- Consumes: `SplitButton` (Task 4); `useAuthStore` para el rol (solo ADMIN ve Importar/Exportar).

- [ ] **Step 1: Pasar por los skills de UI** (layout del header en 3 zonas, responsive: en movil el buscador baja a su propia fila).

- [ ] **Step 2: Reescribir el header y mover el buscador**

Imports nuevos:
```ts
import { Upload, Download } from 'lucide-react'
import { SplitButton } from '../../components/shared/SplitButton'
import { useAuthStore } from '../../stores/auth.store'
import { descargarBlob } from '../../lib/descargas'
```

Estado:
```ts
const esAdmin = useAuthStore((s) => s.user?.rol === 'ADMIN')
const [modalImport, setModalImport] = useState(false)
```

Header (reemplaza el `<div>` de title + acciones y SACA el buscador del body):
```tsx
<div className="flex flex-col gap-3 px-4 sm:px-6 py-4 border-b bg-card sm:flex-row sm:items-center">
  <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground shrink-0">
    <span className={chipIconUI}><Users className="h-4 w-4" aria-hidden="true" /></span>
    Pacientes
  </h1>
  <div className="relative flex-1 sm:max-w-md sm:mx-auto">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" aria-hidden="true" />
    <input
      value={search}
      onChange={(e) => handleSearch(e.target.value)}
      placeholder="Buscar por nombre, CI, teléfono..."
      aria-label="Buscar pacientes"
      className={cn(inputUI, 'pl-9')}
    />
  </div>
  <div className="flex items-center gap-2 shrink-0">
    {esAdmin ? (
      <SplitButton
        label="Nuevo paciente"
        icon={Plus}
        onPrimary={() => setModalNuevo(true)}
        items={[
          { label: 'Importar XLSX', icon: Upload, onClick: () => setModalImport(true) },
          { label: 'Exportar', icon: Download, onClick: () => descargarBlob('/pacientes/export', 'pacientes.xlsx') },
        ]}
      />
    ) : (
      <button onClick={() => setModalNuevo(true)} className={btnPrimaryUI}>
        <Plus className="h-4 w-4" aria-hidden="true" /> Nuevo paciente
      </button>
    )}
    <CampanaHeader />
  </div>
</div>
```

Borrar el bloque viejo del buscador que estaba dentro de `<div className="p-4 sm:p-6 flex-1 overflow-auto">`.

Al final, junto al `PacienteModal`, montar el modal de import (Task 8):
```tsx
{modalImport && <ImportarPacientesModal onClose={() => setModalImport(false)} />}
```
(con su import; este modal se crea en Task 8 — si se ejecuta antes, dejar el import comentado y completar en Task 8.)

- [ ] **Step 3: Crear el helper de descarga autenticada**

Create `apps/web/src/lib/descargas.ts`:
```ts
import { api } from './api-client'

// Descarga un endpoint autenticado (JWT via axios) como archivo.
export async function descargarBlob(url: string, filename: string) {
  const res = await api.get(url, { responseType: 'blob' })
  const href = URL.createObjectURL(res.data as Blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(href)
}
```

- [ ] **Step 4: tsc**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores. (Verificar la forma real de `useAuthStore` y del campo rol en `stores/auth.store.ts`; ajustar el selector si difiere.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/pacientes/PacientesPage.tsx apps/web/src/lib/descargas.ts
git commit -m "feat(pacientes): header con buscador centrado + split button (Nuevo/Importar/Exportar)"
```

---

## FASE 3 — Import / Export / Sample XLSX

### Task 6: Backend — dep exceljs + modulo de columnas/parser

**Files:**
- Modify: `apps/api/package.json` (dep `exceljs`)
- Create: `apps/api/src/modules/pacientes/pacientes.xlsx.ts`
- Create: `apps/api/src/modules/pacientes/pacientes.xlsx.spec.ts`

**Interfaces:**
- Produces:
```ts
export const COLUMNS: Array<{ key: string; header: string }>  // set completo, en orden
export type FilaPaciente = { nombre?: string; apellido?: string; dni?: string; telefono?: string; pais?: string; email?: string; sexo?: string; fechaNacimiento?: string; direccion?: string; notas?: string }
export function parseWorkbook(buffer: Buffer): Promise<FilaPaciente[]>   // mapea por header
export function buildWorkbook(rows: FilaPaciente[]): Promise<Buffer>     // export
export function buildSample(): Promise<Buffer>                          // headers + 1 ejemplo
```

- [ ] **Step 1: Instalar exceljs**

Run: `cd apps/api && pnpm add exceljs`
Expected: `exceljs` aparece en dependencies. Anotar la version instalada.

- [ ] **Step 2: Escribir el test del parser (falla primero)**

Create `apps/api/src/modules/pacientes/pacientes.xlsx.spec.ts`:
```ts
import { COLUMNS, buildSample, buildWorkbook, parseWorkbook } from './pacientes.xlsx'

describe('pacientes.xlsx', () => {
  it('round-trip: buildWorkbook -> parseWorkbook conserva los campos', async () => {
    const rows = [
      { nombre: 'Juan', apellido: 'Perez', dni: '123', telefono: '5551234', pais: 'BO',
        email: 'j@x.com', sexo: 'M', fechaNacimiento: '1990-05-01', direccion: 'Calle 1', notas: 'ok' },
    ]
    const buf = await buildWorkbook(rows)
    const parsed = await parseWorkbook(buf)
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toMatchObject(rows[0])
  })

  it('el sample trae los headers del set completo', async () => {
    const buf = await buildSample()
    const parsed = await parseWorkbook(buf)
    expect(parsed.length).toBeGreaterThanOrEqual(1) // 1 fila de ejemplo
  })

  it('COLUMNS tiene nombre y apellido primero', () => {
    expect(COLUMNS.slice(0, 2).map((c) => c.key)).toEqual(['nombre', 'apellido'])
  })
})
```

- [ ] **Step 3: Correr el test (falla)**

Run: `cd apps/api && npx jest pacientes.xlsx -c jest.config.js 2>/dev/null || npx jest pacientes.xlsx`
Expected: FAIL ("Cannot find module './pacientes.xlsx'").

- [ ] **Step 4: Implementar `pacientes.xlsx.ts`**

```ts
import * as ExcelJS from 'exceljs'

export const COLUMNS = [
  { key: 'nombre', header: 'nombre' },
  { key: 'apellido', header: 'apellido' },
  { key: 'dni', header: 'dni' },
  { key: 'telefono', header: 'telefono' },
  { key: 'pais', header: 'pais' },
  { key: 'email', header: 'email' },
  { key: 'sexo', header: 'sexo' },
  { key: 'fechaNacimiento', header: 'fechaNacimiento' },
  { key: 'direccion', header: 'direccion' },
  { key: 'notas', header: 'notas' },
] as const

export type FilaPaciente = Partial<Record<(typeof COLUMNS)[number]['key'], string>>

function celdaToStr(v: ExcelJS.CellValue): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'object' && 'text' in v) return String((v as { text: string }).text).trim() || undefined
  if (v instanceof Date) return v.toISOString().slice(0, 10) // YYYY-MM-DD
  const s = String(v).trim()
  return s || undefined
}

export async function parseWorkbook(buffer: Buffer): Promise<FilaPaciente[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ArrayBuffer)
  const ws = wb.worksheets[0]
  if (!ws) return []
  // headers de la primera fila -> indice de columna
  const headerRow = ws.getRow(1)
  const idx: Record<string, number> = {}
  headerRow.eachCell((cell, col) => {
    const h = celdaToStr(cell.value)?.toLowerCase()
    if (h) idx[h] = col
  })
  const filas: FilaPaciente[] = []
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const fila: FilaPaciente = {}
    let vacia = true
    for (const c of COLUMNS) {
      const col = idx[c.header.toLowerCase()]
      if (!col) continue
      const val = celdaToStr(row.getCell(col).value)
      if (val !== undefined) { (fila as Record<string, string>)[c.key] = val; vacia = false }
    }
    if (!vacia) filas.push(fila)
  }
  return filas
}

export async function buildWorkbook(rows: FilaPaciente[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Pacientes')
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: 18 }))
  for (const row of rows) ws.addRow(row)
  const out = await wb.xlsx.writeBuffer()
  return Buffer.from(out)
}

export async function buildSample(): Promise<Buffer> {
  return buildWorkbook([
    { nombre: 'Juan', apellido: 'Perez', dni: '12345678', telefono: '70011223', pais: 'BO',
      email: 'juan@ejemplo.com', sexo: 'M', fechaNacimiento: '1990-05-01', direccion: 'Av. Siempre Viva 123', notas: '' },
  ])
}
```

- [ ] **Step 5: Correr el test (pasa)**

Run: `cd apps/api && npx jest pacientes.xlsx`
Expected: PASS (3 tests). Si la firma de `writeBuffer`/`load` difiere en la version instalada, ajustar el cast (verificar contra `node_modules/exceljs`).

- [ ] **Step 6: tsc + commit**

Run: `cd apps/api && npx tsc --noEmit`
```bash
git add apps/api/package.json apps/api/pnpm-lock.yaml apps/api/src/modules/pacientes/pacientes.xlsx.ts apps/api/src/modules/pacientes/pacientes.xlsx.spec.ts
git commit -m "feat(pacientes): exceljs + parser/builder de XLSX (set completo)"
```

---

### Task 7: Backend — service import/export/sample + endpoints ADMIN

**Files:**
- Modify: `apps/api/src/modules/pacientes/pacientes.service.ts`
- Modify: `apps/api/src/modules/pacientes/pacientes.controller.ts`

**Interfaces:**
- Consumes: `parseWorkbook`, `buildWorkbook`, `buildSample`, `COLUMNS` (Task 6).
- Produces:
```ts
PacientesService.importXlsx(consultorioId: number, usuarioId: number, buffer: Buffer, actualizarExistentes: boolean): Promise<{ creados: number; actualizados: number; omitidos: number; errores: Array<{ fila: number; motivo: string }> }>
PacientesService.exportXlsx(consultorioId: number): Promise<Buffer>
PacientesService.sampleXlsx(): Promise<Buffer>
```

- [ ] **Step 1: Helper de validacion de fila en el service**

En `pacientes.service.ts`, importar arriba:
```ts
import { validateSync } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import { Rol } from '@pos/types'
import { parseWorkbook, buildWorkbook, buildSample, type FilaPaciente } from './pacientes.xlsx'
```

Agregar metodo privado que convierte fila → DTO validado o lista de errores:
```ts
private validarFila(fila: FilaPaciente): { dto?: CreatePacienteDto; error?: string } {
  if (!fila.nombre?.trim() || !fila.apellido?.trim()) return { error: 'nombre y apellido son obligatorios' }
  const limpio: FilaPaciente = {}
  for (const [k, v] of Object.entries(fila)) {
    const val = typeof v === 'string' ? v.trim() : v
    if (val !== undefined && val !== '') (limpio as Record<string, unknown>)[k] = k === 'pais' ? String(val).toUpperCase() : val
  }
  const dto = plainToInstance(CreatePacienteDto, limpio)
  const errs = validateSync(dto, { whitelist: true, forbidNonWhitelisted: false })
  if (errs.length) return { error: errs.map((e) => Object.values(e.constraints ?? {}).join(', ')).join('; ') }
  return { dto }
}
```

- [ ] **Step 2: `importXlsx` (transaccional, match DNI→nombre+apellido)**

```ts
async importXlsx(consultorioId: number, usuarioId: number, buffer: Buffer, actualizarExistentes: boolean) {
  const filas = await parseWorkbook(buffer)
  let creados = 0, actualizados = 0, omitidos = 0
  const errores: Array<{ fila: number; motivo: string }> = []

  await this.prisma.$transaction(async (tx) => {
    for (let i = 0; i < filas.length; i++) {
      const nroFila = i + 2 // +1 header, +1 base-1
      const { dto, error } = this.validarFila(filas[i])
      if (error || !dto) { errores.push({ fila: nroFila, motivo: error ?? 'fila invalida' }); continue }

      const existente = dto.dni?.trim()
        ? await tx.paciente.findFirst({ where: { consultorioId, dni: dto.dni.trim(), deletedAt: null }, select: { id: true } })
        : await tx.paciente.findFirst({
            where: { consultorioId, deletedAt: null,
              nombre: { equals: dto.nombre, mode: 'insensitive' },
              apellido: { equals: dto.apellido, mode: 'insensitive' } },
            select: { id: true },
          })

      if (existente) {
        if (!actualizarExistentes) { omitidos++; continue }
        await tx.paciente.update({ where: { id: existente.id }, data: { ...dto } })
        actualizados++
      } else {
        await tx.paciente.create({ data: { ...dto, consultorioId } })
        creados++
      }
    }

    await tx.log.create({
      data: {
        consultorioId, usuarioId, entidad: 'paciente_import', entidadId: 0,
        accion: 'CREATE',
        payloadDespues: { creados, actualizados, omitidos, errores: errores.length } as object,
      },
    })
  })

  return { creados, actualizados, omitidos, errores }
}

async exportXlsx(consultorioId: number) {
  const pacientes = await this.prisma.paciente.findMany({
    where: { consultorioId, deletedAt: null },
    orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
    select: { nombre: true, apellido: true, dni: true, telefono: true, pais: true,
      email: true, sexo: true, fechaNacimiento: true, direccion: true, notas: true },
  })
  return buildWorkbook(
    pacientes.map((p) => ({
      nombre: p.nombre, apellido: p.apellido, dni: p.dni ?? '', telefono: p.telefono ?? '',
      pais: p.pais ?? '', email: p.email ?? '', sexo: p.sexo ?? '',
      fechaNacimiento: p.fechaNacimiento ? p.fechaNacimiento.toISOString().slice(0, 10) : '',
      direccion: p.direccion ?? '', notas: p.notas ?? '',
    })),
  )
}

async sampleXlsx() { return buildSample() }
```
(Nota: verificar en el schema que `sexo`, `direccion`, `notas` existen como campos del modelo Paciente — el spec asume el set completo. `fechaNacimiento` es `@db.Date` → `Date` en TS.)

- [ ] **Step 3: Endpoints en el controller (literales ANTES de `:id`)**

Imports nuevos en `pacientes.controller.ts`:
```ts
import { UseInterceptors, UploadedFile, Res, StreamableFile, BadRequestException } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Response } from 'express'
import { Rol } from '@pos/types'
import { Roles } from '../../common/decorators/roles.decorator'
```

Insertar ESTAS rutas ANTES de `@Get(':id')` (line ~46):
```ts
@Get('export')
@Roles(Rol.ADMIN)
@ApiOperation({ summary: 'Exportar todos los pacientes a XLSX (ADMIN)' })
async export(@CurrentUser() user: JwtPayload, @Res({ passthrough: true }) res: Response) {
  const buf = await this.service.exportXlsx(user.consultorioId)
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="pacientes.xlsx"',
  })
  return new StreamableFile(buf)
}

@Get('import/sample')
@Roles(Rol.ADMIN)
@ApiOperation({ summary: 'Descargar XLSX de ejemplo para importar (ADMIN)' })
async sample(@Res({ passthrough: true }) res: Response) {
  const buf = await this.service.sampleXlsx()
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="pacientes-ejemplo.xlsx"',
  })
  return new StreamableFile(buf)
}

@Post('import')
@Roles(Rol.ADMIN)
@UseInterceptors(FileInterceptor('archivo'))
@ApiOperation({ summary: 'Importar pacientes desde XLSX (ADMIN)' })
async import(
  @CurrentUser() user: JwtPayload,
  @UploadedFile() archivo: Express.Multer.File | undefined,
  @Body('actualizarExistentes') actualizarExistentes?: string,
) {
  if (!archivo) throw new BadRequestException('Falta el archivo XLSX')
  return this.service.importXlsx(user.consultorioId, user.sub, archivo.buffer, actualizarExistentes === 'true')
}
```

- [ ] **Step 4: tsc**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores. (Si `user.sub` no es el id numerico, verificar `JwtPayload` en `common/decorators/current-user.decorator.ts` y ajustar.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/pacientes/pacientes.service.ts apps/api/src/modules/pacientes/pacientes.controller.ts
git commit -m "feat(pacientes): endpoints ADMIN import/export/sample XLSX"
```

---

### Task 8: Frontend — modal Importar pacientes

**Files:**
- Create: `apps/web/src/features/pacientes/ImportarPacientesModal.tsx`
- Modify: `apps/web/src/features/pacientes/PacientesPage.tsx` (descomentar/montar el modal + invalidar query al terminar)

**Interfaces:**
- Consumes: `POST /pacientes/import` (multipart `archivo` + `actualizarExistentes`), `GET /pacientes/import/sample`, `descargarBlob`, `ModalHeader`.

- [ ] **Step 1: Pasar por los skills de UI** (modal igual al screenshot: titulo, descripcion, barra de progreso, checkbox, Seleccionar archivo, link de ejemplo, resumen de resultado, Cancelar/Importar).

- [ ] **Step 2: Implementar el modal**

```tsx
import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload } from 'lucide-react'
import { api } from '../../lib/api-client'
import { descargarBlob } from '../../lib/descargas'
import { ModalHeader } from '../../components/shared/ModalHeader'
import { cardUI, btnPrimaryUI } from '../../lib/ui'
import { cn } from '../../lib/utils'

type Resultado = { creados: number; actualizados: number; omitidos: number; errores: Array<{ fila: number; motivo: string }> }

export function ImportarPacientesModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [actualizar, setActualizar] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)

  const importar = useMutation({
    mutationFn: async () => {
      const fd = new FormData()
      fd.append('archivo', archivo!)
      fd.append('actualizarExistentes', String(actualizar))
      const { data } = await api.post('/pacientes/import', fd)
      return data as Resultado
    },
    onSuccess: (data) => {
      setResultado(data)
      qc.invalidateQueries({ queryKey: ['pacientes'] })
    },
  })

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className={cn(cardUI, 'w-full max-w-lg p-0')}>
        <ModalHeader title="Importar contactos" onClose={onClose} />
        <div className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            Seleccioná un archivo XLSX para agregar varios pacientes a la vez. Si querés actualizar
            datos de pacientes ya registrados de forma masiva, marcá “Actualizar datos existentes”.
          </p>

          {importar.isPending && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
            </div>
          )}

          {!resultado ? (
            <>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={actualizar} onChange={(e) => setActualizar(e.target.checked)} className="h-4 w-4" />
                Actualizar datos existentes
              </label>

              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              />
              <button type="button" onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg border border-primary/40 px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/5 min-h-[44px] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60">
                <Upload className="h-4 w-4" aria-hidden="true" />
                {archivo ? archivo.name : 'Seleccionar archivo'}
              </button>

              <button type="button" onClick={() => descargarBlob('/pacientes/import/sample', 'pacientes-ejemplo.xlsx')}
                className="block text-sm text-primary hover:underline">
                Descargar el archivo de ejemplo
              </button>

              {importar.isError && <p className="text-sm text-destructive">No se pudo importar. Revisá el archivo.</p>}
            </>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="text-foreground">Creados: <b>{resultado.creados}</b> · Actualizados: <b>{resultado.actualizados}</b> · Omitidos: <b>{resultado.omitidos}</b></p>
              {resultado.errores.length > 0 && (
                <div className="max-h-40 overflow-auto rounded-md border p-2">
                  <p className="font-medium text-destructive mb-1">{resultado.errores.length} con error:</p>
                  <ul className="space-y-0.5 text-muted-foreground">
                    {resultado.errores.map((e) => <li key={e.fila}>Fila {e.fila}: {e.motivo}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t px-5 py-3">
          <button type="button" onClick={onClose} className="text-sm font-medium text-muted-foreground hover:text-foreground">
            {resultado ? 'Cerrar' : 'Cancelar'}
          </button>
          {!resultado && (
            <button type="button" disabled={!archivo || importar.isPending} onClick={() => importar.mutate()} className={cn(btnPrimaryUI, 'disabled:opacity-60')}>
              {importar.isPending ? 'Importando...' : 'Importar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Montar el modal en PacientesPage**

Asegurar el import al tope de `PacientesPage.tsx`:
```ts
import { ImportarPacientesModal } from './ImportarPacientesModal'
```
Y que el render (de Task 5) este activo:
```tsx
{modalImport && <ImportarPacientesModal onClose={() => setModalImport(false)} />}
```

- [ ] **Step 4: tsc**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores. (Verificar props reales de `ModalHeader` en `components/shared/ModalHeader.tsx` y ajustar.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/pacientes/ImportarPacientesModal.tsx apps/web/src/features/pacientes/PacientesPage.tsx
git commit -m "feat(pacientes): modal de importacion XLSX"
```

---

### Task 9: Gate de integracion (lo corre el owner)

**Files:**
- Create: `apps/api/scripts/gate-pacientes-bulk.ps1`

- [ ] **Step 1: Escribir el gate**

Crear `apps/api/scripts/gate-pacientes-bulk.ps1` siguiendo el patron de los `gate-*.ps1` existentes (crea su propio tenant ADMIN, loguea, obtiene JWT). Pasos del gate:
1. `GET /pacientes/import/sample` con token ADMIN → guarda `ejemplo.xlsx`, status 200.
2. `POST /pacientes/import` (multipart, `archivo=ejemplo.xlsx`, `actualizarExistentes=false`) → `creados>=1`.
3. Reimportar el mismo archivo con `actualizarExistentes=false` → `omitidos>=1`, `creados=0`.
4. Reimportar con `actualizarExistentes=true` → `actualizados>=1`.
5. `GET /pacientes?page=1&limit=50` → respuesta tiene `items` (array) y `total` (number).
6. `GET /pacientes/export` con token ADMIN → status 200, content-type xlsx.
7. `GET /pacientes/export` con token NO-admin → status 403.

- [ ] **Step 2: Verificacion**

Run (lo corre el owner, API levantada): `pwsh apps/api/scripts/gate-pacientes-bulk.ps1`
Expected: todos los asserts en verde.

- [ ] **Step 3: Commit**

```bash
git add apps/api/scripts/gate-pacientes-bulk.ps1
git commit -m "test(pacientes): gate de import/export/paginacion XLSX"
```

---

## Self-Review (cubierto)

- **Spec coverage:** A→Task 1/3; breaking change→Task 2; split button→Task 4/5; buscador centrado→Task 5; export todos→Task 7; import match/rules→Task 7; sample→Task 6/7; modal→Task 8; roles ADMIN→Task 7 (`@Roles`); testing→Task 6 (unit) + Task 9 (gate). 
- **Verificaciones a confirmar al implementar (no son placeholders, son checks de realidad contra el codigo):** forma de `JwtPayload.sub`, props de `ModalHeader`, shape de `useAuthStore`/rol, campos `sexo/direccion/notas` en el modelo Paciente, API exacta de `exceljs` en la version instalada. Cada una tiene su nota en el step correspondiente.
- **Type consistency:** `{ items, total }` usado igual en Tasks 1/2/3; `importXlsx` retorna `{creados,actualizados,omitidos,errores}` consumido igual en Task 8; `descargarBlob(url,filename)` igual en Tasks 5 y 8.
