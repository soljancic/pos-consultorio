# Pacientes Completo — Plan de Implementacion

> **Para agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Prerequisito:** ejecutar antes `2026-06-09-fixes-previos-plan.md`. En particular: el badge de deuda de esta pantalla usa `paciente.deudaTotal`, que recien es confiable despues del fix de incremento en ATENDIDA.
> **Practicas:** aplicar el checklist "Buenas practicas y seguridad" de `PLAN.md` (seccion 8b).

**Goal:** Ficha completa del paciente con historial de citas, y modales para crear/editar pacientes.

**Architecture:** Solo frontend — la API ya tiene todos los endpoints necesarios (`GET/POST/PUT /pacientes`, `GET /pacientes/:id`). Se agregan tres componentes: `PacienteDetallePage`, `PacienteModal` (reutilizable para crear y editar), y se conecta `PacientesPage`.

**Tech Stack:** React 19, TypeScript, TanStack Query v5, React Router v7, Tailwind CSS, date-fns, lucide-react

---

### Task 0: Migracion — campos `sexo` y `direccion` en Paciente (segun modelo.jpeg)

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/src/modules/pacientes/pacientes.service.ts` (DTO)

- [ ] **Step 1: Agregar campos al modelo Paciente**

```prisma
// apps/api/prisma/schema.prisma — dentro de model Paciente, despues de fechaNacimiento:
  sexo            String?   // "M" | "F" | "X"
  direccion       String?
```

```bash
cd apps/api && npx prisma migrate dev --name paciente_sexo_direccion
```

- [ ] **Step 2: Extender CreatePacienteDto**

```typescript
// junto a los otros campos opcionales:
@IsIn(['M', 'F', 'X']) @IsOptional()
sexo?: string

@IsString() @IsOptional()
direccion?: string
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma/ apps/api/src/modules/pacientes/
git commit -m "feat(pacientes): add sexo and direccion fields per data model"
```

---

### Task 1: Agregar ruta `/pacientes/:id` y navegacion desde la lista

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/features/pacientes/PacientesPage.tsx`

- [ ] **Step 1: Agregar import y ruta en App.tsx**

```tsx
// apps/web/src/App.tsx
import { PacienteDetallePage } from './features/pacientes/PacienteDetallePage'

// dentro del Route padre:
<Route path="pacientes" element={<PacientesPage />} />
<Route path="pacientes/:id" element={<PacienteDetallePage />} />
```

- [ ] **Step 2: Agregar navegacion en PacientesPage**

Agregar `useNavigate` y `onClick` en cada fila de la tabla:

```tsx
// apps/web/src/features/pacientes/PacientesPage.tsx
import { useNavigate } from 'react-router-dom'

export function PacientesPage() {
  const navigate = useNavigate()
  // ...
  // en el <tr>:
  <tr
    key={p.id}
    onClick={() => navigate(`/pacientes/${p.id}`)}
    className="border-b last:border-0 hover:bg-slate-50 cursor-pointer"
  >
```

- [ ] **Step 3: Verificar que no hay error de TypeScript**

```bash
cd apps/web && npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/features/pacientes/PacientesPage.tsx
git commit -m "feat(pacientes): add /pacientes/:id route and row navigation"
```

---

### Task 2: Crear PacienteDetallePage

