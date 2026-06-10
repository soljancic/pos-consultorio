# Configuracion — Plan de Implementacion

> **Para agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Prerequisito:** ejecutar antes `2026-06-09-fixes-previos-plan.md`.
> **Practicas:** aplicar el checklist "Buenas practicas y seguridad" de `PLAN.md` (seccion 8b).

**Goal:** Pantalla `/configuracion` (solo ADMIN) para gestionar usuarios del consultorio y datos del consultorio.

**Architecture:** Backend: completar el modulo `usuarios` (POST/PUT; el GET ya existe pero se ajusta para incluir inactivos). El modulo `consultorios` NO se toca — `GET/PUT /consultorio` ya existen y manejan nombre, logoUrl, moneda y timezone. Frontend: `ConfiguracionPage` con dos tabs, `UsuarioModal`, guard de rol ADMIN en la ruta.

**Tech Stack:** React 19, TypeScript, TanStack Query v5, Tailwind CSS, NestJS, Prisma, argon2, class-validator

---

### Task 0: Migracion — `telefono` y `direccion` en Consultorio (segun modelo.jpeg)

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/src/modules/consultorios/consultorios.service.ts`

- [ ] **Step 1: Agregar campos al modelo Consultorio**

```prisma
// apps/api/prisma/schema.prisma — dentro de model Consultorio, despues de logoUrl:
  telefono  String?
  direccion String?
```

```bash
cd apps/api && npx prisma migrate dev --name consultorio_telefono_direccion
```

- [ ] **Step 2: Incluirlos en ConsultoriosService**

En `findOne`, agregar `telefono: true, direccion: true` al select. En `update`, ampliar el tipo de `data` con `telefono?: string; direccion?: string`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma/ apps/api/src/modules/consultorios/
git commit -m "feat(consultorios): add telefono and direccion fields per data model"
```

---

### Task 1: Completar CRUD de usuarios en la API

**Files:**
- Modify: `apps/api/src/modules/usuarios/usuarios.service.ts`
- Modify: `apps/api/src/modules/usuarios/usuarios.controller.ts`

**Contexto:** `findAll` ya existe pero filtra `activo: true` y no devuelve el campo `activo` — un usuario desactivado desapareceria y no podria reactivarse. El controller ya usa el idioma `@Roles(Rol.ADMIN)` con `Rol` de `@pos/types`, y `RolesGuard` ya esta registrado globalmente (`APP_GUARD` en `auth.module.ts`).

- [ ] **Step 1: Reescribir UsuariosService**

```typescript
// apps/api/src/modules/usuarios/usuarios.service.ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { IsString, IsNotEmpty, IsEmail, MinLength, IsIn, IsOptional, IsBoolean } from 'class-validator'
import { PrismaService } from '../../prisma/prisma.service'
import * as argon2 from 'argon2'
import { Rol } from '@prisma/client'

const ROLES = ['ADMIN', 'SECRETARIA', 'DOCTOR', 'CAJA'] as const

export class CreateUsuarioDto {
  @IsString() @IsNotEmpty()
  nombre: string

  @IsEmail()
  email: string

  @IsString() @MinLength(8)
  password: string

  @IsIn(ROLES)
  rol: Rol
}

export class UpdateUsuarioDto {
  @IsString() @IsNotEmpty() @IsOptional()
  nombre?: string

  @IsEmail() @IsOptional()
  email?: string

  @IsString() @MinLength(8) @IsOptional()
  password?: string

  @IsIn(ROLES) @IsOptional()
  rol?: Rol

  @IsBoolean() @IsOptional()
  activo?: boolean
}

const USUARIO_SELECT = {
  id: true,
  nombre: true,
  email: true,
  rol: true,
  activo: true,
  createdAt: true,
} as const

@Injectable()
export class UsuariosService {
  constructor(private prisma: PrismaService) {}

  findAll(consultorioId: string) {
    return this.prisma.usuario.findMany({
      where: { consultorioId },
      select: USUARIO_SELECT,
      orderBy: { nombre: 'asc' },
    })
  }

  async create(consultorioId: string, dto: CreateUsuarioDto) {
    const exists = await this.prisma.usuario.findUnique({
      where: { email_consultorioId: { email: dto.email, consultorioId } },
    })
    if (exists) throw new ConflictException('Ya existe un usuario con ese email')

    const { password, ...rest } = dto
    const passwordHash = await argon2.hash(password)

    return this.prisma.usuario.create({
      data: { ...rest, passwordHash, consultorioId },
      select: USUARIO_SELECT,
    })
  }

  async update(consultorioId: string, id: string, dto: UpdateUsuarioDto) {
    const usuario = await this.prisma.usuario.findFirst({ where: { id, consultorioId } })
    if (!usuario) throw new NotFoundException('Usuario no encontrado')

    const { password, ...rest } = dto
    const data: Record<string, unknown> = { ...rest }
    if (password) data.passwordHash = await argon2.hash(password)

    return this.prisma.usuario.update({
      where: { id },
      data,
      select: USUARIO_SELECT,
    })
  }
}
```

