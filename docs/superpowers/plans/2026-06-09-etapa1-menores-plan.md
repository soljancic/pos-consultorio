# Cierre de Etapa 1 (Menores) — Plan de Implementacion

> **Para agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Prerequisito:** ejecutar antes `2026-06-09-fixes-previos-plan.md`. Recomendado: ultimo plan de la Etapa 1.
> **Practicas:** aplicar el checklist "Buenas practicas y seguridad" de `PLAN.md` (seccion 8b).

**Goal:** Filtro por doctor en agenda (con vista restringida para rol DOCTOR), historial de cajas, y desglose de caja "pagos de deuda anterior / nuevas deudas".

**Architecture:** Sin endpoints nuevos. `GET /citas?doctorId=` y `GET /caja/historial` ya existen; solo se enriquece la respuesta de `GET /caja/hoy` con dos agregados calculados.

**Tech Stack:** React 19, TanStack Query v5, Tailwind CSS, NestJS, Prisma

---

### Task 1: Filtro por doctor en AgendaPage

**Files:**
- Modify: `apps/web/src/features/agenda/AgendaPage.tsx`

- [ ] **Step 1: Query de doctores + estado del filtro**

```tsx
// imports nuevos:
import { useAuthStore } from '../../stores/auth.store'

// dentro de AgendaPage:
const user = useAuthStore((s) => s.user)
const [doctorId, setDoctorId] = useState<string>('')

const { data: doctores = [] } = useQuery<any[]>({
  queryKey: ['doctores'],
  queryFn: () => api.get('/doctores').then((r) => r.data),
})

// Rol DOCTOR: fijar su propio doctor y ocultar el dropdown
const doctorPropio = user?.rol === 'DOCTOR'
  ? doctores.find((d) => d.usuarioId === user.id)
  : undefined

useEffect(() => {
  if (doctorPropio) setDoctorId(doctorPropio.id)
}, [doctorPropio?.id])
```

(importar `useEffect` de react)

- [ ] **Step 2: Sumar doctorId a la query de citas**

```tsx
const { data: citas = [], isLoading } = useQuery<Cita[]>({
  queryKey: ['citas', fechaStr, doctorId],
  queryFn: () =>
    api
      .get(`/citas?fecha=${fechaStr}${doctorId ? `&doctorId=${doctorId}` : ''}`)
      .then((r) => r.data),
})
```

Actualizar las invalidaciones existentes de `['citas', fechaStr]` a `['citas', fechaStr, doctorId]` (o invalidar por prefijo `['citas']`).

- [ ] **Step 3: Dropdown en el header (oculto para DOCTOR)**

Entre la navegacion de fecha y el boton "Nueva cita":

```tsx
{user?.rol !== 'DOCTOR' && (
  <select
    value={doctorId}
    onChange={(e) => setDoctorId(e.target.value)}
    className="px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
  >
    <option value="">Todos los doctores</option>
    {doctores.map((d) => (
      <option key={d.id} value={d.id}>{d.nombre}</option>
    ))}
  </select>
)}
```

> Guard duro en backend (DOCTOR no puede pedir agenda ajena) queda para Etapa 2 — anotado en el spec.

- [ ] **Step 4: Verificar TypeScript y commit**

```bash
cd apps/web && npx tsc --noEmit
git add apps/web/src/features/agenda/AgendaPage.tsx
git commit -m "feat(agenda): add doctor filter with locked view for DOCTOR role"
```

---

### Task 2: Desglose de caja en la API

**Files:**
- Modify: `apps/api/src/modules/caja/caja.service.ts`

- [ ] **Step 1: Enriquecer getHoy**

Reemplazar el `return { caja, pagos }` calculando los agregados (los pagos ya traen `cobro.cita.fechaHora`; agregar `fechaHora` y `estado` al include si el select actual no los trae — el include actual trae la cita completa, ya estan):

```typescript
// despues de obtener caja y pagos, antes del return:

// Pagos cuya cita es de una fecha anterior a hoy = cobro de deuda vieja
const pagosDeudaAnterior = pagos
  .filter((p) => new Date(p.cobro.cita.fechaHora) < hoy)
  .reduce((acc, p) => acc + Number(p.monto), 0)

// Nuevas deudas: saldo pendiente de cobros de citas de HOY que quedaron ATENDIDA o CON_DEUDA
const finDia = new Date(hoy.getTime() + 24 * 60 * 60 * 1000)
const cobrosHoy = await this.prisma.cobro.findMany({
  where: {
    consultorioId,
    saldoPendiente: { gt: 0 },
    cita: {
      fechaHora: { gte: hoy, lt: finDia },
      estado: { in: ['ATENDIDA', 'CON_DEUDA'] },
      deletedAt: null,
    },
  },
  select: { saldoPendiente: true },
})
const nuevasDeudas = cobrosHoy.reduce((acc, c) => acc + Number(c.saldoPendiente), 0)

return { caja, pagos, pagosDeudaAnterior, nuevasDeudas }
```

- [ ] **Step 2: Verificar TypeScript y commit**

