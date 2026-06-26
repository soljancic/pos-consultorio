# Mejoras a la grilla de ventas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La pestaña Ventas de Inventario muestra fecha y hora, descuento (prorrateado) y vendedor por línea, con un selector de rango de fechas que arranca en hoy.

**Architecture:** Se agrega `DetalleCobro.createdById` (migración no destructiva) seteado al crear líneas de producto; `listarDetalleVentas` devuelve `descuento` (prorrateado) y `vendedor` y usa `detalle.createdAt` como `fecha`; el frontend agrega rango de fechas (default hoy) y las columnas.

**Tech Stack:** NestJS + Prisma + PostgreSQL (api); React 19 + TanStack Query v5 + Tailwind (web).

## Global Constraints

- `consultorioId` SIEMPRE del JWT. Dinero con Decimal; `Number()` solo en UI/cálculo de prorrateo. Migración no destructiva (columna nullable + FK).
- Vendedor por línea: `DetalleCobro.createdById` seteado en `crearVentaDirecta` y `setProductos` (= `usuarioId`). Líneas viejas → `null` → UI "—". NO se toca la línea de servicio.
- `fecha` de la grilla = `detalle.createdAt` (momento de la venta); el filtro `desde/hasta` usa el mismo campo.
- Descuento prorrateado por línea: `descuento = cobroDescuento * (subtotal / bruto)`, `bruto = cobro.total + cobro.descuento` (misma fórmula que el reporte de productos, `reportes.service.ts:300-302`).
- Rango de fechas default = hoy (desde = hasta = hoy).
- UI: español con acentos; `tabular-nums` en montos/cantidades/fecha; touch ≥44px; pasar por skills `impeccable` + `ui-ux-pro-max` + `frontend-design` antes del JSX.
- Verificación: `cd apps/api && npx tsc --noEmit` y `cd apps/web && npx tsc --noEmit` limpios. No deployar. master. El front no tiene unit runner; el gate `.ps1` lo corre el owner.

---

### Task 1: Migración `createdById` en DetalleCobro + setearlo al vender

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `DetalleCobro` + model `Usuario`)
- Modify: `apps/api/src/modules/cobros/cobros.service.ts` (los `detalleCobro.create` de producto en `crearVentaDirecta` y `setProductos`)

**Interfaces:**
- Produces: columna `DetalleCobro.createdById: Int?` + relación `createdBy`. La usa Task 2.

- [ ] **Step 1: Campos en el schema**

En `apps/api/prisma/schema.prisma`, dentro de `model DetalleCobro` (junto a `devueltoAt`/`devueltoPorId`):

```prisma
  createdById   Int?
  createdBy     Usuario?  @relation("DetalleCreadoPor", fields: [createdById], references: [id])
```

En `model Usuario`, junto a las otras relaciones (p.ej. cerca de `detallesDevueltos`):

```prisma
  detallesCreados DetalleCobro[] @relation("DetalleCreadoPor")
```

- [ ] **Step 2: Migración**

Run: `cd apps/api && npx prisma migrate dev --name add_detalle_createdby`
Expected: crea la migración (ADD COLUMN nullable + FK a usuarios) y regenera el client, sin errores.

- [ ] **Step 3: Setear `createdById` en `crearVentaDirecta`**

En `cobros.service.ts`, en `crearVentaDirecta`, el `tx.detalleCobro.create` dentro del loop de líneas de producto. Agregar `createdById: usuarioId` a su `data`. El bloque pasa de:

```ts
        await tx.detalleCobro.create({
          data: {
            consultorioId, cobroId: cobro.id, productoId: p.id,
            descripcion: p.nombre, cantidad: l.cantidad,
            precioVenta: p.precioVenta, precioCosto: p.precioCosto,
            subtotal: p.precioVenta.mul(l.cantidad),
          },
        })
```
a (agregando la última línea del `data`):
```ts
        await tx.detalleCobro.create({
          data: {
            consultorioId, cobroId: cobro.id, productoId: p.id,
            descripcion: p.nombre, cantidad: l.cantidad,
            precioVenta: p.precioVenta, precioCosto: p.precioCosto,
            subtotal: p.precioVenta.mul(l.cantidad),
            createdById: usuarioId,
          },
        })
```

- [ ] **Step 4: Setear `createdById` en `setProductos`**

En `cobros.service.ts`, en `setProductos`, el `tx.detalleCobro.create` dentro del loop que inserta las nuevas líneas de producto. Agregar `createdById: usuarioId` a su `data` (el método ya recibe `usuarioId`). El bloque pasa de:

```ts
        await tx.detalleCobro.create({
          data: {
            consultorioId, cobroId,
            productoId: p.id,
            descripcion: p.nombre,
            cantidad: l.cantidad,
            precioVenta: p.precioVenta,
            precioCosto: p.precioCosto,
            subtotal,
          },
        })
```
a:
```ts
        await tx.detalleCobro.create({
          data: {
            consultorioId, cobroId,
            productoId: p.id,
            descripcion: p.nombre,
            cantidad: l.cantidad,
            precioVenta: p.precioVenta,
            precioCosto: p.precioCosto,
            subtotal,
            createdById: usuarioId,
          },
        })
```

