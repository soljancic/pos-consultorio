# Vista de Deudores — Plan de Implementacion

> **Para agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Prerequisito:** ejecutar antes `2026-06-09-fixes-previos-plan.md`.
> **Practicas:** aplicar el checklist "Buenas practicas y seguridad" de `PLAN.md` (seccion 8b).

**Goal:** Pantalla `/deudores` que lista todos los pacientes con deuda real (citas atendidas con saldo), con acciones de cobro y WhatsApp.

**Architecture:** Se REESCRIBE el `getDeudores` existente en `CobrosService` (hoy devuelve una lista plana que incluye citas futuras) para agrupar por paciente y filtrar `cita.estado in [ATENDIDA, CON_DEUDA]`. El endpoint `GET /cobros/deudores` ya existe en el controller y no cambia. Frontend usa `CobroModal` existente para cobrar desde la lista.

**Tech Stack:** React 19, TypeScript, TanStack Query v5, Tailwind CSS, NestJS, Prisma

---

### Task 1: Reescribir `getDeudores` en CobrosService

**Files:**
- Modify: `apps/api/src/modules/cobros/cobros.service.ts` (metodo `getDeudores`, lineas ~124-137)

**Contexto:** el metodo actual lista cobros PENDIENTE/PARCIAL sin mirar el estado de la cita. Como `CitasService.create` crea un cobro PENDIENTE por cada cita, hoy cualquier paciente con cita futura apareceria como deudor. Deuda real = cita ATENDIDA o CON_DEUDA con `saldoPendiente > 0`.

- [ ] **Step 1: Reemplazar getDeudores**

```typescript
// apps/api/src/modules/cobros/cobros.service.ts
// reemplaza el metodo getDeudores existente:

async getDeudores(consultorioId: string) {
  const cobros = await this.prisma.cobro.findMany({
    where: {
      consultorioId,
      saldoPendiente: { gt: 0 },
      cita: {
        estado: { in: [EstadoCita.ATENDIDA, EstadoCita.CON_DEUDA] },
        deletedAt: null,
      },
    },
    include: {
      pagos: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      cita: {
        include: {
          paciente: { select: { id: true, nombre: true, apellido: true, whatsapp: true } },
          servicio: { select: { nombre: true } },
        },
      },
    },
  })

  // Agrupar por paciente
  type Deudor = {
    pacienteId: string
    nombre: string
    apellido: string
    whatsapp: string | null
    deudaTotal: number
    ultimaCitaFecha: Date
    ultimoServicio: string
    ultimoPago: Date | null
    cobros: typeof cobros
  }
  const porPaciente = new Map<string, Deudor>()

  for (const cobro of cobros) {
    const pac = cobro.cita.paciente
    const fechaCita = new Date(cobro.cita.fechaHora)
    const fechaPago = cobro.pagos[0]?.createdAt ?? null
    const existing = porPaciente.get(pac.id)

    if (existing) {
      existing.deudaTotal += Number(cobro.saldoPendiente)
      if (fechaCita > existing.ultimaCitaFecha) {
        existing.ultimaCitaFecha = fechaCita
        existing.ultimoServicio = cobro.cita.servicio.nombre
      }
      if (fechaPago && (!existing.ultimoPago || fechaPago > existing.ultimoPago)) {
        existing.ultimoPago = fechaPago
      }
      existing.cobros.push(cobro)
    } else {
      porPaciente.set(pac.id, {
        pacienteId: pac.id,
        nombre: pac.nombre,
        apellido: pac.apellido,
        whatsapp: pac.whatsapp,
        deudaTotal: Number(cobro.saldoPendiente),
        ultimaCitaFecha: fechaCita,
        ultimoServicio: cobro.cita.servicio.nombre,
        ultimoPago: fechaPago,
        cobros: [cobro],
      })
    }
  }

  return Array.from(porPaciente.values()).sort((a, b) => b.deudaTotal - a.deudaTotal)
}
```

> Nota: este archivo importa `EstadoCobro, EstadoCita, FormaPago` desde `@pos/types`. Para el filtro Prisma usar `EstadoCita` de `@prisma/client` (mismo patron que `citas.service.ts`) o strings literales `'ATENDIDA' | 'CON_DEUDA'` — los valores coinciden.

- [ ] **Step 2: Controller — sin cambios**

`GET /cobros/deudores` ya existe en `cobros.controller.ts:12` y esta declarado antes de `GET cita/:citaId`. Solo actualizar el summary si se desea: `'Pacientes con deuda real (agrupado)'`.

