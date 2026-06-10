# Dashboard — Plan de Implementacion

> **Para agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Prerequisito:** ejecutar antes `2026-06-09-fixes-previos-plan.md`.
> **Practicas:** aplicar el checklist "Buenas practicas y seguridad" de `PLAN.md` (seccion 8b).

**Goal:** Pantalla de inicio con metricas del dia (citas, caja, deudas) que reemplaza la redireccion directa a `/agenda`.

**Architecture:** Un nuevo endpoint `GET /cobros/deudores/resumen` para el total de deudas. Las metricas de citas se calculan en el frontend desde la query existente de citas del dia. La caja reutiliza `GET /caja/hoy`. El dashboard es el componente raiz al entrar al sistema.

**Tech Stack:** React 19, TypeScript, TanStack Query v5, React Router v7, Tailwind CSS, NestJS, Prisma

---

### Task 1: Endpoint `GET /cobros/deudores/resumen`

**Files:**
- Modify: `apps/api/src/modules/cobros/cobros.service.ts`
- Modify: `apps/api/src/modules/cobros/cobros.controller.ts`

- [ ] **Step 1: Agregar metodo en CobrosService**

Filtra igual que `getDeudores` (solo deuda real: citas ATENDIDA o CON_DEUDA — las citas futuras crean cobros PENDIENTE que no son deuda).

```typescript
// apps/api/src/modules/cobros/cobros.service.ts
// agregar al final de la clase CobrosService:

async getDeudoresResumen(consultorioId: string) {
  const whereDeuda = {
    consultorioId,
    saldoPendiente: { gt: 0 },
    cita: {
      estado: { in: [EstadoCita.ATENDIDA, EstadoCita.CON_DEUDA] },
      deletedAt: null,
    },
  } as const

  const [suma, cobros] = await Promise.all([
    this.prisma.cobro.aggregate({
      where: whereDeuda,
      _sum: { saldoPendiente: true },
    }),
    this.prisma.cobro.findMany({
      where: whereDeuda,
      select: { cita: { select: { pacienteId: true } } },
    }),
  ])

  const pacienteIds = new Set(cobros.map((c) => c.cita.pacienteId))

  return {
    totalDeuda: Number(suma._sum.saldoPendiente ?? 0),
    cantidadPacientes: pacienteIds.size,
  }
}
```

> `EstadoCita` para el filtro Prisma: usar el de `@prisma/client` o strings literales (ver nota en el plan de deudores).

- [ ] **Step 2: Agregar endpoint en CobrosController**

```typescript
// apps/api/src/modules/cobros/cobros.controller.ts
// agregar antes del GET /:id o al final:

@Get('deudores/resumen')
@ApiOperation({ summary: 'Resumen de deudas pendientes' })
getDeudoresResumen(@CurrentUser() user: JwtPayload) {
  return this.service.getDeudoresResumen(user.consultorioId)
}
```

- [ ] **Step 3: Verificar TypeScript del API**

```bash
cd apps/api && npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/cobros/
git commit -m "feat(cobros): add GET /cobros/deudores/resumen endpoint"
```

---

### Task 2: Crear DashboardPage

**Files:**
- Create: `apps/web/src/features/dashboard/DashboardPage.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Crear DashboardPage**

```tsx
// apps/web/src/features/dashboard/DashboardPage.tsx
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api-client'
import { formatMoneda } from '../../lib/utils'
import { EstadoCita } from '@pos/types'
import type { Cita } from '@pos/types'
import { useAuthStore } from '../../stores/auth.store'

