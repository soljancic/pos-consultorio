# Catalogo CRUD — Plan de Implementacion

> **Para agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Prerequisito:** ejecutar antes `2026-06-09-fixes-previos-plan.md` (define `UpdateServicioDto`/`UpdateDoctorDto` con `activo`).
> **Practicas:** aplicar el checklist "Buenas practicas y seguridad" de `PLAN.md` (seccion 8b).

**Goal:** Agregar CRUD de servicios y doctores a `CatalogoPage`, visible solo para ADMIN.

**Architecture:** Backend: agregar `PUT /doctores/:id` (no existe) y soporte `?todos=true` en los listados para que el catalogo muestre items inactivos. Frontend: dos modales reutilizables y control de acceso por rol usando `useAuthStore`.

**Tech Stack:** React 19, TypeScript, TanStack Query v5, Tailwind CSS, NestJS, Prisma

---

### Task 1: Backend — `PUT /doctores/:id` y listados con inactivos

**Files:**
- Modify: `apps/api/src/modules/doctores/doctores.service.ts`
- Modify: `apps/api/src/modules/doctores/doctores.controller.ts`
- Modify: `apps/api/src/modules/servicios/servicios.service.ts`
- Modify: `apps/api/src/modules/servicios/servicios.controller.ts`

- [ ] **Step 1: Agregar update en DoctoresService (mismo patron que ServiciosService.update)**

```typescript
// apps/api/src/modules/doctores/doctores.service.ts
async update(consultorioId: string, id: string, dto: UpdateDoctorDto) {
  const d = await this.prisma.doctor.findFirst({ where: { id, consultorioId } })
  if (!d) throw new NotFoundException()
  return this.prisma.doctor.update({ where: { id }, data: dto })
}
```

- [ ] **Step 2: Agregar endpoint en DoctoresController**

```typescript
// apps/api/src/modules/doctores/doctores.controller.ts
import { Put } from '@nestjs/common' // agregar al import existente

@Put(':id')
update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateDoctorDto) {
  return this.service.update(user.consultorioId, id, dto)
}
```

> Declarar despues de `POST :id/horarios` y `GET :id/disponibilidad` no genera conflicto (verbos distintos).

- [ ] **Step 3: findAll con inactivos opcionales (servicios y doctores)**

Ambos `findAll` hoy filtran `activo: true`. Cambiar a:

```typescript
// servicios.service.ts
findAll(consultorioId: string, incluirInactivos = false) {
  return this.prisma.servicio.findMany({
    where: { consultorioId, ...(incluirInactivos ? {} : { activo: true }) },
    orderBy: { nombre: 'asc' },
  })
}

// servicios.controller.ts
@Get()
findAll(@CurrentUser() user: JwtPayload, @Query('todos') todos?: string) {
  return this.service.findAll(user.consultorioId, todos === 'true')
}
```

Replicar el mismo cambio en `doctores.service.ts` / `doctores.controller.ts` (importar `Query` en el controller de servicios; doctores ya lo importa).

> La agenda (NuevaCitaModal) sigue llamando `GET /servicios` y `GET /doctores` sin param — solo activos, sin cambios.

- [ ] **Step 4: Verificar TypeScript y commit**

```bash
cd apps/api && npx tsc --noEmit
git add apps/api/src/modules/doctores/ apps/api/src/modules/servicios/
git commit -m "feat(catalogo): add PUT /doctores/:id and ?todos=true listing for admin catalog"
```

---

### Task 2: ServicioModal

**Files:**
- Create: `apps/web/src/features/catalogo/ServicioModal.tsx`

- [ ] **Step 1: Crear ServicioModal**

```tsx
// apps/web/src/features/catalogo/ServicioModal.tsx
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { api } from '../../lib/api-client'

interface Servicio {
  id?: string
  nombre: string
  descripcion?: string
  duracionMin: number
  precioBase: number
  activo: boolean
}

interface Props {
  servicio?: Servicio
  onClose: () => void
}

export function ServicioModal({ servicio, onClose }: Props) {
  const qc = useQueryClient()
  const editando = !!servicio?.id
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    nombre: servicio?.nombre ?? '',
    descripcion: servicio?.descripcion ?? '',
    duracionMin: servicio?.duracionMin ?? 30,
    precioBase: servicio?.precioBase ?? 0,
    activo: servicio?.activo ?? true,
  })

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      editando
        ? api.put(`/servicios/${servicio!.id}`, data)
        : api.post('/servicios', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['servicios'] })
      onClose()
    },
    onError: (err: any) => setError(err.response?.data?.message ?? 'Error al guardar'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-slate-800">
            {editando ? 'Editar servicio' : 'Nuevo servicio'}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate(form) }}
          className="p-6 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
            <input required value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Descripcion</label>
            <input value={form.descripcion}
              onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Duracion (min) *</label>
              <input required type="number" min={5} step={5} value={form.duracionMin}
                onChange={(e) => setForm((f) => ({ ...f, duracionMin: Number(e.target.value) }))}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Precio base *</label>
              <input required type="number" min={0} step={0.01} value={form.precioBase}
                onChange={(e) => setForm((f) => ({ ...f, precioBase: Number(e.target.value) }))}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={form.activo}
              onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
              className="rounded" />
            Servicio activo
          </label>
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border rounded-md text-sm text-slate-700 hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-60">
              {mutation.isPending ? 'Guardando...' : editando ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/features/catalogo/ServicioModal.tsx
git commit -m "feat(catalogo): add ServicioModal for create/edit"
```

---

### Task 3: DoctorModal

**Files:**
- Create: `apps/web/src/features/catalogo/DoctorModal.tsx`

- [ ] **Step 1: Crear DoctorModal**

