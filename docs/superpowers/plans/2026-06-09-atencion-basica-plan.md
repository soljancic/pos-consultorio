# Atencion Basica — Plan de Implementacion

> **Para agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Prerequisito:** ejecutar antes `2026-06-09-fixes-previos-plan.md`.
> **Practicas:** aplicar el checklist "Buenas practicas y seguridad" de `PLAN.md` (seccion 8b).

**Goal:** El doctor registra evolucion/diagnostico/tratamiento de la cita y cualquier usuario autorizado lo consulta desde la ficha del paciente.

**Architecture:** Nuevo modulo `atenciones` en la API (GET/PUT upsert por citaId, el modelo Atencion ya existe 1:1 con Cita). Frontend: `AtencionModal` desde la agenda + fila expandible en la ficha del paciente.

**Tech Stack:** NestJS, Prisma, class-validator, React 19, TanStack Query v5, Tailwind CSS

---

### Task 1: Migracion — campo `tratamiento` en Atencion

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Agregar campo y migrar**

```prisma
// apps/api/prisma/schema.prisma — en model Atencion, despues de diagnostico:
  tratamiento    String?
```

```bash
cd apps/api && npx prisma migrate dev --name atencion_tratamiento
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/prisma/
git commit -m "feat(atenciones): add tratamiento field per MVP and data model"
```

---

### Task 2: Modulo atenciones en la API

**Files:**
- Create: `apps/api/src/modules/atenciones/atenciones.service.ts`
- Create: `apps/api/src/modules/atenciones/atenciones.controller.ts`
- Create: `apps/api/src/modules/atenciones/atenciones.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Crear AtencionesService**

```typescript
// apps/api/src/modules/atenciones/atenciones.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { IsString, IsOptional, IsISO8601 } from 'class-validator'
import { PrismaService } from '../../prisma/prisma.service'
import { EstadoCita } from '@prisma/client'

export class UpsertAtencionDto {
  @IsString() @IsOptional()
  motivo?: string

  @IsString() @IsOptional()
  diagnostico?: string

  @IsString() @IsOptional()
  tratamiento?: string

  @IsString() @IsOptional()
  evolucion?: string

  @IsISO8601() @IsOptional()
  proximoControl?: string
}

const ESTADOS_ATENDIBLES: EstadoCita[] = [
  EstadoCita.EN_ATENCION,
  EstadoCita.ATENDIDA,
  EstadoCita.COBRADO,
  EstadoCita.CON_DEUDA,
]

@Injectable()
export class AtencionesService {
  constructor(private prisma: PrismaService) {}

  async findByCita(consultorioId: string, citaId: string) {
    const atencion = await this.prisma.atencion.findFirst({
      where: { citaId, cita: { consultorioId, deletedAt: null } },
    })
    if (!atencion) throw new NotFoundException('La cita no tiene atencion registrada')
    return atencion
  }

  async upsert(consultorioId: string, citaId: string, dto: UpsertAtencionDto, usuarioId: string) {
    const cita = await this.prisma.cita.findFirst({
      where: { id: citaId, consultorioId, deletedAt: null },
      include: { atencion: true },
    })
    if (!cita) throw new NotFoundException('Cita no encontrada')
    if (!ESTADOS_ATENDIBLES.includes(cita.estado)) {
      throw new BadRequestException(
        `No se puede registrar atencion en una cita ${cita.estado}`,
      )
    }

    const data = {
      motivo: dto.motivo,
      diagnostico: dto.diagnostico,
      tratamiento: dto.tratamiento,
      evolucion: dto.evolucion,
      proximoControl: dto.proximoControl ? new Date(dto.proximoControl) : null,
    }

    const [atencion] = await this.prisma.$transaction([
      this.prisma.atencion.upsert({
        where: { citaId },
        create: { citaId, ...data },
        update: data,
      }),
      this.prisma.log.create({
        data: {
          consultorioId,
          usuarioId,
          entidad: 'Atencion',
          entidadId: citaId,
          accion: cita.atencion ? 'UPDATE' : 'CREATE',
          payloadAntes: cita.atencion
            ? { diagnostico: cita.atencion.diagnostico, tratamiento: cita.atencion.tratamiento }
            : undefined,
          payloadDespues: { diagnostico: dto.diagnostico, tratamiento: dto.tratamiento },
        },
      }),
    ])

    return atencion
  }
}
```

- [ ] **Step 2: Crear controller y module**

```typescript
// apps/api/src/modules/atenciones/atenciones.controller.ts
import { Controller, Get, Put, Body, Param } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { AtencionesService, UpsertAtencionDto } from './atenciones.service'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'