> Nota: `findAll` deja de filtrar `activo: true` y ahora devuelve `activo` — el admin ve y reactiva usuarios inactivos. El unique compuesto `email_consultorioId` viene de `@@unique([email, consultorioId])` en el schema.

- [ ] **Step 2: Agregar POST y PUT al UsuariosController existente**

```typescript
// apps/api/src/modules/usuarios/usuarios.controller.ts
import { Controller, Get, Post, Put, Body, Param } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { UsuariosService, CreateUsuarioDto, UpdateUsuarioDto } from './usuarios.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { Rol } from '@pos/types'

@ApiTags('Usuarios')
@ApiBearerAuth()
@Controller('usuarios')
export class UsuariosController {
  constructor(private service: UsuariosService) {}

  @Get()
  @Roles(Rol.ADMIN)
  findAll(@CurrentUser() user: JwtPayload) {
    return this.service.findAll(user.consultorioId)
  }

  @Post()
  @Roles(Rol.ADMIN)
  @ApiOperation({ summary: 'Crear usuario' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateUsuarioDto) {
    return this.service.create(user.consultorioId, dto)
  }

  @Put(':id')
  @Roles(Rol.ADMIN)
  @ApiOperation({ summary: 'Editar usuario (password opcional)' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateUsuarioDto,
  ) {
    return this.service.update(user.consultorioId, id, dto)
  }
}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
cd apps/api && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/usuarios/
git commit -m "feat(usuarios): add create/update endpoints and include inactive users in list"
```

---

### Task 2: UsuarioModal en el frontend

**Files:**
- Create: `apps/web/src/features/configuracion/UsuarioModal.tsx`

- [ ] **Step 1: Crear UsuarioModal**

```tsx
// apps/web/src/features/configuracion/UsuarioModal.tsx
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { api } from '../../lib/api-client'

const ROLES = ['ADMIN', 'SECRETARIA', 'DOCTOR', 'CAJA'] as const

interface Usuario { id?: string; nombre: string; email: string; rol: string; activo: boolean }
interface Props { usuario?: Usuario | null; onClose: () => void }

export function UsuarioModal({ usuario, onClose }: Props) {
  const qc = useQueryClient()
  const editando = !!usuario?.id
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    nombre: usuario?.nombre ?? '',
    email: usuario?.email ?? '',
    password: '',
    rol: usuario?.rol ?? 'SECRETARIA',
    activo: usuario?.activo ?? true,
  })

  const mutation = useMutation({
    mutationFn: (data: typeof form) => {
      if (editando) {
        const payload: Record<string, unknown> = {
          nombre: data.nombre, email: data.email, rol: data.rol, activo: data.activo,
        }
        if (data.password) payload.password = data.password
        return api.put(`/usuarios/${usuario!.id}`, payload)
      }
      return api.post('/usuarios', {
        nombre: data.nombre, email: data.email, rol: data.rol, password: data.password,
      })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['usuarios'] }); onClose() },
    onError: (err: any) => setError(err.response?.data?.message ?? 'Error al guardar'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-slate-800">
            {editando ? 'Editar usuario' : 'Nuevo usuario'}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate(form) }} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
            <input required value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
            <input required type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {editando ? 'Nueva contrasena (dejar vacio para no cambiar)' : 'Contrasena *'}
            </label>
            <input type="password" required={!editando} minLength={8} value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Rol *</label>
            <select value={form.rol} onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value }))}
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {editando && (
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={form.activo} onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))} className="rounded" />
              Usuario activo
            </label>
          )}
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border rounded-md text-sm text-slate-700 hover:bg-slate-50">Cancelar</button>
            <button type="submit" disabled={mutation.isPending} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-60">
              {mutation.isPending ? 'Guardando...' : editando ? 'Guardar' : 'Crear usuario'}
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
git add apps/web/src/features/configuracion/UsuarioModal.tsx
git commit -m "feat(configuracion): add UsuarioModal component"
```