```bash
cd apps/api && npx tsc --noEmit
git add apps/api/src/modules/caja/
git commit -m "feat(caja): split prior-debt payments and new debts in daily summary (MVP requirement)"
```

---

### Task 3: CajaPage con tabs Hoy/Historial y cards de desglose

**Files:**
- Modify: `apps/web/src/features/caja/CajaPage.tsx`

- [ ] **Step 1: Tabs y estado**

```tsx
import { useState } from 'react'
import { format, subDays } from 'date-fns'
import { formatFecha } from '../../lib/utils' // sumar al import existente

const [tab, setTab] = useState<'hoy' | 'historial'>('hoy')
const [desde, setDesde] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
const [hasta, setHasta] = useState(format(new Date(), 'yyyy-MM-dd'))

const { data: historial = [] } = useQuery<any[]>({
  queryKey: ['caja-historial', desde, hasta],
  queryFn: () => api.get(`/caja/historial?desde=${desde}&hasta=${hasta}`).then((r) => r.data),
  enabled: tab === 'historial',
})
```

Tabs en el header (mismo patron que ConfiguracionPage). El contenido actual completo pasa a renderizarse solo cuando `tab === 'hoy'`.

- [ ] **Step 2: Cards de desglose en tab Hoy**

Debajo de la grilla de totales:

```tsx
<div className="grid grid-cols-2 gap-3">
  <div className="bg-white rounded-lg border border-green-200 p-4">
    <div className="text-xs text-slate-500 mb-1">Pagos de deuda anterior</div>
    <div className="text-xl font-bold text-green-700">
      {formatMoneda(Number(data?.pagosDeudaAnterior || 0))}
    </div>
  </div>
  <div className="bg-white rounded-lg border border-red-200 p-4">
    <div className="text-xs text-slate-500 mb-1">Nuevas deudas de hoy</div>
    <div className="text-xl font-bold text-red-600">
      {formatMoneda(Number(data?.nuevasDeudas || 0))}
    </div>
  </div>
</div>
```

Badge en la tabla de movimientos (columna Paciente), cuando la cita del pago es de un dia anterior:

```tsx
{new Date(p.cobro.cita.fechaHora).toDateString() !== new Date().toDateString() &&
  new Date(p.cobro.cita.fechaHora) < new Date() && (
  <span className="ml-2 text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-medium">Deuda</span>
)}
```

- [ ] **Step 3: Tab Historial**

```tsx
{tab === 'historial' && (
  <div className="p-6 flex-1 overflow-auto space-y-4">
    <div className="flex items-center gap-2">
      <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
        className="px-3 py-2 border rounded-md text-sm" />
      <span className="text-slate-400">→</span>
      <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
        className="px-3 py-2 border rounded-md text-sm" />
    </div>
    <div className="bg-white rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-slate-600">Fecha</th>
            <th className="text-right px-4 py-3 font-medium text-slate-600">Efectivo</th>
            <th className="text-right px-4 py-3 font-medium text-slate-600">QR</th>
            <th className="text-right px-4 py-3 font-medium text-slate-600">Transf.</th>
            <th className="text-right px-4 py-3 font-medium text-slate-600">Tarjeta</th>
            <th className="text-right px-4 py-3 font-medium text-slate-600">Total</th>
            <th className="text-left px-4 py-3 font-medium text-slate-600">Estado</th>
          </tr>
        </thead>
        <tbody>
          {historial.map((c) => (
            <tr key={c.id} className="border-b last:border-0">
              <td className="px-4 py-3 font-medium">{formatFecha(c.fecha)}</td>
              <td className="px-4 py-3 text-right">{formatMoneda(Number(c.totalEfectivo))}</td>
              <td className="px-4 py-3 text-right">{formatMoneda(Number(c.totalQr))}</td>
              <td className="px-4 py-3 text-right">{formatMoneda(Number(c.totalTransferencia))}</td>
              <td className="px-4 py-3 text-right">{formatMoneda(Number(c.totalTarjeta))}</td>
              <td className="px-4 py-3 text-right font-semibold">{formatMoneda(Number(c.totalGeneral))}</td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.cerrada ? 'bg-slate-100 text-slate-600' : 'bg-green-50 text-green-700'}`}>
                  {c.cerrada ? 'Cerrada' : 'Abierta'}
                </span>
              </td>
            </tr>
          ))}
          {historial.length === 0 && (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Sin cajas en el periodo</td></tr>
          )}
        </tbody>
        <tfoot className="bg-slate-50 border-t">
          <tr>
            <td colSpan={5} className="px-4 py-3 text-sm text-slate-500">Total del periodo</td>
            <td className="px-4 py-3 text-right font-bold">
              {formatMoneda(historial.reduce((acc, c) => acc + Number(c.totalGeneral), 0))}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
)}
```

- [ ] **Step 4: Verificar TypeScript y commit**

```bash
cd apps/web && npx tsc --noEmit
git add apps/web/src/features/caja/CajaPage.tsx
git commit -m "feat(caja): add history tab and debt breakdown cards"
```