@ApiTags('Atenciones')
@ApiBearerAuth()
@Controller('atenciones')
export class AtencionesController {
  constructor(private service: AtencionesService) {}

  @Get('cita/:citaId')
  @ApiOperation({ summary: 'Atencion registrada de una cita' })
  findByCita(@CurrentUser() user: JwtPayload, @Param('citaId') citaId: string) {
    return this.service.findByCita(user.consultorioId, citaId)
  }

  @Put('cita/:citaId')
  @ApiOperation({ summary: 'Registrar o actualizar la atencion de una cita' })
  upsert(
    @CurrentUser() user: JwtPayload,
    @Param('citaId') citaId: string,
    @Body() dto: UpsertAtencionDto,
  ) {
    return this.service.upsert(user.consultorioId, citaId, dto, user.sub)
  }
}
```

```typescript
// apps/api/src/modules/atenciones/atenciones.module.ts
import { Module } from '@nestjs/common'
import { AtencionesService } from './atenciones.service'
import { AtencionesController } from './atenciones.controller'

@Module({
  providers: [AtencionesService],
  controllers: [AtencionesController],
})
export class AtencionesModule {}
```

En `app.module.ts`: importar y agregar `AtencionesModule` a `imports` (despues de `CitasModule`).

- [ ] **Step 3: Incluir atencion en la ficha del paciente**

En `pacientes.service.ts`, `findOne`, dentro del include de citas agregar:

```typescript
atencion: {
  select: { motivo: true, diagnostico: true, tratamiento: true, evolucion: true, proximoControl: true },
},
```

- [ ] **Step 4: Verificar TypeScript y commit**

```bash
cd apps/api && npx tsc --noEmit
git add apps/api/src/
git commit -m "feat(atenciones): add atenciones module with upsert per cita"
```

---

### Task 3: AtencionModal en el frontend

**Files:**
- Create: `apps/web/src/features/agenda/AtencionModal.tsx`

- [ ] **Step 1: Crear AtencionModal**

```tsx
// apps/web/src/features/agenda/AtencionModal.tsx
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { EstadoCita, type Cita } from '@pos/types'
import { api } from '../../lib/api-client'
import { formatHora } from '../../lib/utils'

interface Props {
  cita: Cita
  onClose: () => void
}