function StatCard({ label, value, color = 'blue' }: { label: string; value: number; color?: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    yellow: 'bg-yellow-50 text-yellow-700',
    red: 'bg-red-50 text-red-700',
  }
  return (
    <div className={`rounded-xl p-5 ${colors[color] ?? colors.blue}`}>
      <p className="text-sm font-medium opacity-75">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const hoy = format(new Date(), 'yyyy-MM-dd')
  const fechaLabel = format(new Date(), "EEEE d 'de' MMMM", { locale: es })

  const { data: citas = [] } = useQuery<Cita[]>({
    queryKey: ['citas', hoy],
    queryFn: () => api.get(`/citas?fecha=${hoy}`).then((r) => r.data),
  })

  const { data: caja } = useQuery({
    queryKey: ['caja-hoy'],
    queryFn: () => api.get('/caja/hoy').then((r) => r.data),
  })

  const { data: deudas } = useQuery<{ totalDeuda: number; cantidadPacientes: number }>({
    queryKey: ['deudores-resumen'],
    queryFn: () => api.get('/cobros/deudores/resumen').then((r) => r.data),
  })

  const inicioMes = format(new Date(), 'yyyy-MM-01')
  const { data: historialMes = [] } = useQuery<Array<{ totalGeneral: string }>>({
    queryKey: ['caja-historial', inicioMes, hoy],
    queryFn: () =>
      api.get(`/caja/historial?desde=${inicioMes}&hasta=${hoy}`).then((r) => r.data),
  })
  const ingresosMes = historialMes.reduce((acc, c) => acc + Number(c.totalGeneral), 0)

  const enEspera = citas.filter((c) => c.estado === EstadoCita.LLEGO).length
  const enAtencion = citas.filter((c) => c.estado === EstadoCita.EN_ATENCION).length
  const porCobrar = citas.filter(
    (c) => c.estado === EstadoCita.ATENDIDA || c.estado === EstadoCita.CON_DEUDA
  ).length
  const atendidosHoy = citas.filter(
    (c) =>
      c.estado === EstadoCita.ATENDIDA ||
      c.estado === EstadoCita.COBRADO ||
      c.estado === EstadoCita.CON_DEUDA
  ).length

  const proximasCitas = citas
    .filter((c) => c.estado === EstadoCita.PENDIENTE || c.estado === EstadoCita.CONFIRMADA)
    .sort((a, b) => new Date(a.fechaHora).getTime() - new Date(b.fechaHora).getTime())
    .slice(0, 5)

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6 max-w-5xl mx-auto w-full">
      <div>
        <h1 className="text-xl font-semibold text-slate-800 capitalize">
          Buen dia{user?.nombre ? `, ${user.nombre}` : ''}
        </h1>
        <p className="text-sm text-slate-500 capitalize">{fechaLabel}</p>
      </div>

      {/* Metricas de citas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Citas hoy" value={citas.length} color="blue" />
        <StatCard label="En espera" value={enEspera} color="yellow" />
        <StatCard label="En atencion" value={enAtencion} color="green" />
        <StatCard label="Atendidos" value={atendidosHoy} color="green" />
        <StatCard label="Por cobrar" value={porCobrar} color="red" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Caja del dia */}
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-sm font-medium text-slate-600 uppercase tracking-wide mb-3">
            Caja del dia
          </h2>
          {caja ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Efectivo</span>
                <span className="font-medium">{formatMoneda(Number(caja.totalEfectivo))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">QR</span>
                <span className="font-medium">{formatMoneda(Number(caja.totalQr))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Transferencia</span>
                <span className="font-medium">{formatMoneda(Number(caja.totalTransferencia))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Tarjeta</span>
                <span className="font-medium">{formatMoneda(Number(caja.totalTarjeta))}</span>
              </div>
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Total</span>
                <span>{formatMoneda(Number(caja.totalGeneral))}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400 pt-1">
                <span>Ingresos del mes</span>
                <span>{formatMoneda(ingresosMes)}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Caja no iniciada hoy</p>
          )}
        </div>

        {/* Deudas pendientes */}
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-sm font-medium text-slate-600 uppercase tracking-wide mb-3">
            Deudas pendientes
          </h2>
          {deudas && deudas.totalDeuda > 0 ? (
            <div className="space-y-3">
              <div>
                <p className="text-3xl font-bold text-red-600">
                  {formatMoneda(deudas.totalDeuda)}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  {deudas.cantidadPacientes} paciente{deudas.cantidadPacientes !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={() => navigate('/deudores')}
                className="text-sm text-blue-600 hover:underline"
              >
                Ver deudores →
              </button>
            </div>
          ) : (
            <p className="text-sm text-green-600 font-medium">Sin deudas pendientes</p>
          )}
        </div>
      </div>

      {/* Proximas citas */}
      {proximasCitas.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-slate-600 uppercase tracking-wide mb-3">
            Proximas citas de hoy
          </h2>
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {proximasCitas.map((cita) => (
                  <tr
                    key={cita.id}
                    onClick={() => navigate('/agenda')}
                    className="border-b last:border-0 hover:bg-slate-50 cursor-pointer"
                  >
                    <td className="px-4 py-3 font-medium text-slate-700 w-20">
                      {format(new Date(cita.fechaHora), 'HH:mm')}
                    </td>
                    <td className="px-4 py-3 text-slate-800">
                      {(cita as any).paciente?.apellido}, {(cita as any).paciente?.nombre}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {(cita as any).doctor?.nombre}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {(cita as any).servicio?.nombre}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Actualizar App.tsx**

```tsx
// apps/web/src/App.tsx
import { DashboardPage } from './features/dashboard/DashboardPage'

// Cambiar:
// <Route index element={<Navigate to="/agenda" replace />} />
// Por:
<Route index element={<DashboardPage />} />
```

- [ ] **Step 3: Verificar TypeScript**

```bash
cd apps/web && npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/dashboard/ apps/web/src/App.tsx
git commit -m "feat(dashboard): add home dashboard with daily metrics"
```