**Files:**
- Create: `apps/web/src/features/pacientes/PacienteDetallePage.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
// apps/web/src/features/pacientes/PacienteDetallePage.tsx
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, MessageCircle, Pencil } from 'lucide-react'
import { format, differenceInYears } from 'date-fns'
import { es } from 'date-fns/locale'
import { api } from '../../lib/api-client'
import { formatMoneda, formatFecha, buildWhatsAppUrl } from '../../lib/utils'
import { COLORES_ESTADO } from '@pos/types'
import type { EstadoCita } from '@pos/types'
import { CobroModal } from '../agenda/CobroModal'
import { PacienteModal } from './PacienteModal'
import type { Paciente, Cita } from '@pos/types'

const LABEL_ESTADO: Record<EstadoCita, string> = {
  PENDIENTE: 'Pendiente', CONFIRMADA: 'Confirmada', LLEGO: 'Llego',
  EN_ATENCION: 'En atencion', ATENDIDA: 'Atendida', COBRADO: 'Cobrado',
  CON_DEUDA: 'Con deuda', CANCELADA: 'Cancelada', NO_ASISTIO: 'No asistio',
  REPROGRAMADA: 'Reprogramada',
}

type PacienteDetalle = Paciente & {
  citas: Array<Cita & {
    doctor: { nombre: string }
    servicio: { nombre: string; precioBase: number }
    cobro: { id: string; total: number; saldoPendiente: number; estado: string } | null
  }>
}

export function PacienteDetallePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [citaCobro, setCitaCobro] = useState<Cita | null>(null)

  const { data: paciente, isLoading } = useQuery<PacienteDetalle>({
    queryKey: ['paciente', id],
    queryFn: () => api.get(`/pacientes/${id}`).then((r) => r.data),
    enabled: !!id,
  })

  if (isLoading) return <div className="p-6 text-slate-500">Cargando...</div>
  if (!paciente) return <div className="p-6 text-slate-500">Paciente no encontrado</div>

  const edad = paciente.fechaNacimiento
    ? differenceInYears(new Date(), new Date(paciente.fechaNacimiento))
    : null

  const citasOrdenadas = [...(paciente.citas ?? [])].sort(
    (a, b) => new Date(b.fechaHora).getTime() - new Date(a.fechaHora).getTime()
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/pacientes')} className="p-1 rounded hover:bg-slate-100">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-slate-800">
              {paciente.apellido}, {paciente.nombre}
            </h1>
            {Number(paciente.deudaTotal) > 0 && (
              <span className="text-xs text-red-600 font-medium">
                {formatMoneda(Number(paciente.deudaTotal))} en deuda
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {paciente.whatsapp && (
            <a
              href={buildWhatsAppUrl(paciente.whatsapp, `Hola ${paciente.nombre}, le contactamos desde el consultorio.`)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 px-3 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </a>
          )}
          <button
            onClick={() => setEditando(true)}
            className="flex items-center gap-1 px-3 py-2 border rounded-md text-sm hover:bg-slate-50"
          >
            <Pencil className="h-4 w-4" />
            Editar
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6 max-w-4xl mx-auto w-full">
        {/* Datos personales */}
        <div className="bg-white rounded-lg border p-5 grid grid-cols-2 gap-4 text-sm">
          {paciente.dni && <div><span className="text-slate-500">DNI:</span> <span className="font-medium">{paciente.dni}</span></div>}
          {paciente.telefono && <div><span className="text-slate-500">Telefono:</span> <span className="font-medium">{paciente.telefono}</span></div>}
          {paciente.whatsapp && <div><span className="text-slate-500">WhatsApp:</span> <span className="font-medium">{paciente.whatsapp}</span></div>}
          {paciente.email && <div><span className="text-slate-500">Email:</span> <span className="font-medium">{paciente.email}</span></div>}
          {paciente.fechaNacimiento && (
            <div>
              <span className="text-slate-500">Nacimiento:</span>{' '}
              <span className="font-medium">
                {formatFecha(paciente.fechaNacimiento)} ({edad} anos)
              </span>
            </div>
          )}
          {(paciente as any).sexo && (
            <div><span className="text-slate-500">Sexo:</span> <span className="font-medium">{(paciente as any).sexo}</span></div>
          )}
          {(paciente as any).direccion && (
            <div><span className="text-slate-500">Direccion:</span> <span className="font-medium">{(paciente as any).direccion}</span></div>
          )}
          {paciente.notas && (
            <div className="col-span-2">
              <span className="text-slate-500">Notas:</span>{' '}
              <span className="font-medium">{paciente.notas}</span>
            </div>
          )}
        </div>

        {/* Historial de citas */}
        <div>
          <h2 className="text-sm font-medium text-slate-600 uppercase tracking-wide mb-3">
            Historial de citas
          </h2>
          {citasOrdenadas.length === 0 ? (
            <div className="bg-white rounded-lg border p-8 text-center text-slate-400 text-sm">
              Sin citas registradas
            </div>
          ) : (
            <div className="bg-white rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Fecha</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Doctor</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Servicio</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Estado</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Total</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Saldo</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {citasOrdenadas.map((cita) => (
                    <tr key={cita.id} className="border-b last:border-0">
                      <td className="px-4 py-3 text-slate-700">
                        {format(new Date(cita.fechaHora), "dd/MM/yyyy HH:mm", { locale: es })}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{cita.doctor.nombre}</td>
                      <td className="px-4 py-3 text-slate-600">{cita.servicio.nombre}</td>
                      <td className="px-4 py-3">
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{
                            backgroundColor: COLORES_ESTADO[cita.estado as EstadoCita] + '20',
                            color: COLORES_ESTADO[cita.estado as EstadoCita],
                          }}
                        >
                          {LABEL_ESTADO[cita.estado as EstadoCita] ?? cita.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {cita.cobro ? formatMoneda(Number(cita.cobro.total)) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {cita.cobro && Number(cita.cobro.saldoPendiente) > 0 ? (
                          <span className="text-red-600 font-medium">
                            {formatMoneda(Number(cita.cobro.saldoPendiente))}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {cita.cobro && Number(cita.cobro.saldoPendiente) > 0 && (
                          <button
                            onClick={() => setCitaCobro(cita as unknown as Cita)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Cobrar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {editando && (
        <PacienteModal
          paciente={paciente}
          onClose={() => {
            setEditando(false)
            qc.invalidateQueries({ queryKey: ['paciente', id] })
          }}
        />
      )}

      {citaCobro && (
        <CobroModal
          cita={citaCobro}
          onClose={() => {
            setCitaCobro(null)
            qc.invalidateQueries({ queryKey: ['paciente', id] })
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
cd apps/web && npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/pacientes/PacienteDetallePage.tsx
git commit -m "feat(pacientes): add PacienteDetallePage with cita history"
```