(NO tocar el `create` de la línea de servicio ni el auto-heal del servicio.)

- [ ] **Step 5: Verificar tipos**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/modules/cobros/cobros.service.ts
git commit -m "feat(ventas): DetalleCobro.createdById (vendedor) seteado al vender producto"
```

(Trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. No push.)

---

### Task 2: `listarDetalleVentas` — descuento + vendedor + fecha de venta

**Files:**
- Modify: `apps/api/src/modules/cobros/cobros.service.ts` (`listarDetalleVentas`, ~líneas 1131-1205)
- Modify: `scripts/gate-devolucion-productos.ps1` (2 asserts en S1)

**Interfaces:**
- Consumes: `DetalleCobro.createdById`/`createdBy` (Task 1).
- Produces: cada fila de `listarDetalleVentas` gana `descuento: number` y `vendedor: string | null`; `fecha` ahora es `detalle.createdAt`. Lo consume Task 3.

- [ ] **Step 1: Ampliar el `include` y el `map`**

En `listarDetalleVentas`, en el `detalleCobro.findMany`, agregar `createdBy` al include y `total`/`descuento` al select del cobro:

```ts
        include: {
          producto: { select: { controlaStock: true } },
          createdBy: { select: { nombre: true } },
          cobro: {
            select: {
              estado: true,
              createdAt: true,
              total: true,
              descuento: true,
              paciente: { select: { nombre: true, apellido: true } },
              cita: { select: { fechaHora: true, paciente: { select: { nombre: true, apellido: true } } } },
            },
          },
        },
```

Reemplazar el `items = rows.map(...)` por (cambia `fecha`, agrega `descuento` y `vendedor`):

```ts
    const items = rows.map((d) => {
      const pac = d.cobro.cita?.paciente ?? d.cobro.paciente
      const cobroDescuento = Number(d.cobro.descuento)
      const bruto = Number(d.cobro.total) + cobroDescuento
      const descuento = cobroDescuento > 0 && bruto > 0
        ? cobroDescuento * (Number(d.subtotal) / bruto)
        : 0
      return {
        detalleId: d.id,
        fecha: d.createdAt,
        producto: d.descripcion,
        cantidad: d.cantidad,
        precioVenta: d.precioVenta,
        subtotal: d.subtotal,
        descuento,
        paciente: pac ? `${pac.nombre} ${pac.apellido}` : null,
        vendedor: d.createdBy?.nombre ?? null,
        cobroEstado: d.cobro.estado,
        controlaStock: d.producto?.controlaStock ?? false,
        devueltoAt: d.devueltoAt,
      }
    })
```

(El filtro `desde/hasta` sobre `createdAt` y la búsqueda quedan igual.)

- [ ] **Step 2: Verificar tipos**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Asserts en el gate existente**

En `scripts/gate-devolucion-productos.ps1`, en el escenario S1 (justo después de obtener `$ventas1 = Invoke-RestMethod ".../cobros/ventas-detalle"` y la fila `$detId1`), agregar una verificación de los campos nuevos sobre esa fila. Insertar:

```powershell
$fila1 = @($ventas1.items | Where-Object { $_.detalleId -eq $detId1 })[0]
if ($null -ne $fila1 -and $null -ne $fila1.vendedor -and $null -ne $fila1.descuento) {
  Write-Output "S1b CAMPOS GRILLA (vendedor/descuento): OK (vendedor=$($fila1.vendedor) descuento=$($fila1.descuento))"
} else {
  Write-Output "S1b CAMPOS GRILLA (vendedor/descuento): FALLO (vendedor=$($fila1.vendedor) descuento=$($fila1.descuento))"
}
```

(La venta directa de S1 fue creada por el admin del tenant, así que `vendedor` no debe ser nulo; `descuento` es 0 numérico cuando no hubo descuento — el assert chequea que el campo venga, no que sea > 0.)

- [ ] **Step 4: Parse-check del gate**

Run: `powershell -NoProfile -Command "[scriptblock]::Create((Get-Content -Raw scripts/gate-devolucion-productos.ps1)) | Out-Null; 'parse-ok'"`
Expected: imprime `parse-ok`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/cobros/cobros.service.ts scripts/gate-devolucion-productos.ps1
git commit -m "feat(ventas): listarDetalleVentas devuelve descuento prorrateado + vendedor; fecha=venta"
```

---

### Task 3: Frontend — rango de fechas + columnas (fecha y hora, descuento, vendedor)

**Files:**
- Modify: `apps/web/src/features/inventario/DevolverItemModal.tsx` (tipo `VentaDetalleRow`)
- Modify: `apps/web/src/features/inventario/VentasDetalleTab.tsx`

**Interfaces:**
- Consumes: los campos nuevos de `listarDetalleVentas` (Task 2).

- [ ] **Step 1: Pasar por los skills de UI (obligatorio antes del JSX)**

Invocar `impeccable` + `ui-ux-pro-max` + `frontend-design` para una grilla densa con rango de fechas y columnas nuevas (fecha y hora, vendedor, descuento). Aplicar su guía (alineación de montos, `tabular-nums`, responsive — ocultar columnas secundarias en celular si hace falta, touch targets de los date inputs).