- [ ] **Step 3: Verificar TypeScript**

```bash
cd apps/api && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/cobros/
git commit -m "feat(cobros): group deudores by patient and filter by real debt (ATENDIDA/CON_DEUDA)"
```

---

### Task 2: Crear DeudoresPage

**Files:**
- Create: `apps/web/src/features/deudores/DeudoresPage.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/shared/AppShell.tsx`

- [ ] **Step 1: Crear DeudoresPage**

```tsx
// apps/web/src/features/deudores/DeudoresPage.tsx
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, DollarSign } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatMoneda, formatFecha, buildWhatsAppUrl } from '../../lib/utils'
import { CobroModal } from '../agenda/CobroModal'
import type { Cita } from '@pos/types'

type Deudor = {
  pacienteId: string
  nombre: string
  apellido: string
  whatsapp: string | null
  deudaTotal: number
  ultimaCitaFecha: string
  ultimoServicio: string
  ultimoPago: string | null
  cobros: Array<{
    id: string
    saldoPendiente: number
    cita: Cita & { paciente: any; doctor: any; servicio: any; cobro: any }
  }>
}

export function DeudoresPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [citaCobro, setCitaCobro] = useState<Cita | null>(null)

  const { data: deudores = [], isLoading } = useQuery<Deudor[]>({
    queryKey: ['deudores'],
    queryFn: () => api.get('/cobros/deudores').then((r) => r.data),
  })

  const filtrados = deudores.filter((d) => {
    const q = search.toLowerCase()
    return (
      d.nombre.toLowerCase().includes(q) ||
      d.apellido.toLowerCase().includes(q)
    )
  })

  const totalDeuda = filtrados.reduce((acc, d) => acc + d.deudaTotal, 0)

  function cobrarDeudor(deudor: Deudor) {
    const cobroMayor = [...deudor.cobros].sort(
      (a, b) => Number(b.saldoPendiente) - Number(a.saldoPendiente)
    )[0]
    setCitaCobro(cobroMayor.cita)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
        <h1 className="text-lg font-semibold text-slate-800">Deudores</h1>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre..."
          className="px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
        />
      </div>

      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="text-center text-slate-500 py-12">Cargando...</div>
        ) : filtrados.length === 0 ? (
          <div className="text-center text-slate-400 py-12">
            {search ? 'No se encontraron deudores' : 'No hay deudas pendientes'}
          </div>
        ) : (
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Paciente</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Ultima cita</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Servicio</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Ultimo pago</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Deuda</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtrados.map((d) => (
                  <tr key={d.pacienteId} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {d.apellido}, {d.nombre}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatFecha(d.ultimaCitaFecha)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{d.ultimoServicio}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {d.ultimoPago ? formatFecha(d.ultimoPago) : 'Sin pagos'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-red-600">
                      {formatMoneda(d.deudaTotal)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {d.whatsapp && (
                          <a
                            href={buildWhatsAppUrl(
                              d.whatsapp,
                              `Hola ${d.nombre}, le recordamos que tiene un saldo pendiente de ${formatMoneda(d.deudaTotal)}. Muchas gracias.`
                            )}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded bg-green-50 text-green-600 hover:bg-green-100"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </a>
                        )}
                        <button
                          onClick={() => cobrarDeudor(d)}
                          className="p-1.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100"
                        >
                          <DollarSign className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-sm text-slate-500">
                    {filtrados.length} paciente{filtrados.length !== 1 ? 's' : ''}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600">
                    {formatMoneda(totalDeuda)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {citaCobro && (
        <CobroModal
          cita={citaCobro}
          onClose={() => {
            setCitaCobro(null)
            qc.invalidateQueries({ queryKey: ['deudores'] })
            qc.invalidateQueries({ queryKey: ['deudores-resumen'] })
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Agregar ruta y nav en App.tsx y AppShell**

En `App.tsx`:
```tsx
import { DeudoresPage } from './features/deudores/DeudoresPage'
// dentro del Route padre:
<Route path="deudores" element={<DeudoresPage />} />
```

En `AppShell.tsx`, agregar a `NAV_ITEMS` (importar `AlertCircle` de lucide-react):
```tsx
{ to: '/deudores', icon: AlertCircle, label: 'Deudores' },
```

- [ ] **Step 3: Verificar TypeScript**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/deudores/ apps/web/src/App.tsx apps/web/src/components/shared/AppShell.tsx
git commit -m "feat(deudores): add deudores page with cobro and WhatsApp actions"
```
