# Devolución de productos vendidos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que un ADMIN deshaga la venta de un ítem de producto desde un reporte de detalle en Inventario: devuelve el stock y revierte la plata de ese ítem (baja la deuda y/o reembolsa lo ya pagado en la misma forma cobrada).

**Architecture:** Acción a nivel de línea (`DetalleCobro` de producto), separada de `anularPago`. La línea se marca como devuelta (soft), el stock se restituye si el producto controla inventario, el cobro se recomputa (igual que `setProductos`, conservando el descuento) y la parte ya pagada se reembolsa creando pagos negativos por forma de pago que descuentan la caja de hoy. La lógica financiera vive en funciones puras testeables con jest; la orquestación transaccional en `cobros.service.ts`.

**Tech Stack:** NestJS + Prisma + PostgreSQL (api), Decimal de Prisma para dinero, React 19 + Vite + TanStack Query v5 + Tailwind (web), jest (unit), gate PowerShell (integración).

## Global Constraints

- `consultorioId` SIEMPRE del JWT (`@CurrentUser()`), nunca del body/params.
- Dinero: `Decimal` de Prisma siempre; `Number()` solo para mostrar en UI.
- Borrado siempre soft (`devueltoAt`); los pagos nunca se borran (reversa con monto negativo).
- Operaciones multi-tabla en `prisma.$transaction`. Acciones críticas registran en `Log`.
- Endpoints de admin: `@Roles(Rol.ADMIN)` con `Rol` de `@pos/types`.
- DTO con decoradores class-validator o el request da 400. Query params como string parseados en el controller (patrón de `productos.controller.ts`).
- Fechas: rangos UTC con strings `Z` (`new Date(\`${fecha}T00:00:00Z\`)`); nunca `setHours()` en services.
- UI: copy visible en español CON acentos; identificadores de código SIN acentos. Nada de `window.confirm/alert/prompt`. Toda UI nueva pasa por los skills `impeccable` + `ui-ux-pro-max` + `frontend-design` ANTES del JSX. Touch targets ≥44px, focus-visible ring, `tabular-nums` en montos/horas, transiciones 150-300ms.
- Verificación previa a cada commit: `cd apps/api && npx tsc --noEmit` y `cd apps/web && npx tsc --noEmit`.
- No deployar. No tocar Railway. No borrar datos de prod.

**Invariante financiera que el feature debe preservar:** `SUM(pagos del cobro) == total − saldoPendiente`.

---

### Task 1: Migración — marca de devolución en `DetalleCobro`

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `DetalleCobro`, model `Usuario`)
- Create (generado): `apps/api/prisma/migrations/<timestamp>_add_detalle_devolucion/migration.sql`

**Interfaces:**
- Produces: columnas `DetalleCobro.devueltoAt: DateTime?`, `DetalleCobro.devueltoPorId: Int?` y relación `devueltoPor`. Las usan las Tasks 2-9.

- [ ] **Step 1: Agregar los campos al model `DetalleCobro`**

En `apps/api/prisma/schema.prisma`, dentro de `model DetalleCobro`, después de `createdAt DateTime @default(now())` agregar:

```prisma
  // Devolucion a nivel de linea (soft): la linea no se borra; devueltoAt!=null
  // la excluye de los recomputos de cobro y de los reportes de ventas.
  devueltoAt    DateTime?
  devueltoPorId Int?
  devueltoPor   Usuario?  @relation("DetalleDevueltoPor", fields: [devueltoPorId], references: [id])
```

- [ ] **Step 2: Agregar la relación inversa en `model Usuario`**

En `model Usuario`, junto a las demás relaciones de `Usuario` (donde están las otras listas de relaciones), agregar:

```prisma
  detallesDevueltos DetalleCobro[] @relation("DetalleDevueltoPor")
```

- [ ] **Step 3: Crear la migración (no destructiva, solo agrega columnas nullable)**

Run: `cd apps/api && npx prisma migrate dev --name add_detalle_devolucion`
Expected: crea la migración y regenera el client sin errores. La migración solo hace `ALTER TABLE "detalle_cobros" ADD COLUMN ...` (nullable) + FK a `usuarios`.

- [ ] **Step 4: Verificar tipos**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores. El client de Prisma ahora conoce `devueltoAt`/`devueltoPorId`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(devolucion): marca devuelto en DetalleCobro (migracion no destructiva)"
```

---

### Task 2: Helper puro — `calcularRepartoDevolucion`

**Files:**
- Create: `apps/api/src/modules/cobros/devolucion.helper.ts`
- Test: `apps/api/src/modules/cobros/devolucion.helper.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  interface RepartoDevolucion {
    totalNuevo: Decimal; descuentoNuevo: Decimal; delta: Decimal;
    deudaReduccion: Decimal; reembolso: Decimal; nuevoSaldo: Decimal;
  }
  function calcularRepartoDevolucion(
    total: Decimal, descuento: Decimal, saldoPendiente: Decimal, subtotalLinea: Decimal,
  ): RepartoDevolucion
  ```
  Lo consume `devolverDetalle` (Task 5).

- [ ] **Step 1: Escribir el test que falla**

Crear `apps/api/src/modules/cobros/devolucion.helper.spec.ts`:

```ts
import { Decimal } from '@prisma/client/runtime/library'
import { calcularRepartoDevolucion } from './devolucion.helper'

const D = (n: number | string) => new Decimal(n)