- [ ] **Step 2: Ampliar el tipo `VentaDetalleRow`**

En `apps/web/src/features/inventario/DevolverItemModal.tsx`, en la interfaz `VentaDetalleRow`, agregar:

```ts
  descuento: number
  vendedor: string | null
```

- [ ] **Step 3: Rango de fechas (default hoy) en `VentasDetalleTab`**

En `VentasDetalleTab.tsx`:
- Importar `format` de `date-fns` y `formatHora` de `lib/utils` (ya importa `formatFecha`):
  `import { formatMoneda, formatFecha, formatHora, cn } from '../../lib/utils'`
  `import { format } from 'date-fns'`
- Agregar estado de rango inicializado a hoy:
```ts
  const hoy = format(new Date(), 'yyyy-MM-dd')
  const [desde, setDesde] = useState(hoy)
  const [hasta, setHasta] = useState(hoy)
```
- Incluir `desde`/`hasta` en la `queryKey` y en la URL del `queryFn`:
```ts
    queryKey: ['ventas-detalle', { search: debouncedSearch, desde, hasta }],
    queryFn: ({ pageParam }) =>
      api
        .get(
          `/cobros/ventas-detalle?page=${pageParam}&limit=${LIMIT}` +
            (debouncedSearch ? `&q=${encodeURIComponent(debouncedSearch)}` : '') +
            (desde ? `&desde=${desde}` : '') +
            (hasta ? `&hasta=${hasta}` : ''),
        )
        .then((r) => r.data),
```
- Agregar dos inputs de fecha en la barra de herramientas (junto al buscador). Reemplazar el bloque de búsqueda por una fila flex que tenga el buscador + los dos date inputs:
```tsx
      {/* Barra: búsqueda + rango de fechas (default hoy) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" aria-hidden="true" />
          <input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Buscar por producto o paciente..."
            aria-label="Buscar ventas"
            className={cn(inputUI, 'pl-9')}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={desde}
            max={hasta}
            onChange={(e) => setDesde(e.target.value)}
            aria-label="Desde"
            className={cn(inputUI, 'h-11 w-auto')}
          />
          <span className="text-muted-foreground text-sm" aria-hidden="true">–</span>
          <input
            type="date"
            value={hasta}
            min={desde}
            onChange={(e) => setHasta(e.target.value)}
            aria-label="Hasta"
            className={cn(inputUI, 'h-11 w-auto')}
          />
        </div>
      </div>
```

- [ ] **Step 4: Columnas Fecha y hora + Vendedor + Descuento**

En la `<thead>`, reemplazar el `<th>Fecha</th>` por "Fecha y hora" y agregar Vendedor (después de Paciente) y Descuento (después de Cant.):
```tsx
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Fecha y hora</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Producto</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Paciente</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Vendedor</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Cant.</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Descuento</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Subtotal</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Acción</th>
```

En la fila (`<tbody>`), cambiar la celda de fecha a fecha y hora, y agregar Vendedor + Descuento en el mismo orden:
```tsx
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums text-muted-foreground">
                      {formatFecha(f.fecha)} {formatHora(f.fecha)}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground max-w-[200px] truncate">
                      {f.producto}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[180px] truncate">
                      {f.paciente ?? 'Mostrador'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[140px] truncate">
                      {f.vendedor ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{f.cantidad}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {Number(f.descuento) > 0 ? `-${formatMoneda(Number(f.descuento))}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatMoneda(Number(f.subtotal))}
                    </td>
```

Actualizar el `colSpan` de la fila sentinela y del skeleton: el sentinel `<td colSpan={6}>` pasa a `colSpan={8}`; `<TableSkeleton cols={6} />` pasa a `cols={8}`.

- [ ] **Step 5: Verificar tipos**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/inventario/DevolverItemModal.tsx apps/web/src/features/inventario/VentasDetalleTab.tsx
git commit -m "feat(ventas): grilla con rango de fechas (hoy), fecha y hora, descuento y vendedor"
```

(Trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. No push.)

---

## Verificación final (owner)

- `cd apps/api && npx tsc --noEmit` y `cd apps/web && npx tsc --noEmit` limpios; `pwsh scripts/gate-devolucion-productos.ps1` (API :3000) — S1b OK.
- Manual: en Inventario → Ventas, por defecto se ven las ventas de hoy; la columna muestra fecha y hora; hay columna Descuento y Vendedor; ampliar el rango muestra ventas de otros días. La migración `add_detalle_createdby` corre en prod al deployar (líneas viejas → "—").

## Fuera de alcance

- Vendedor en la línea de servicio; backfill de `createdById` de líneas viejas; export del reporte.
- Precisión de zona horaria del filtro: el rango usa límites UTC (`T00:00:00Z`/`T23:59:59Z`, convención del endpoint y del proyecto). En Bolivia (UTC-4) una venta nocturna puede caer en el día UTC siguiente; si al owner le molesta, se migra a límites de día local (como `diaCajaLocal`) en un cambio aparte.
