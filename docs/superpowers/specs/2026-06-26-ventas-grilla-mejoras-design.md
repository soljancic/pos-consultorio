# Diseño: mejoras a la grilla de ventas (Inventario → Ventas)

Fecha: 2026-06-26
Estado: aprobado (pendiente plan de implementación)

## Problema

La pestaña "Ventas" de Inventario (`VentasDetalleTab`, reporte línea por línea de
productos vendidos, base de la devolución) hoy muestra: fecha (solo día), producto,
paciente, cantidad, subtotal, acción. El owner quiere:
- Selector de rango de fechas, con **hoy** por defecto.
- La columna fecha que muestre **fecha y hora**.
- Una columna **descuento**.
- Una columna del **usuario que hizo la venta** (vendedor).

## Estado actual (verificado)

- `listarDetalleVentas(consultorioId, opts)` (`cobros.service.ts`) devuelve por fila:
  `detalleId, fecha (= cita.fechaHora ?? cobro.createdAt), producto, cantidad,
  precioVenta, subtotal, paciente, cobroEstado, controlaStock, devueltoAt`. Filtra
  `productoId != null`, cobros confirmados (venta directa o cita COBRADO/CON_DEUDA, no
  ANULADO), y `desde/hasta` sobre **`detalle.createdAt`**. Paginado `{items,total}`.
- `DetalleCobro` (schema): NO tiene `createdById`. Las líneas de producto se crean en
  `crearVentaDirecta` (`cobros.service.ts`) y `setProductos` (`cobros.service.ts`),
  ambos con `usuarioId` en mano. La línea de servicio se crea en `create()`/`editarCita`
  (citas) — fuera de alcance acá.
- Prorrateo de descuento (patrón del reporte de productos, `reportes.service.ts:300-302`):
  `descuento = cobroDescuento * (subtotal / bruto)`, con `bruto = cobro.total +
  cobro.descuento`.
- `VentasDetalleTab` (`features/inventario/`): tabla con `useInfiniteQuery`
  (`queryKey ['ventas-detalle', { search }]`), búsqueda con debounce, scroll infinito.
  Usa `formatMoneda`/`cn`; hay `formatFecha`/`formatHora` en `lib/utils`.
- El módulo de reportes tiene inputs de fecha (`ReportFilters`) como patrón de UI.

## Enfoque elegido

Guardar el vendedor **por línea de producto** (`DetalleCobro.createdById`, migración no
destructiva) seteado al crearlas; ampliar `listarDetalleVentas` con `descuento`
(prorrateado) y `vendedor`, y usar `detalle.createdAt` como `fecha` (alinea
display y filtro). Frontend: rango de fechas (default hoy) + columnas fecha-y-hora,
descuento y vendedor.

Descartado: derivar el vendedor del creador de la cita/cobro (impreciso: quien agrega
productos puede no ser quien creó la cita). Decisión del owner: vendedor por línea.

## Decisiones tomadas (con el owner)

- Vendedor **por línea** (`createdById` en `DetalleCobro`), seteado en `crearVentaDirecta`
  y `setProductos`. Líneas viejas → `null` → UI muestra "—".
- `fecha` de la grilla = `detalle.createdAt` (momento de la venta), no `cita.fechaHora`.
  Display "fecha y hora"; el filtro de rango usa el mismo campo.
- Rango de fechas con **hoy** por defecto (desde = hasta = hoy).
- Descuento prorrateado por línea (misma fórmula que el reporte de productos).
- Fuera de alcance: vendedor en la línea de servicio; backfill de líneas viejas.

## Diseño

### Modelo de datos

Migración no destructiva `add_detalle_createdby`:

```prisma
model DetalleCobro {
  // ...campos actuales (incluye devueltoAt/devueltoPorId)...
  createdById Int?
  createdBy   Usuario? @relation("DetalleCreadoPor", fields: [createdById], references: [id])
}
```

Relación inversa en `model Usuario`: `detallesCreados DetalleCobro[] @relation("DetalleCreadoPor")`.

Setear `createdById: usuarioId` en los `detalleCobro.create(...)` de **líneas de
producto**:
- `crearVentaDirecta` (el `create` dentro del loop de líneas).
- `setProductos` (el `create` dentro del loop de líneas).

(El `create` de la línea de servicio en citas NO se toca; la grilla solo lista
productos.)

### Backend — `listarDetalleVentas`

- En el `findMany`, ampliar el `include`/`select`:
  - `cobro`: agregar `total` y `descuento` (para prorratear).
  - `createdBy: { select: { nombre: true } }` en el detalle.
- Por fila:
  - `fecha: d.createdAt` (en vez de `cita.fechaHora ?? cobro.createdAt`).
  - `descuento`: `bruto = Number(cobro.total) + Number(cobro.descuento)`;
    `descuento = (Number(cobro.descuento) > 0 && bruto > 0) ? Number(cobro.descuento) *
    (Number(subtotal) / bruto) : 0`. Se devuelve como número (la UI formatea).
  - `vendedor: d.createdBy?.nombre ?? null`.
- El filtro `desde/hasta` sigue sobre `detalle.createdAt` (sin cambio). Mantener el
  resto (búsqueda, paginación, confirmados, `devueltoAt` ya se expone).

### Frontend — `VentasDetalleTab`

- Estado de rango: `desde`/`hasta` inicializados a **hoy** (`format(new Date(),
  'yyyy-MM-dd')`). Dos inputs de fecha (patrón de `ReportFilters`/inputs del design
  system), sobre la barra de la tabla. La `queryKey` incluye `{ search, desde, hasta }`
  y la URL manda `&desde=&hasta=`.
- Columnas: **Fecha y hora** (`formatFecha(f.fecha)` + `formatHora(f.fecha)`),
  Producto, Paciente, **Vendedor** (`f.vendedor ?? '—'`), Cantidad, **Descuento**
  (`formatMoneda(Number(f.descuento))`, `tabular-nums`), Subtotal, Acción.
- El tipo `VentaDetalleRow` (en `DevolverItemModal.tsx`) gana `descuento: string |
  number` y `vendedor: string | null`. (Decimal serializa como string; la UI usa
  `Number()`.)
- Pasar por los skills `impeccable` + `ui-ux-pro-max` + `frontend-design` antes del
  JSX. Touch targets, focus-visible, `tabular-nums` en montos/cantidades/fecha,
  responsive (ocultar columnas secundarias en celular si hace falta).

## Testing

- Extender `scripts/gate-devolucion-productos.ps1` (o un assert nuevo): tras una venta
  directa, `GET /cobros/ventas-detalle` devuelve la línea con `vendedor` no nulo y
  `descuento` numérico (0 si la venta no tuvo descuento).
- `cd apps/api && npx tsc --noEmit` y `cd apps/web && npx tsc --noEmit` limpios.

## Fuera de alcance

- Vendedor en la línea de servicio.
- Backfill de `createdById` en líneas viejas (quedan `null` → "—").
- Export del reporte (no pedido).