describe('calcularRepartoDevolucion', () => {
  it('item no pagado: todo baja deuda, sin reembolso', () => {
    // total 150, descuento 0, saldo 150 (nada pagado), linea 50
    const r = calcularRepartoDevolucion(D(150), D(0), D(150), D(50))
    expect(r.totalNuevo.toString()).toBe('100')
    expect(r.delta.toString()).toBe('50')
    expect(r.deudaReduccion.toString()).toBe('50')
    expect(r.reembolso.toString()).toBe('0')
    expect(r.nuevoSaldo.toString()).toBe('100')
  })

  it('item totalmente pagado: todo es reembolso', () => {
    // total 150, descuento 0, saldo 0 (todo pagado), linea 50
    const r = calcularRepartoDevolucion(D(150), D(0), D(0), D(50))
    expect(r.totalNuevo.toString()).toBe('100')
    expect(r.delta.toString()).toBe('50')
    expect(r.deudaReduccion.toString()).toBe('0')
    expect(r.reembolso.toString()).toBe('50')
    expect(r.nuevoSaldo.toString()).toBe('0')
  })

  it('item parcialmente pagado: parte deuda, parte reembolso', () => {
    // total 150, descuento 0, saldo 20 (pago 130), linea 50 -> deuda baja 20, reembolso 30
    const r = calcularRepartoDevolucion(D(150), D(0), D(20), D(50))
    expect(r.deudaReduccion.toString()).toBe('20')
    expect(r.reembolso.toString()).toBe('30')
    expect(r.nuevoSaldo.toString()).toBe('0')
    expect(r.totalNuevo.toString()).toBe('100')
  })

  it('conserva el descuento si no supera el nuevo bruto', () => {
    // bruto 150 (total 140 + descuento 10), saldo 140, linea 50
    // brutoNuevo 100, descuentoNuevo 10, totalNuevo 90, delta 50
    const r = calcularRepartoDevolucion(D(140), D(10), D(140), D(50))
    expect(r.descuentoNuevo.toString()).toBe('10')
    expect(r.totalNuevo.toString()).toBe('90')
    expect(r.delta.toString()).toBe('50')
  })

  it('recorta el descuento si supera el nuevo bruto', () => {
    // bruto 60 (total 40 + descuento 20), saldo 40, linea 50
    // brutoNuevo 10, descuentoNuevo min(20,10)=10, totalNuevo 0, delta 40
    const r = calcularRepartoDevolucion(D(40), D(20), D(40), D(50))
    expect(r.descuentoNuevo.toString()).toBe('10')
    expect(r.totalNuevo.toString()).toBe('0')
    expect(r.delta.toString()).toBe('40')
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd apps/api && npx jest devolucion.helper`
Expected: FAIL — `Cannot find module './devolucion.helper'`.

- [ ] **Step 3: Implementar el helper**

Crear `apps/api/src/modules/cobros/devolucion.helper.ts`:

```ts
import { Decimal } from '@prisma/client/runtime/library'

export interface RepartoDevolucion {
  totalNuevo: Decimal
  descuentoNuevo: Decimal
  delta: Decimal
  deudaReduccion: Decimal
  reembolso: Decimal
  nuevoSaldo: Decimal
}

// Recomputa el cobro al quitar una linea de subtotal `subtotalLinea`, conservando
// el descuento existente (recortado si supera el nuevo bruto, igual que setProductos).
// Reparte la baja del total entre la deuda viva (lo que aun se debia) y el
// reembolso (lo ya pagado). Invariante: deudaReduccion + reembolso == delta.
export function calcularRepartoDevolucion(
  total: Decimal,
  descuento: Decimal,
  saldoPendiente: Decimal,
  subtotalLinea: Decimal,
): RepartoDevolucion {
  const bruto = total.plus(descuento)
  const brutoNuevo = bruto.minus(subtotalLinea)
  const descuentoNuevo = descuento.gt(brutoNuevo) ? brutoNuevo : descuento
  const totalNuevo = brutoNuevo.minus(descuentoNuevo)
  const delta = total.minus(totalNuevo)
  const deudaReduccion = delta.gt(saldoPendiente) ? saldoPendiente : delta
  const reembolso = delta.gt(saldoPendiente) ? delta.minus(saldoPendiente) : new Decimal(0)
  const nuevoSaldo = saldoPendiente.gt(delta) ? saldoPendiente.minus(delta) : new Decimal(0)
  return { totalNuevo, descuentoNuevo, delta, deudaReduccion, reembolso, nuevoSaldo }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd apps/api && npx jest devolucion.helper`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/cobros/devolucion.helper.ts apps/api/src/modules/cobros/devolucion.helper.spec.ts
git commit -m "feat(devolucion): helper puro calcularRepartoDevolucion + tests"
```

---

### Task 3: Helper puro — `planificarReembolso`

**Files:**
- Modify: `apps/api/src/modules/cobros/devolucion.helper.ts`
- Test: `apps/api/src/modules/cobros/devolucion.helper.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  interface PagoVivo { id: number; monto: Decimal; tipoCuentaId: number; esEfectivo: boolean }
  interface MovimientoReembolso { tipoCuentaId: number; monto: Decimal; esEfectivo: boolean }
  function planificarReembolso(pagosDescPorFecha: PagoVivo[], reembolso: Decimal): MovimientoReembolso[]
  ```
  Lo consume `devolverDetalle` (Task 5). `monto` de cada movimiento es POSITIVO (cuánto devolver de esa forma); el caller crea el pago con `monto.negated()`.

- [ ] **Step 1: Agregar los tests que fallan**

Añadir al final de `devolucion.helper.spec.ts`:

```ts
import { planificarReembolso } from './devolucion.helper'

describe('planificarReembolso', () => {
  const efectivo = (id: number, monto: number) => ({ id, monto: D(monto), tipoCuentaId: 1, esEfectivo: true })
  const tarjeta = (id: number, monto: number) => ({ id, monto: D(monto), tipoCuentaId: 2, esEfectivo: false })

  it('un solo pago que cubre el reembolso', () => {
    const movs = planificarReembolso([efectivo(10, 100)], D(30))
    expect(movs).toHaveLength(1)
    expect(movs[0].tipoCuentaId).toBe(1)
    expect(movs[0].monto.toString()).toBe('30')
    expect(movs[0].esEfectivo).toBe(true)
  })

  it('toma del mas reciente primero y parte el del borde', () => {
    // lista YA ordenada desc por fecha: tarjeta (reciente), efectivo (viejo)
    const movs = planificarReembolso([tarjeta(20, 30), efectivo(10, 100)], D(40))
    expect(movs).toHaveLength(2)
    expect(movs[0]).toMatchObject({ tipoCuentaId: 2, esEfectivo: false })
    expect(movs[0].monto.toString()).toBe('30')
    expect(movs[1]).toMatchObject({ tipoCuentaId: 1, esEfectivo: true })
    expect(movs[1].monto.toString()).toBe('10')
  })

  it('reembolso 0 no genera movimientos', () => {
    expect(planificarReembolso([efectivo(10, 100)], D(0))).toHaveLength(0)
  })

  it('suma de movimientos == reembolso', () => {
    const movs = planificarReembolso([tarjeta(20, 25), efectivo(10, 100)], D(60))
    const suma = movs.reduce((acc, m) => acc.plus(m.monto), D(0))
    expect(suma.toString()).toBe('60')
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd apps/api && npx jest devolucion.helper`
Expected: FAIL — `planificarReembolso is not a function` / no exportada.

- [ ] **Step 3: Implementar el helper**

Añadir a `apps/api/src/modules/cobros/devolucion.helper.ts`:

```ts
export interface PagoVivo {
  id: number
  monto: Decimal
  tipoCuentaId: number
  esEfectivo: boolean
}

export interface MovimientoReembolso {
  tipoCuentaId: number
  monto: Decimal // positivo: cuanto se devuelve de esa forma de pago
  esEfectivo: boolean
}

// Reparte `reembolso` entre los pagos vivos del mas reciente al mas antiguo
// (la lista llega YA ordenada desc por fecha). Devuelve los movimientos a crear
// como pagos negativos, partiendo el pago del borde si hace falta. La suma de
// los montos devueltos == reembolso (si los pagos alcanzan, que es el caso real:
// reembolso = parte ya pagada del item <= total pagado del cobro).
export function planificarReembolso(
  pagosDescPorFecha: PagoVivo[],
  reembolso: Decimal,
): MovimientoReembolso[] {
  const movs: MovimientoReembolso[] = []
  let restante = reembolso
  for (const p of pagosDescPorFecha) {
    if (restante.lte(0)) break
    const take = p.monto.gt(restante) ? restante : p.monto
    movs.push({ tipoCuentaId: p.tipoCuentaId, monto: take, esEfectivo: p.esEfectivo })
    restante = restante.minus(take)
  }
  return movs
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd apps/api && npx jest devolucion.helper`
Expected: PASS (todos, incluidos los 4 nuevos).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/cobros/devolucion.helper.ts apps/api/src/modules/cobros/devolucion.helper.spec.ts
git commit -m "feat(devolucion): helper puro planificarReembolso + tests"
```

---

### Task 4: Service + endpoint — listado de detalle de ventas

**Files:**
- Modify: `apps/api/src/modules/cobros/cobros.service.ts` (nuevo método `listarDetalleVentas`)
- Modify: `apps/api/src/modules/cobros/cobros.controller.ts` (nuevo `GET /cobros/ventas-detalle`)

**Interfaces:**
- Consumes: nada de tasks previas.
- Produces: `listarDetalleVentas(consultorioId, opts)` → `{ items: VentaDetalleRow[]; total: number }`, donde cada fila tiene `detalleId, fecha, producto, cantidad, precioVenta, subtotal, paciente, cobroEstado, controlaStock, devueltoAt`. Lo consume el frontend (Task 8).

- [ ] **Step 1: Implementar `listarDetalleVentas` en `cobros.service.ts`**

Agregar el método dentro de `CobrosService` (p.ej. después de `getDeudoresResumen`). Usa `Prisma`, `EstadoCobro`, `EstadoCita` (ya importados en el archivo):

```ts
  // Detalle de ventas de productos (linea por linea) para el reporte de
  // devoluciones en Inventario. Solo lineas de PRODUCTO de cobros confirmados
  // (venta directa, o cita COBRADO/CON_DEUDA), excluyendo cobros ANULADO.
  async listarDetalleVentas(
    consultorioId: number,
    opts: { q?: string; desde?: string; hasta?: string; page?: number; limit?: number },
  ) {
    const page = opts.page && opts.page > 0 ? opts.page : 1
    const limit = opts.limit && opts.limit > 0 ? Math.min(opts.limit, 100) : 50

    const and: Prisma.DetalleCobroWhereInput[] = [
      {
        cobro: {
          estado: { not: EstadoCobro.ANULADO },
          OR: [
            { cita: { estado: { in: [EstadoCita.COBRADO, EstadoCita.CON_DEUDA] } } },
            { citaId: null },
          ],
        },
      },
    ]
    if (opts.q) {
      const q = opts.q
      and.push({
        OR: [
          { descripcion: { contains: q, mode: 'insensitive' } },
          { cobro: { paciente: { OR: [{ nombre: { contains: q, mode: 'insensitive' } }, { apellido: { contains: q, mode: 'insensitive' } }] } } },
          { cobro: { cita: { paciente: { OR: [{ nombre: { contains: q, mode: 'insensitive' } }, { apellido: { contains: q, mode: 'insensitive' } }] } } } },
        ],
      })
    }
    if (opts.desde) and.push({ createdAt: { gte: new Date(`${opts.desde}T00:00:00Z`) } })
    if (opts.hasta) and.push({ createdAt: { lte: new Date(`${opts.hasta}T23:59:59Z`) } })

    const where: Prisma.DetalleCobroWhereInput = {
      consultorioId,
      productoId: { not: null },
      AND: and,
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.detalleCobro.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          producto: { select: { controlaStock: true } },
          cobro: {
            select: {
              estado: true,
              createdAt: true,
              paciente: { select: { nombre: true, apellido: true } },
              cita: { select: { fechaHora: true, paciente: { select: { nombre: true, apellido: true } } } },
            },
          },
        },
      }),
      this.prisma.detalleCobro.count({ where }),
    ])

    const items = rows.map((d) => {
      const pac = d.cobro.cita?.paciente ?? d.cobro.paciente
      return {
        detalleId: d.id,
        fecha: d.cobro.cita?.fechaHora ?? d.cobro.createdAt,
        producto: d.descripcion,
        cantidad: d.cantidad,
        precioVenta: d.precioVenta,
        subtotal: d.subtotal,
        paciente: pac ? `${pac.nombre} ${pac.apellido}` : null,
        cobroEstado: d.cobro.estado,
        controlaStock: d.producto?.controlaStock ?? false,
        devueltoAt: d.devueltoAt,
      }
    })
    return { items, total }
  }
```

- [ ] **Step 2: Agregar el endpoint en `cobros.controller.ts`**

Primero agregar `Query` al import de `@nestjs/common` (línea 1): `import { Controller, Get, Post, Put, Body, Param, ParseIntPipe, Query } from '@nestjs/common'`.

Agregar el método **antes** de `@Get(':id')` (ruta literal antes de la paramétrica), p.ej. justo después de `getDeudoresResumen`:

```ts
  @Get('ventas-detalle')
  @Roles(Rol.ADMIN)
  @ApiOperation({ summary: 'Detalle de ventas de productos (linea por linea), para devoluciones' })
  listarVentasDetalle(
    @CurrentUser() user: JwtPayload,
    @Query('q') q?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listarDetalleVentas(user.consultorioId, {
      q: q || undefined,
      desde: desde || undefined,
      hasta: hasta || undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    })
  }
```

- [ ] **Step 3: Verificar tipos**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/cobros/cobros.service.ts apps/api/src/modules/cobros/cobros.controller.ts
git commit -m "feat(devolucion): GET /cobros/ventas-detalle (listado linea por linea, ADMIN)"
```

---

### Task 5: Service + endpoint — devolver una línea (`devolverDetalle`)

**Files:**
- Modify: `apps/api/src/modules/cobros/cobros.service.ts` (import de helpers + método `devolverDetalle`)
- Modify: `apps/api/src/modules/cobros/cobros.controller.ts` (nuevo `POST /cobros/detalle/:detalleId/devolver`)

**Interfaces:**
- Consumes: `calcularRepartoDevolucion`, `planificarReembolso` (Tasks 2-3).
- Produces: `devolverDetalle(consultorioId, detalleId, usuarioId)` → cobro fresco (mismo shape que `findByCita`/`findOne`). Lo consume el frontend (Task 9).

- [ ] **Step 1: Importar los helpers en `cobros.service.ts`**

Junto al import existente `import { descontarStockDeCobro } from './stock.helper'` agregar:

```ts
import { calcularRepartoDevolucion, planificarReembolso } from './devolucion.helper'
```

- [ ] **Step 2: Implementar `devolverDetalle`**

Agregar dentro de `CobrosService` (p.ej. después de `reversarPagosDeCita`):

```ts
  // Devolucion a nivel de linea (deshacer la venta de un item): restituye el
  // stock del producto (si controla inventario), recomputa el cobro conservando
  // el descuento, baja la deuda por la parte aun adeudada y reembolsa la parte
  // ya pagada en la misma forma cobrada (pagos negativos que descuentan la caja
  // de hoy). La linea no se borra: queda marcada con devueltoAt.
  async devolverDetalle(consultorioId: number, detalleId: number, usuarioId: number) {
    const detalle = await this.prisma.detalleCobro.findFirst({
      where: { id: detalleId, consultorioId, productoId: { not: null } },
      include: {
        producto: { select: { id: true, controlaStock: true } },
        cobro: {
          include: {
            cita: { select: { id: true, pacienteId: true, estado: true } },
            pagos: {
              where: { anuladoAt: null, monto: { gt: 0 } },
              orderBy: { createdAt: 'desc' },
              include: { tipoCuenta: { select: { esEfectivo: true } } },
            },
          },
        },
      },
    })
    if (!detalle) throw new NotFoundException('Linea de venta no encontrada')
    if (detalle.devueltoAt) throw new BadRequestException('Esta linea ya fue devuelta')

    const cobro = detalle.cobro
    if (cobro.estado === EstadoCobro.ANULADO) {
      throw new BadRequestException('El cobro esta anulado: no se puede devolver')
    }
    // Solo ventas confirmadas (stock ya descontado). Cita en ATENDIDA aun no
    // confirmo: los productos se editan desde el cobro (setProductos).
    if (cobro.citaId && cobro.cita?.estado === EstadoCita.ATENDIDA) {
      throw new BadRequestException('La venta aun no se confirmo: edita los productos desde el cobro')
    }

    const reparto = calcularRepartoDevolucion(
      cobro.total,
      cobro.descuento,
      cobro.saldoPendiente,
      detalle.subtotal,
    )

    // El reembolso (parte ya pagada) sale de la caja de hoy: exigir turno abierto.
    // Si solo baja deuda, no se toca caja y no se exige.
    if (reparto.reembolso.gt(0)) {
      await this.exigirCajaAbierta(consultorioId)
    }

    const movimientos = planificarReembolso(
      cobro.pagos.map((p) => ({
        id: p.id,
        monto: p.monto,
        tipoCuentaId: p.tipoCuentaId,
        esEfectivo: p.tipoCuenta.esEfectivo,
      })),
      reparto.reembolso,
    )

    const pagadoNuevo = reparto.totalNuevo.minus(reparto.nuevoSaldo)
    const nuevoEstadoCobro = reparto.nuevoSaldo.lte(0)
      ? EstadoCobro.COMPLETO
      : pagadoNuevo.gt(0)
        ? EstadoCobro.PARCIAL
        : EstadoCobro.PENDIENTE

    const { clave: hoy } = diaCajaLocal()
    const pacienteDeuda = cobro.cita?.pacienteId ?? cobro.pacienteId

    await this.prisma.$transaction(async (tx) => {
      // 1. Marcar la linea como devuelta (no se borra)
      await tx.detalleCobro.update({
        where: { id: detalleId },
        data: { devueltoAt: new Date(), devueltoPorId: usuarioId },
      })

      // 2. Restituir stock si el producto controla inventario
      if (detalle.producto?.controlaStock) {
        await tx.producto.update({
          where: { id: detalle.productoId! },
          data: { stockActual: { increment: detalle.cantidad } },
        })
      }

      // 3-4. Recomputar el cobro (total/descuento/saldo/estado)
      await tx.cobro.update({
        where: { id: cobro.id },
        data: {
          total: reparto.totalNuevo,
          descuento: reparto.descuentoNuevo,
          saldoPendiente: reparto.nuevoSaldo,
          estado: nuevoEstadoCobro,
        },
      })

      // 5. Bajar la deuda del paciente por la parte que aun se debia. Como
      // deudaReduccion <= saldoPendiente, solo baja lo que realmente estaba
      // colgado como deuda (saldo 0 => deudaReduccion 0 => no toca nada).
      if (pacienteDeuda && reparto.deudaReduccion.gt(0)) {
        await tx.paciente.update({
          where: { id: pacienteDeuda },
          data: { deudaTotal: { decrement: reparto.deudaReduccion } },
        })
      }

      // 6. Reembolso: un pago negativo por cada forma, que descuenta la caja de hoy
      for (const m of movimientos) {
        await tx.pago.create({
          data: {
            cobroId: cobro.id,
            tipoCuentaId: m.tipoCuentaId,
            monto: m.monto.negated(),
            referencia: 'Devolucion producto',
            createdById: usuarioId,
          },
        })
        await tx.cajaDiaria.upsert({
          where: { consultorioId_fecha: { consultorioId, fecha: hoy } },
          create: {
            consultorioId,
            fecha: hoy,
            usuarioAperturaId: usuarioId,
            ...(m.esEfectivo && { totalEfectivo: m.monto.negated() }),
            totalGeneral: m.monto.negated(),
          },
          update: {
            ...(m.esEfectivo && { totalEfectivo: { decrement: m.monto } }),
            totalGeneral: { decrement: m.monto },
          },
        })
      }

      // 7. Cita CON_DEUDA que queda saldada -> COBRADO
      if (cobro.cita && reparto.nuevoSaldo.lte(0) && cobro.cita.estado === EstadoCita.CON_DEUDA) {
        await tx.cita.update({
          where: { id: cobro.cita.id },
          data: { estado: EstadoCita.COBRADO },
        })
      }

      // 8. Log de auditoria con el desglose
      await tx.log.create({
        data: {
          consultorioId,
          usuarioId,
          entidad: 'Cobro',
          entidadId: cobro.id,
          accion: 'UPDATE',
          payloadDespues: {
            evento: 'devolucion-producto',
            detalleId,
            productoId: detalle.productoId,
            cantidad: detalle.cantidad,
            delta: reparto.delta.toString(),
            deudaReduccion: reparto.deudaReduccion.toString(),
            reembolso: reparto.reembolso.toString(),
            reembolsos: movimientos.map((m) => ({ tipoCuentaId: m.tipoCuentaId, monto: m.monto.toString() })),
          },
        },
      })
    })

    return cobro.citaId
      ? this.findByCita(consultorioId, cobro.citaId)
      : this.findOne(consultorioId, cobro.id)
  }
```

- [ ] **Step 3: Agregar el endpoint en `cobros.controller.ts`**

Agregar junto a los otros `@Post` (p.ej. después de `devolverPrepago`). `detalle` es un prefijo literal, no choca con `:id`:

```ts
  @Post('detalle/:detalleId/devolver')
  @Roles(Rol.ADMIN)
  @ApiOperation({ summary: 'Deshacer la venta de un item: devuelve stock y revierte la plata del item' })
  devolverDetalle(
    @CurrentUser() user: JwtPayload,
    @Param('detalleId', ParseIntPipe) detalleId: number,
  ) {
    return this.service.devolverDetalle(user.consultorioId, detalleId, user.sub)
  }
```

- [ ] **Step 4: Verificar tipos**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/cobros/cobros.service.ts apps/api/src/modules/cobros/cobros.controller.ts
git commit -m "feat(devolucion): POST /cobros/detalle/:id/devolver (stock + reversa de plata, ADMIN)"
```

---

### Task 6: Excluir líneas devueltas de los reportes agregados

**Files:**
- Modify: `apps/api/src/modules/reportes/reportes.service.ts` (reporte de citas, línea ~87; reporte de productos, where ~268)

**Interfaces:**
- Consumes: columna `DetalleCobro.devueltoAt` (Task 1).
- Produces: nada nuevo; corrige que una línea devuelta deje de contar como venta.

- [ ] **Step 1: Excluir devueltas del prorrateo del reporte de citas**

En `reportes.service.ts`, en el `select` del cobro del reporte de citas (la línea que hoy dice
`detalles: { where: { productoId: { not: null } }, select: { subtotal: true } },`), agregar `devueltoAt: null`:

```ts
            detalles: { where: { productoId: { not: null }, devueltoAt: null }, select: { subtotal: true } },
```

- [ ] **Step 2: Excluir devueltas del reporte de productos**

En el método `productos(...)`, en el `where` del `detalleCobro.findMany` (donde está `productoId: { not: null }` y `cobro: { estado: { not: 'ANULADO' }, ... }`), agregar `devueltoAt: null` al nivel superior del where:

```ts
      where: {
        consultorioId,
        productoId: { not: null },
        devueltoAt: null,
        cobro: {
          estado: { not: 'ANULADO' },
          // ...resto igual...
```

- [ ] **Step 3: Verificar tipos**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/reportes/reportes.service.ts
git commit -m "fix(reportes): excluir lineas devueltas de productos y prorrateo de citas"
```

---

### Task 7: Gate de integración — `gate-devolucion-productos.ps1`

**Files:**
- Create: `scripts/gate-devolucion-productos.ps1`

**Interfaces:**
- Consumes: endpoints de Tasks 4-5 (`GET /cobros/ventas-detalle`, `POST /cobros/detalle/:id/devolver`) y los existentes (`/cobros/venta-directa`, `/cobros/:id`, `/productos`, `/caja/abrir`).
- Produces: gate que el OWNER corre con la API en :3000 (el agente no puede bootear la API).

- [ ] **Step 1: Escribir el gate**

Crear `scripts/gate-devolucion-productos.ps1`:

```powershell
# Gate devolucion de productos: reporte detalle + deshacer venta de item
# (stock vuelve, reversa de plata, idempotencia, sin-stock, cita->COBRADO).
# API en :3000. PS 5.1: array de 1 elem -> JSON manual.
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmssff"
$email = "devol$ts@test.com"

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

# ---- Setup ----
Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" `
  -Body (@{ consultorioNombre = "DevolGate $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" `
  -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }

Invoke-RestMethod -Uri "$base/consultorio" -Method Put -Headers $h -ContentType "application/json" `
  -Body (@{ vendeProductos = $true } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" `
  -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }

$tiposCuenta = Invoke-RestMethod -Uri "$base/tipos-cuenta" -Headers $h
$tcEfectivo = ($tiposCuenta | Where-Object { $_.esEfectivo })[0].id

Invoke-RestMethod -Uri "$base/caja/abrir" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ montoInicial = 0 } | ConvertTo-Json) | Out-Null

# Productos: uno con control de stock, uno sin
$prod = Invoke-RestMethod -Uri "$base/productos" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Crema $ts"; precioVenta = 50; precioCosto = 20; stockActual = 10; controlaStock = $true; habilitadoVenta = $true } | ConvertTo-Json)
$prodSinStock = Invoke-RestMethod -Uri "$base/productos" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Servicio extra $ts"; precioVenta = 40; precioCosto = 0; controlaStock = $false; habilitadoVenta = $true } | ConvertTo-Json)
$pac = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Pac"; apellido = "Devol $ts" } | ConvertTo-Json)

# ====================================================================
# S1: Venta directa con deuda -> devolver linea -> stock vuelve, deuda baja
# ====================================================================
$body1 = "{ ""pacienteId"": $($pac.id), ""lineas"": [{ ""productoId"": $($prod.id), ""cantidad"": 3 }] }"
$vd1 = Invoke-RestMethod -Uri "$base/cobros/venta-directa" -Method Post -Headers $h -ContentType "application/json" -Body $body1
$detId1 = ($vd1.detalles | Where-Object { $_.productoId -eq $prod.id })[0].id

$ventas1 = Invoke-RestMethod -Uri "$base/cobros/ventas-detalle" -Headers $h
$enReporte = @($ventas1.items | Where-Object { $_.detalleId -eq $detId1 }).Count

$dev1 = Invoke-RestMethod -Uri "$base/cobros/detalle/$detId1/devolver" -Method Post -Headers $h
$prodPost1 = (Invoke-RestMethod -Uri "$base/productos" -Headers $h).items | Where-Object { $_.id -eq $prod.id }
$saldo1 = [double]$dev1.saldoPendiente

if ($enReporte -ge 1 -and $prodPost1.stockActual -eq 10 -and $saldo1 -eq 0) {
  Write-Output "S1 DEVOLVER DEUDA: OK (reporte=$enReporte stock=$($prodPost1.stockActual) saldo=$saldo1)"
} else {
  Write-Output "S1 DEVOLVER DEUDA: FALLO (reporte=$enReporte stock=$($prodPost1.stockActual) esperado 10; saldo=$saldo1 esperado 0)"
}

# ====================================================================
# S2: Idempotencia -> segundo devolver de la misma linea = 400
# ====================================================================
Esperar-Error { Invoke-RestMethod -Uri "$base/cobros/detalle/$detId1/devolver" -Method Post -Headers $h } 400 "S2 IDEMPOTENCIA"

# ====================================================================
# S3: Venta directa al contado (pagada) -> devolver -> reembolso (pago negativo)
#     + stock vuelve + invariante SUM(pagos)==total-saldo
# ====================================================================
$body3 = "{ ""lineas"": [{ ""productoId"": $($prod.id), ""cantidad"": 2 }], ""pagos"": [{ ""tipoCuentaId"": $tcEfectivo, ""monto"": 100 }] }"
$vd3 = Invoke-RestMethod -Uri "$base/cobros/venta-directa" -Method Post -Headers $h -ContentType "application/json" -Body $body3
$detId3 = ($vd3.detalles | Where-Object { $_.productoId -eq $prod.id })[0].id
$stockPre3 = ((Invoke-RestMethod -Uri "$base/productos" -Headers $h).items | Where-Object { $_.id -eq $prod.id }).stockActual

Invoke-RestMethod -Uri "$base/cobros/detalle/$detId3/devolver" -Method Post -Headers $h | Out-Null
$vd3post = Invoke-RestMethod -Uri "$base/cobros/$($vd3.id)" -Headers $h
$negativo = @($vd3post.pagos | Where-Object { [double]$_.monto -lt 0 }).Count
$sumaPagos = [double](($vd3post.pagos | Measure-Object -Property monto -Sum).Sum)
$invariante = [math]::Round($sumaPagos, 2) -eq [math]::Round([double]$vd3post.total - [double]$vd3post.saldoPendiente, 2)
$stockPost3 = ((Invoke-RestMethod -Uri "$base/productos" -Headers $h).items | Where-Object { $_.id -eq $prod.id }).stockActual

if ($negativo -ge 1 -and $invariante -and $stockPost3 -eq ($stockPre3 + 2)) {
  Write-Output "S3 DEVOLVER PAGADO (reembolso): OK (pagoNeg=$negativo invariante=$invariante stock $stockPre3->$stockPost3)"
} else {
  Write-Output "S3 DEVOLVER PAGADO (reembolso): FALLO (pagoNeg=$negativo invariante=$invariante stock $stockPre3->$stockPost3 esperado +2)"
}

# ====================================================================
# S4: Producto sin control de stock -> devolver no toca stock, revierte plata
# ====================================================================
$body4 = "{ ""lineas"": [{ ""productoId"": $($prodSinStock.id), ""cantidad"": 1 }], ""pagos"": [{ ""tipoCuentaId"": $tcEfectivo, ""monto"": 40 }] }"
$vd4 = Invoke-RestMethod -Uri "$base/cobros/venta-directa" -Method Post -Headers $h -ContentType "application/json" -Body $body4
$detId4 = ($vd4.detalles | Where-Object { $_.productoId -eq $prodSinStock.id })[0].id
$dev4 = Invoke-RestMethod -Uri "$base/cobros/detalle/$detId4/devolver" -Method Post -Headers $h
$prodSinStockPost = (Invoke-RestMethod -Uri "$base/productos" -Headers $h).items | Where-Object { $_.id -eq $prodSinStock.id }
$totalNuevo4 = [double]$dev4.total

if (($null -eq $prodSinStockPost.stockActual -or $prodSinStockPost.controlaStock -eq $false) -and $totalNuevo4 -eq 0) {
  Write-Output "S4 SIN CONTROL STOCK: OK (controlaStock=$($prodSinStockPost.controlaStock) totalNuevo=$totalNuevo4)"
} else {
  Write-Output "S4 SIN CONTROL STOCK: FALLO (controlaStock=$($prodSinStockPost.controlaStock) totalNuevo=$totalNuevo4 esperado 0)"
}

# ====================================================================
# S5: Cita confirmada CON_DEUDA -> devolver el producto la salda -> COBRADO
#     servicio 200 + 1 producto 50 = 250; pago 200 deja saldo 50 (CON_DEUDA);
#     devolver el producto (50) -> saldo 0 -> cita COBRADO
# ====================================================================
$svc = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Consulta $ts"; duracionMin = 30; precioBase = 200 } | ConvertTo-Json)
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Dr Devol $ts" } | ConvertTo-Json)
$manana = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")
$cita5 = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $svc.id; fechaHora = "${manana}T09:00:00Z" } | ConvertTo-Json)
foreach ($e in @("CONFIRMADA", "LLEGO", "EN_ATENCION", "ATENDIDA")) {
  Invoke-RestMethod -Uri "$base/citas/$($cita5.id)/estado" -Method Put -Headers $h -ContentType "application/json" `
    -Body (@{ estado = $e } | ConvertTo-Json) | Out-Null
}
$cobro5 = Invoke-RestMethod -Uri "$base/cobros/cita/$($cita5.id)" -Headers $h
$lineas5 = "{ ""lineas"": [{ ""productoId"": $($prod.id), ""cantidad"": 1 }] }"
Invoke-RestMethod -Uri "$base/cobros/$($cobro5.id)/lineas" -Method Put -Headers $h -ContentType "application/json" -Body $lineas5 | Out-Null
# pago parcial 200 -> CON_DEUDA (saldo 50)
Invoke-RestMethod -Uri "$base/cobros/$($cobro5.id)/pagos" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ monto = 200; tipoCuentaId = $tcEfectivo } | ConvertTo-Json) | Out-Null
$cobro5b = Invoke-RestMethod -Uri "$base/cobros/cita/$($cita5.id)" -Headers $h
$detId5 = ($cobro5b.detalles | Where-Object { $_.productoId -eq $prod.id })[0].id

Invoke-RestMethod -Uri "$base/cobros/detalle/$detId5/devolver" -Method Post -Headers $h | Out-Null
$cita5post = Invoke-RestMethod -Uri "$base/citas/$($cita5.id)" -Headers $h
$cobro5post = Invoke-RestMethod -Uri "$base/cobros/cita/$($cita5.id)" -Headers $h

if ($cita5post.estado -eq 'COBRADO' -and [double]$cobro5post.saldoPendiente -eq 0) {
  Write-Output "S5 CITA CON_DEUDA->COBRADO: OK (cita=$($cita5post.estado) saldo=$($cobro5post.saldoPendiente))"
} else {
  Write-Output "S5 CITA CON_DEUDA->COBRADO: FALLO (cita=$($cita5post.estado) esperado COBRADO; saldo=$($cobro5post.saldoPendiente) esperado 0)"
}

# ====================================================================
# S6: Rechazo en cita ATENDIDA (venta no confirmada) -> 400
# ====================================================================
Esperar-Error {
  $cita6 = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" `
    -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $svc.id; fechaHora = "${manana}T10:00:00Z" } | ConvertTo-Json)
  foreach ($e in @("CONFIRMADA", "LLEGO", "EN_ATENCION", "ATENDIDA")) {
    Invoke-RestMethod -Uri "$base/citas/$($cita6.id)/estado" -Method Put -Headers $h -ContentType "application/json" `
      -Body (@{ estado = $e } | ConvertTo-Json) | Out-Null
  }
  $cobro6 = Invoke-RestMethod -Uri "$base/cobros/cita/$($cita6.id)" -Headers $h
  $lineas6 = "{ ""lineas"": [{ ""productoId"": $($prod.id), ""cantidad"": 1 }] }"
  $cobro6b = Invoke-RestMethod -Uri "$base/cobros/$($cobro6.id)/lineas" -Method Put -Headers $h -ContentType "application/json" -Body $lineas6
  $detId6 = ($cobro6b.detalles | Where-Object { $_.productoId -eq $prod.id })[0].id
  Invoke-RestMethod -Uri "$base/cobros/detalle/$detId6/devolver" -Method Post -Headers $h
} 400 "S6 RECHAZO CITA ATENDIDA"

Write-Output "GATE devolucion-productos: FIN"
```

- [ ] **Step 2: Sanity de sintaxis (no corre la API)**

Run: `powershell -NoProfile -Command "[scriptblock]::Create((Get-Content -Raw scripts/gate-devolucion-productos.ps1)) | Out-Null; 'parse-ok'"`
Expected: imprime `parse-ok` (el script parsea sin errores de sintaxis).

- [ ] **Step 3: Commit**

```bash
git add scripts/gate-devolucion-productos.ps1
git commit -m "test(devolucion): gate de integracion gate-devolucion-productos.ps1"
```

> **El owner corre el gate** con la API en :3000: `pwsh scripts/gate-devolucion-productos.ps1`. Todas las líneas deben decir OK.

---

### Task 8: Frontend — pestaña "Ventas" + tabla de detalle

**Files:**
- Create: `apps/web/src/features/inventario/VentasDetalleTab.tsx`
- Modify: `apps/web/src/features/inventario/InventarioPage.tsx` (agregar tab "Ventas", solo ADMIN)

**Interfaces:**
- Consumes: `GET /cobros/ventas-detalle` (Task 4).
- Produces: tab con la tabla y el botón "Deshacer venta" por fila (el modal llega en Task 9).

- [ ] **Step 1: Pasar por los skills de UI (obligatorio antes del JSX)**

Invocar `impeccable` + `ui-ux-pro-max` + `frontend-design` para la tabla de detalle de ventas (lista densa, montos `tabular-nums`, badge "Devuelto", acción destructiva por fila, estados vacío/carga/error). Aplicar sus recomendaciones al JSX de los pasos siguientes.

- [ ] **Step 2: Crear `VentasDetalleTab.tsx`**

Sigue el patrón de `ProductosTab.tsx` (scroll infinito con `useInfiniteQuery`, `IntersectionObserver`, `EmptyState`/`ErrorState`/`TableSkeleton`, tokens de `lib/ui`, `formatMoneda`/`cn` de `lib/utils`). Reusa `formatFecha` de `lib/utils` para la fecha.

```tsx
import { useState, useEffect, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Search, RotateCcw, ShoppingCart } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatMoneda, formatFecha, cn } from '../../lib/utils'
import { inputUI } from '../../lib/ui'
import { EmptyState } from '../../components/shared/EmptyState'
import { ErrorState } from '../../components/shared/ErrorState'
import { TableSkeleton } from '../../components/shared/Skeleton'
import { DevolverItemModal, type VentaDetalleRow } from './DevolverItemModal'

const LIMIT = 50

export function VentasDetalleTab() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [aDevolver, setADevolver] = useState<VentaDetalleRow | null>(null)
  const sentinelRef = useRef<HTMLTableRowElement | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  function handleSearch(value: string) {
    setSearch(value)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setDebouncedSearch(value), 300)
  }

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery<{ items: VentaDetalleRow[]; total: number }>({
      queryKey: ['ventas-detalle', { search: debouncedSearch }],
      queryFn: ({ pageParam }) =>
        api
          .get(
            `/cobros/ventas-detalle?page=${pageParam}&limit=${LIMIT}${
              debouncedSearch ? `&q=${encodeURIComponent(debouncedSearch)}` : ''
            }`,
          )
          .then((r) => r.data),
      initialPageParam: 1,
      getNextPageParam: (lastPage, allPages) => {
        const cargados = allPages.reduce((n, p) => n + p.items.length, 0)
        return cargados < lastPage.total ? allPages.length + 1 : undefined
      },
    })

  const filas = data?.pages.flatMap((p) => p.items) ?? []
  const total = data?.pages[0]?.total ?? 0

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasNextPage) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) fetchNextPage()
      },
      { rootMargin: '200px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <div className="space-y-4">
      <div className="relative sm:max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" aria-hidden="true" />
        <input
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Buscar por producto o paciente..."
          aria-label="Buscar ventas"
          className={cn(inputUI, 'pl-9')}
        />
      </div>

      {isLoading ? (
        <TableSkeleton cols={6} />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : filas.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="No hay ventas de productos"
          description={debouncedSearch ? 'Probá con otro término.' : 'Las ventas confirmadas aparecerán acá.'}
          className="py-12"
        />
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Producto</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Paciente</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Cant.</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Subtotal</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Acción</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.detalleId} className="border-b last:border-0 hover:bg-muted/40 transition-colors duration-150">
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums text-muted-foreground">{formatFecha(f.fecha)}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{f.producto}</td>
                  <td className="px-4 py-3 text-muted-foreground">{f.paciente ?? 'Mostrador'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{f.cantidad}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoneda(Number(f.subtotal))}</td>
                  <td className="px-4 py-3 text-right">
                    {f.devueltoAt ? (
                      <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                        Devuelto
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setADevolver(f)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium text-foreground cursor-pointer hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150"
                      >
                        <RotateCcw className="h-4 w-4" aria-hidden="true" /> Deshacer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {hasNextPage && (
                <tr ref={sentinelRef}>
                  <td colSpan={6} className="px-4 py-4 text-center text-sm text-muted-foreground">
                    {isFetchingNextPage ? 'Cargando más...' : ''}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && !isError && total > 0 && (
        <p className="text-xs text-muted-foreground tabular-nums">
          {filas.length} de {total} {total === 1 ? 'venta' : 'ventas'}
        </p>
      )}

      {aDevolver && <DevolverItemModal venta={aDevolver} onClose={() => setADevolver(null)} />}
    </div>
  )
}
```

> Nota: `DevolverItemModal` y el tipo `VentaDetalleRow` se crean en la Task 9. Hasta entonces el `tsc` de web fallará por el import — por eso la Task 9 es contigua y el commit de esta task se hace junto con la 9 si se ejecutan en paralelo. Si se ejecuta esta task sola, comentar el import/uso del modal y descomentarlo en la Task 9.

- [ ] **Step 3: Agregar la tab "Ventas" en `InventarioPage.tsx`**

`InventarioPage` ya está protegida por `<AdminRoute>` en `App.tsx` (solo ADMIN llega),
así que la tab no necesita gateo por rol propio; se agrega al array estático. En
`InventarioPage.tsx`:
- Importar `VentasDetalleTab`: `import { VentasDetalleTab } from './VentasDetalleTab'`.
- Ampliar el tipo de tab:

```tsx
type TabId = 'productos' | 'ventas' | 'compras' | 'ajustes'
```

- Agregar la entrada "Ventas" a la constante `TABS` (queda como está, fuera del componente):

```tsx
const TABS: { id: TabId; label: string; disponible: boolean }[] = [
  { id: 'productos', label: 'Productos', disponible: true },
  { id: 'ventas', label: 'Ventas', disponible: true },
  { id: 'compras', label: 'Compras', disponible: false },
  { id: 'ajustes', label: 'Ajustes', disponible: false },
]
```

- En el render del contenido, agregar la rama:

```tsx
        {tab === 'productos' && <ProductosTab />}
        {tab === 'ventas' && <VentasDetalleTab />}
```

- [ ] **Step 4: Verificar tipos**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores (asumiendo que la Task 9 ya creó el modal; si no, ver nota del Step 2).

- [ ] **Step 5: Commit** (junto con Task 9 si se ejecutan en secuencia)

```bash
git add apps/web/src/features/inventario/VentasDetalleTab.tsx apps/web/src/features/inventario/InventarioPage.tsx
git commit -m "feat(devolucion): tab Ventas en Inventario con reporte de detalle (ADMIN)"
```

---

### Task 9: Frontend — modal de confirmación de devolución

**Files:**
- Create: `apps/web/src/features/inventario/DevolverItemModal.tsx`

**Interfaces:**
- Consumes: `POST /cobros/detalle/:detalleId/devolver` (Task 5). Recibe `venta: VentaDetalleRow` y `onClose`.
- Produces: tipo `VentaDetalleRow` (lo importa Task 8) y el modal.

- [ ] **Step 1: Pasar por los skills de UI (obligatorio antes del JSX)**

Invocar `impeccable` + `ui-ux-pro-max` + `frontend-design` para un modal de confirmación de acción destructiva (resumen claro del efecto antes de confirmar, botón primario de confirmación con estado de carga, manejo de error). Seguir la estructura de modal de `ProductoModal.tsx` (mismo folder) para el chrome del diálogo (overlay, foco, cierre con Escape, `aria-modal`).

- [ ] **Step 2: Crear `DevolverItemModal.tsx`**

Define el tipo `VentaDetalleRow`, hace la mutation e invalida las queries afectadas (reporte, productos/stock, deudores, caja). El chrome del modal (overlay + panel) sigue el de `ProductoModal.tsx`.

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { RotateCcw } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatMoneda, cn } from '../../lib/utils'
import { btnPrimaryUI } from '../../lib/ui'