```tsx
// apps/web/src/features/catalogo/DoctorModal.tsx
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { api } from '../../lib/api-client'

const COLORES = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899']

interface Doctor { id?: string; nombre: string; especialidad?: string; colorAgenda: string; activo: boolean }
interface Props { doctor?: Doctor; onClose: () => void }

export function DoctorModal({ doctor, onClose }: Props) {
  const qc = useQueryClient()
  const editando = !!doctor?.id
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    nombre: doctor?.nombre ?? '',
    especialidad: doctor?.especialidad ?? '',
    colorAgenda: doctor?.colorAgenda ?? '#3B82F6',
    activo: doctor?.activo ?? true,
  })

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      editando ? api.put(`/doctores/${doctor!.id}`, data) : api.post('/doctores', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['doctores'] }); onClose() },
    onError: (err: any) => setError(err.response?.data?.message ?? 'Error al guardar'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-slate-800">
            {editando ? 'Editar doctor' : 'Nuevo doctor'}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate(form) }}
          className="p-6 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
            <input required value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Especialidad</label>
            <input value={form.especialidad}
              onChange={(e) => setForm((f) => ({ ...f, especialidad: e.target.value }))}
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Color en agenda</label>
            <div className="flex gap-2">
              {COLORES.map((c) => (
                <button key={c} type="button"
                  onClick={() => setForm((f) => ({ ...f, colorAgenda: c }))}
                  className={`h-8 w-8 rounded-full border-2 transition-transform ${form.colorAgenda === c ? 'border-slate-800 scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={form.activo}
              onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
              className="rounded" />
            Doctor activo
          </label>
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border rounded-md text-sm text-slate-700 hover:bg-slate-50">Cancelar</button>
            <button type="submit" disabled={mutation.isPending}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-60">
              {mutation.isPending ? 'Guardando...' : editando ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/features/catalogo/DoctorModal.tsx
git commit -m "feat(catalogo): add DoctorModal for create/edit"
```

---

### Task 4: Actualizar CatalogoPage con CRUD y control de rol

**Files:**
- Modify: `apps/web/src/features/catalogo/CatalogoPage.tsx`

- [ ] **Step 1: Refactorizar CatalogoPage**

```tsx
// apps/web/src/features/catalogo/CatalogoPage.tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Pencil } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatMoneda } from '../../lib/utils'
import { useAuthStore } from '../../stores/auth.store'
import { ServicioModal } from './ServicioModal'
import { DoctorModal } from './DoctorModal'

export function CatalogoPage() {
  const user = useAuthStore((s) => s.user)
  const esAdmin = user?.rol === 'ADMIN'

  const [servicioEdit, setServicioEdit] = useState<any | null>(null)
  const [servicioModal, setServicioModal] = useState(false)
  const [doctorEdit, setDoctorEdit] = useState<any | null>(null)
  const [doctorModal, setDoctorModal] = useState(false)

  // queryKey distinto al de la agenda (['servicios'] / ['doctores']) porque
  // el catalogo incluye inactivos; la invalidacion por prefijo cubre ambos.
  const { data: servicios = [] } = useQuery({
    queryKey: ['servicios', 'todos'],
    queryFn: () => api.get('/servicios?todos=true').then((r) => r.data),
  })

  const { data: doctores = [] } = useQuery({
    queryKey: ['doctores', 'todos'],
    queryFn: () => api.get('/doctores?todos=true').then((r) => r.data),
  })

  return (
    <div className="p-6 space-y-8 max-w-4xl mx-auto">
      <h1 className="text-lg font-semibold text-slate-800">Catalogo</h1>

      {/* Servicios */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-slate-600 uppercase tracking-wide">Servicios</h2>
          {esAdmin && (
            <button onClick={() => { setServicioEdit(null); setServicioModal(true) }}
              className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-blue-700">
              <Plus className="h-3.5 w-3.5" /> Nuevo servicio
            </button>
          )}
        </div>
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Duracion</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Precio base</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Estado</th>
                {esAdmin && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {(servicios as any[]).map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{s.nombre}</td>
                  <td className="px-4 py-3 text-slate-500">{s.duracionMin} min</td>
                  <td className="px-4 py-3 text-right">{formatMoneda(Number(s.precioBase))}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.activo ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {s.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  {esAdmin && (
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => { setServicioEdit(s); setServicioModal(true) }}
                        className="text-slate-400 hover:text-slate-700">
                        <Pencil className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Doctores */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-slate-600 uppercase tracking-wide">Doctores</h2>
          {esAdmin && (
            <button onClick={() => { setDoctorEdit(null); setDoctorModal(true) }}
              className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-blue-700">
              <Plus className="h-3.5 w-3.5" /> Nuevo doctor
            </button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(doctores as any[]).map((d) => (
            <div key={d.id} className="bg-white rounded-lg border p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full shrink-0" style={{ backgroundColor: d.colorAgenda }} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-800 truncate">{d.nombre}</div>
                <div className="text-sm text-slate-500">{d.especialidad || 'Sin especialidad'}</div>
                {!d.activo && (
                  <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">
                    Inactivo
                  </span>
                )}
              </div>
              {esAdmin && (
                <button onClick={() => { setDoctorEdit(d); setDoctorModal(true) }}
                  className="text-slate-400 hover:text-slate-700 shrink-0">
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {servicioModal && (
        <ServicioModal servicio={servicioEdit} onClose={() => setServicioModal(false)} />
      )}
      {doctorModal && (
        <DoctorModal doctor={doctorEdit} onClose={() => setDoctorModal(false)} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar TypeScript**

> `useAuthStore` ya expone `user.rol` (tipo `AuthUser` de `@pos/types`) — verificado contra el codigo.

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/catalogo/
git commit -m "feat(catalogo): add CRUD for servicios and doctores with role guard"
```