---

### Task 3: ConfiguracionPage con tabs

**Files:**
- Create: `apps/web/src/features/configuracion/ConfiguracionPage.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/shared/AppShell.tsx`

- [ ] **Step 1: Crear ConfiguracionPage**

Usa los endpoints existentes `GET/PUT /consultorio` (NO `/consultorios/mi-consultorio`).

```tsx
// apps/web/src/features/configuracion/ConfiguracionPage.tsx
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil } from 'lucide-react'
import { api } from '../../lib/api-client'
import { UsuarioModal } from './UsuarioModal'

const MONEDAS = ['ARS', 'USD', 'UYU', 'CLP', 'PEN', 'COP', 'MXN']
const TIMEZONES = [
  'America/Argentina/Buenos_Aires',
  'America/Montevideo',
  'America/Santiago',
  'America/Lima',
  'America/Bogota',
  'America/Mexico_City',
  'America/New_York',
]
const ROL_LABEL: Record<string, string> = {
  ADMIN: 'Admin', SECRETARIA: 'Secretaria', DOCTOR: 'Doctor', CAJA: 'Caja',
}

type Consultorio = {
  id: string; nombre: string; logoUrl: string | null
  telefono: string | null; direccion: string | null
  moneda: string; timezone: string
}
type Usuario = { id: string; nombre: string; email: string; rol: string; activo: boolean }

export function ConfiguracionPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'usuarios' | 'consultorio'>('usuarios')
  const [usuarioEdit, setUsuarioEdit] = useState<Usuario | null>(null)
  const [usuarioModal, setUsuarioModal] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [consForm, setConsForm] = useState({
    nombre: '', logoUrl: '', telefono: '', direccion: '',
    moneda: 'ARS', timezone: 'America/Argentina/Buenos_Aires',
  })

  const { data: usuarios = [] } = useQuery<Usuario[]>({
    queryKey: ['usuarios'],
    queryFn: () => api.get('/usuarios').then((r) => r.data),
  })

  const { data: consultorio } = useQuery<Consultorio>({
    queryKey: ['consultorio'],
    queryFn: () => api.get('/consultorio').then((r) => r.data),
  })

  useEffect(() => {
    if (consultorio) {
      setConsForm({
        nombre: consultorio.nombre,
        logoUrl: consultorio.logoUrl ?? '',
        telefono: consultorio.telefono ?? '',
        direccion: consultorio.direccion ?? '',
        moneda: consultorio.moneda,
        timezone: consultorio.timezone,
      })
    }
  }, [consultorio])

  const updateConsultorio = useMutation({
    mutationFn: (data: typeof consForm) =>
      api.put('/consultorio', { ...data, logoUrl: data.logoUrl || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultorio'] })
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2000)
    },
  })

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b bg-white">
        <h1 className="text-lg font-semibold text-slate-800">Configuracion</h1>
        <div className="flex gap-1 mt-3">
          {(['usuarios', 'consultorio'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize ${tab === t ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 max-w-3xl mx-auto w-full">
        {tab === 'usuarios' && (
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={() => { setUsuarioEdit(null); setUsuarioModal(true) }}
                className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-blue-700">
                <Plus className="h-3.5 w-3.5" /> Nuevo usuario
              </button>
            </div>
            <div className="bg-white rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Nombre</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Email</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Rol</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Estado</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((u) => (
                    <tr key={u.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{u.nombre}</td>
                      <td className="px-4 py-3 text-slate-500">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium">
                          {ROL_LABEL[u.rol] ?? u.rol}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.activo ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                          {u.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => { setUsuarioEdit(u); setUsuarioModal(true) }}
                          className="text-slate-400 hover:text-slate-700">
                          <Pencil className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'consultorio' && (
          <div className="bg-white rounded-lg border p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del consultorio</label>
              <input value={consForm.nombre} onChange={(e) => setConsForm((f) => ({ ...f, nombre: e.target.value }))}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Logo (URL)</label>
              <input value={consForm.logoUrl} placeholder="https://..."
                onChange={(e) => setConsForm((f) => ({ ...f, logoUrl: e.target.value }))}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Telefono</label>
                <input value={consForm.telefono} onChange={(e) => setConsForm((f) => ({ ...f, telefono: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Direccion</label>
                <input value={consForm.direccion} onChange={(e) => setConsForm((f) => ({ ...f, direccion: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Moneda</label>
                <select value={consForm.moneda} onChange={(e) => setConsForm((f) => ({ ...f, moneda: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Timezone</label>
                <select value={consForm.timezone} onChange={(e) => setConsForm((f) => ({ ...f, timezone: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button onClick={() => updateConsultorio.mutate(consForm)} disabled={updateConsultorio.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-60">
                {updateConsultorio.isPending ? 'Guardando...' : 'Guardar cambios'}
              </button>
              {guardado && <span className="text-sm text-green-600">Guardado</span>}
            </div>
          </div>
        )}
      </div>

      {usuarioModal && (
        <UsuarioModal usuario={usuarioEdit} onClose={() => setUsuarioModal(false)} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Agregar ruta en App.tsx con guard ADMIN**

```tsx
// apps/web/src/App.tsx
import { ConfiguracionPage } from './features/configuracion/ConfiguracionPage'