export function AtencionModal({ cita, onClose }: Props) {
  const qc = useQueryClient()
  const [error, setError] = useState('')
  const puedeMarcarAtendida = cita.estado === EstadoCita.EN_ATENCION

  const { data: atencion, isLoading } = useQuery({
    queryKey: ['atencion', cita.id],
    queryFn: () =>
      api.get(`/atenciones/cita/${cita.id}`).then((r) => r.data).catch((e) => {
        if (e.response?.status === 404) return null
        throw e
      }),
  })

  const [form, setForm] = useState({
    motivo: '', diagnostico: '', tratamiento: '', evolucion: '', proximoControl: '',
  })

  useEffect(() => {
    if (atencion) {
      setForm({
        motivo: atencion.motivo ?? '',
        diagnostico: atencion.diagnostico ?? '',
        tratamiento: atencion.tratamiento ?? '',
        evolucion: atencion.evolucion ?? '',
        proximoControl: atencion.proximoControl ? atencion.proximoControl.split('T')[0] : '',
      })
    }
  }, [atencion])

  const guardar = useMutation({
    mutationFn: async ({ marcarAtendida }: { marcarAtendida: boolean }) => {
      const payload = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, v === '' ? undefined : v])
      )
      await api.put(`/atenciones/cita/${cita.id}`, payload)
      if (marcarAtendida) {
        await api.put(`/citas/${cita.id}/estado`, { estado: EstadoCita.ATENDIDA })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['atencion', cita.id] })
      qc.invalidateQueries({ queryKey: ['citas'] })
      onClose()
    },
    onError: (err: any) => setError(err.response?.data?.message ?? 'Error al guardar'),
  })

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  const inputClass =
    'w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Atencion</h2>
            <p className="text-sm text-slate-500">
              {cita.paciente?.apellido}, {cita.paciente?.nombre} &bull; {cita.servicio?.nombre} &bull;{' '}
              {formatHora(cita.fechaHora)}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="p-6 text-center text-slate-500">Cargando...</div>
        ) : (
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Motivo de consulta</label>
              <input value={form.motivo} onChange={(e) => set('motivo', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Diagnostico</label>
              <input value={form.diagnostico} onChange={(e) => set('diagnostico', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tratamiento indicado</label>
              <input value={form.tratamiento} onChange={(e) => set('tratamiento', e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Evolucion / notas</label>
              <textarea rows={3} value={form.evolucion} onChange={(e) => set('evolucion', e.target.value)}
                className={`${inputClass} resize-none`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Proximo control</label>
              <input type="date" value={form.proximoControl} onChange={(e) => set('proximoControl', e.target.value)}
                className={inputClass} />
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={onClose}
                className="px-4 py-2 border rounded-md text-sm text-slate-700 hover:bg-slate-50">
                Cancelar
              </button>
              <button type="button" disabled={guardar.isPending}
                onClick={() => { setError(''); guardar.mutate({ marcarAtendida: false }) }}
                className="flex-1 px-4 py-2 border border-blue-600 text-blue-600 rounded-md text-sm hover:bg-blue-50 disabled:opacity-60">
                Guardar
              </button>
              {puedeMarcarAtendida && (
                <button type="button" disabled={guardar.isPending}
                  onClick={() => { setError(''); guardar.mutate({ marcarAtendida: true }) }}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-60">
                  {guardar.isPending ? 'Guardando...' : 'Guardar y marcar Atendida'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/features/agenda/AtencionModal.tsx
git commit -m "feat(atenciones): add AtencionModal component"
```

---

### Task 4: Conectar en CitaCard, AgendaPage y ficha del paciente

**Files:**
- Modify: `apps/web/src/features/agenda/CitaCard.tsx`
- Modify: `apps/web/src/features/agenda/AgendaPage.tsx`
- Modify: `apps/web/src/features/pacientes/PacienteDetallePage.tsx`

- [ ] **Step 1: Boton atencion en CitaCard**

Agregar prop `onAtencion: () => void` y boton (importar `Stethoscope` de lucide-react), junto al boton de cobro:

```tsx
const ESTADOS_CON_ATENCION = [
  EstadoCita.EN_ATENCION, EstadoCita.ATENDIDA, EstadoCita.COBRADO, EstadoCita.CON_DEUDA,
]

{ESTADOS_CON_ATENCION.includes(cita.estado) && (
  <button onClick={onAtencion} className="p-2 rounded hover:bg-violet-50 text-violet-600" title="Atencion">
    <Stethoscope className="h-4 w-4" />
  </button>
)}
```

> Ocultar el boton para SECRETARIA/CAJA cuando el estado es EN_ATENCION (solo DOCTOR/ADMIN registran): pasar `user` desde AgendaPage o leer `useAuthStore` en la card.

- [ ] **Step 2: Estado del modal en AgendaPage**

```tsx
const [modalAtencion, setModalAtencion] = useState(false)
// en CitaCard: onAtencion={() => { setCitaSeleccionada(cita); setModalAtencion(true) }}
// al final del JSX:
{modalAtencion && citaSeleccionada && (
  <AtencionModal
    cita={citaSeleccionada}
    onClose={() => {
      setModalAtencion(false)
      setCitaSeleccionada(null)
      queryClient.invalidateQueries({ queryKey: ['citas', fechaStr] })
    }}
  />
)}
```

- [ ] **Step 3: Fila expandible en PacienteDetallePage**

Estado `const [citaExpandida, setCitaExpandida] = useState<string | null>(null)`. En cada fila del historial cuya cita tenga `atencion`, un boton chevron que togglea; debajo, una fila extra:

```tsx
{citaExpandida === cita.id && (cita as any).atencion && (
  <tr className="bg-slate-50">
    <td colSpan={7} className="px-6 py-3 text-sm text-slate-600 space-y-1">
      {(cita as any).atencion.motivo && <p><span className="font-medium">Motivo:</span> {(cita as any).atencion.motivo}</p>}
      {(cita as any).atencion.diagnostico && <p><span className="font-medium">Diagnostico:</span> {(cita as any).atencion.diagnostico}</p>}
      {(cita as any).atencion.tratamiento && <p><span className="font-medium">Tratamiento:</span> {(cita as any).atencion.tratamiento}</p>}
      {(cita as any).atencion.evolucion && <p><span className="font-medium">Evolucion:</span> {(cita as any).atencion.evolucion}</p>}
    </td>
  </tr>
)}
```

- [ ] **Step 4: Verificar TypeScript y commit**

```bash
cd apps/web && npx tsc --noEmit
git add apps/web/src/features/
git commit -m "feat(atenciones): wire AtencionModal into agenda and patient detail"
```