export interface VentaDetalleRow {
  detalleId: number
  fecha: string
  producto: string
  cantidad: number
  precioVenta: string
  subtotal: string
  paciente: string | null
  cobroEstado: string
  controlaStock: boolean
  devueltoAt: string | null
}

export function DevolverItemModal({ venta, onClose }: { venta: VentaDetalleRow; onClose: () => void }) {
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => api.post(`/cobros/detalle/${venta.detalleId}/devolver`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ventas-detalle'] })
      qc.invalidateQueries({ queryKey: ['productos'] })
      qc.invalidateQueries({ queryKey: ['deudores'] })
      qc.invalidateQueries({ queryKey: ['caja'] })
      onClose()
    },
  })

  const subtotal = Number(venta.subtotal)

  return (
    // Chrome del modal segun ProductoModal.tsx (overlay fijo, panel centrado,
    // role="dialog" aria-modal, cierre con Escape/click fuera, trap de foco).
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300">
            <RotateCcw className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 className="text-lg font-semibold text-foreground">Deshacer venta</h2>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          Vas a deshacer la venta de{' '}
          <span className="font-medium text-foreground">
            {venta.cantidad}× {venta.producto}
          </span>{' '}
          ({formatMoneda(subtotal)}). Esto:
        </p>
        <ul className="mt-3 space-y-1.5 text-sm text-foreground">
          {venta.controlaStock && (
            <li className="flex items-start gap-2">
              <span aria-hidden="true">•</span>
              <span>Devuelve <span className="font-medium tabular-nums">{venta.cantidad}</span> al stock.</span>
            </li>
          )}
          <li className="flex items-start gap-2">
            <span aria-hidden="true">•</span>
            <span>Revierte {formatMoneda(subtotal)} de la venta (baja la deuda y/o reembolsa lo ya pagado en la misma forma cobrada).</span>
          </li>
        </ul>

        {mutation.isError && (
          <p className="mt-4 text-sm text-destructive">
            {(mutation.error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
              'No se pudo deshacer la venta. Revisá que la caja esté abierta e intentá de nuevo.'}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            className="inline-flex h-11 items-center rounded-lg border border-input px-4 text-sm font-medium text-foreground cursor-pointer hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 transition-colors duration-150 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className={cn(btnPrimaryUI, 'disabled:opacity-60')}
          >
            {mutation.isPending ? 'Deshaciendo...' : 'Deshacer venta'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verificar tipos**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores (ahora `VentasDetalleTab` resuelve el import del modal y el tipo).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/inventario/DevolverItemModal.tsx
git commit -m "feat(devolucion): modal de confirmacion de devolucion de item"
```

---

## Notas de cierre

- Ejecutar Tasks 8 y 9 juntas (o 9 antes que el `tsc` de 8): se referencian mutuamente.
- Tras todo: el owner corre `pwsh scripts/gate-devolucion-productos.ps1` (API en :3000) y `cd apps/api && npx jest`. El feature queda listo para deploy (sin deployar: avisar al owner).
- La migración `add_detalle_devolucion` es no destructiva; el owner la aplica en prod cuando deploye (`prisma migrate deploy` corre en el flujo de Railway).