// junto a PrivateRoute:
function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  return user?.rol === 'ADMIN' ? <>{children}</> : <Navigate to="/agenda" replace />
}

// dentro del Route padre:
<Route path="configuracion" element={<AdminRoute><ConfiguracionPage /></AdminRoute>} />
```

- [ ] **Step 3: Link "Configuracion" en AppShell solo para ADMIN**

`NAV_ITEMS` es un array estatico — agregar flag y filtrar por rol dentro del componente:

```tsx
// apps/web/src/components/shared/AppShell.tsx
import { Cog } from 'lucide-react' // el icono Settings ya lo usa Catalogo

const NAV_ITEMS = [
  { to: '/agenda', icon: Calendar, label: 'Agenda' },
  { to: '/pacientes', icon: Users, label: 'Pacientes' },
  { to: '/caja', icon: DollarSign, label: 'Caja' },
  { to: '/catalogo', icon: Settings, label: 'Catalogo' },
  { to: '/configuracion', icon: Cog, label: 'Configuracion', soloAdmin: true },
]

// dentro de AppShell (ya tiene `user` del store), reemplazar NAV_ITEMS.map por:
const navVisible = NAV_ITEMS.filter((item) => !item.soloAdmin || user?.rol === 'ADMIN')
// y mapear navVisible
```

- [ ] **Step 4: Verificar TypeScript**

```bash
cd apps/web && npx tsc --noEmit
cd apps/api && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/configuracion/ apps/web/src/App.tsx apps/web/src/components/shared/AppShell.tsx
git commit -m "feat(configuracion): add admin configuration page with users and consultorio settings"
```