---

### Task 3: Crear PacienteModal (crear y editar)

**Files:**
- Create: `apps/web/src/features/pacientes/PacienteModal.tsx`
- Modify: `apps/web/src/features/pacientes/PacientesPage.tsx`

- [ ] **Step 1: Crear PacienteModal**

```tsx
// apps/web/src/features/pacientes/PacienteModal.tsx
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { api } from '../../lib/api-client'
import type { Paciente } from '@pos/types'

interface Props {
  paciente?: Partial<Paciente>
  onClose: () => void
}

export function PacienteModal({ paciente, onClose }: Props) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const editando = !!paciente?.id
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    nombre: paciente?.nombre ?? '',
    apellido: paciente?.apellido ?? '',
    dni: paciente?.dni ?? '',
    telefono: paciente?.telefono ?? '',
    whatsapp: paciente?.whatsapp ?? '',
    email: paciente?.email ?? '',
    fechaNacimiento: paciente?.fechaNacimiento
      ? new Date(paciente.fechaNacimiento).toISOString().split('T')[0]
      : '',
    sexo: (paciente as any)?.sexo ?? '',
    direccion: (paciente as any)?.direccion ?? '',
    notas: paciente?.notas ?? '',
  })

  const mutation = useMutation({
    // Los campos opcionales vacios se envian como undefined, no '' —
    // @IsEmail/@IsISO8601 del backend rechazan el string vacio.
    mutationFn: (data: typeof form) => {
      const payload = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, v === '' ? undefined : v])
      )
      return editando
        ? api.put(`/pacientes/${paciente!.id}`, payload)
        : api.post('/pacientes', payload)
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['pacientes'] })
      if (!editando) navigate(`/pacientes/${res.data.id}`)
      onClose()
    },
    onError: (err: any) => setError(err.response?.data?.message ?? 'Error al guardar'),
  })

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    mutation.mutate(form)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
          <h2 className="text-lg font-semibold text-slate-800">
            {editando ? 'Editar paciente' : 'Nuevo paciente'}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
              <input required value={form.nombre} onChange={(e) => set('nombre', e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Apellido *</label>
              <input required value={form.apellido} onChange={(e) => set('apellido', e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">DNI</label>
              <input value={form.dni} onChange={(e) => set('dni', e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de nacimiento</label>
              <input type="date" value={form.fechaNacimiento} onChange={(e) => set('fechaNacimiento', e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Telefono</label>
              <input value={form.telefono} onChange={(e) => set('telefono', e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">WhatsApp</label>
              <input value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Sexo</label>
              <select value={form.sexo} onChange={(e) => set('sexo', e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">-</option>
                <option value="F">Femenino</option>
                <option value="M">Masculino</option>
                <option value="X">Otro</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Direccion</label>
            <input value={form.direccion} onChange={(e) => set('direccion', e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notas</label>
            <textarea value={form.notas} onChange={(e) => set('notas', e.target.value)} rows={2}
              className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border rounded-md text-sm text-slate-700 hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-60">
              {mutation.isPending ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear paciente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Conectar PacienteModal en PacientesPage**

```tsx
// apps/web/src/features/pacientes/PacientesPage.tsx
import { useState } from 'react'
import { PacienteModal } from './PacienteModal'

// agregar estado:
const [modalNuevo, setModalNuevo] = useState(false)

// cambiar boton:
<button onClick={() => setModalNuevo(true)} className="...">
  <Plus className="h-4 w-4" />
  Nuevo paciente
</button>

// al final del JSX:
{modalNuevo && <PacienteModal onClose={() => setModalNuevo(false)} />}
```

- [ ] **Step 3: Verificar TypeScript**

```bash
cd apps/web && npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/pacientes/PacienteModal.tsx apps/web/src/features/pacientes/PacientesPage.tsx
git commit -m "feat(pacientes): add PacienteModal for create and edit"
```

---

### Task 4: Exportar tipos necesarios en @pos/types

**Files:**
- Read: `packages/types/src/index.ts` — verificar que `Paciente` y `Cita` esten exportados

- [ ] **Step 1: Verificar exports y agregar campos nuevos**

```bash
grep -n "export" packages/types/src/index.ts
```

Si `Paciente` o `Cita` no estan exportados, agregarlos al `index.ts`.

Agregar a la interface `Paciente` los campos nuevos (y entonces eliminar los casts `(paciente as any)` de los componentes):

```typescript
sexo?: string | null
direccion?: string | null
```

- [ ] **Step 2: Verificar TypeScript global**

```bash
cd apps/web && npx tsc --noEmit
cd apps/api && npx tsc --noEmit
```

Esperado: sin errores en ambos.

- [ ] **Step 3: Commit final**

```bash
git add packages/types/src/
git commit -m "feat(pacientes): complete patient module - detail page + modal"
```
