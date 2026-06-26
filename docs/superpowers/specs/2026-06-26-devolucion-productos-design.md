# Diseño: Devolución de productos vendidos (deshacer venta de un ítem)

Fecha: 2026-06-26
Estado: aprobado (pendiente plan de implementación)

## Problema

Hoy, al anular un pago (`anularPago`), se restaura la deuda de la cita pero no
se devuelve el stock de los productos vendidos. El owner necesita poder revertir
la venta de un producto puntual cuando el cliente lo devuelve: que vuelva al
inventario y se deshaga la parte de plata correspondiente a ese ítem.

Se decidió **no** mezclar esto con `anularPago` (que es una corrección de plata:
el cliente igual se llevó los productos, solo vuelve a deberlos). En cambio se
crea una acción separada de **devolución a nivel de línea**, lanzada desde un
reporte de ventas en Inventario.

## Estado actual (verificado)

- Stock se descuenta **una sola vez** por cobro, al confirmar la venta: cita
  sale de `ATENDIDA` → `COBRADO`/`CON_DEUDA` (`citas.service.ts:474-481`) o al
  crear una venta directa (`cobros.service.ts:341`). Helper `descontarStockDeCobro`.
- Stock se restituye **una sola vez** al reabrir una cita cancelada
  (`citas.service.ts:511`, `restituirStockDeCobro` — restituye TODAS las líneas
  del cobro). No existe restitución a nivel de una sola línea.
- `anularPago` (`cobros.service.ts:559`): reversa con doble entrada (pago espejo
  negativo + `reversaDeId`), restaura deuda y saca plata de la caja de hoy.
  Revierte cita `COBRADO → CON_DEUDA`. **No toca stock.**
- `setProductos` (`cobros.service.ts:127`): edita líneas de producto y recomputa
  total/saldo/deuda **solo** mientras la cita está `ATENDIDA` (pre-confirmación,
  sin impacto de stock). No sirve post-confirmación.
- `DetalleCobro` (schema): XOR servicio/producto, snapshot de precio y nombre.
  **No tiene marca de devuelto.**
- `Cobro`: `total`, `saldoPendiente`, `descuento` (Modelo A: `total = SUM(detalles)
  - descuento`). `pagado = total - saldoPendiente`.
- `Pago`: patrón reversa (`reversaDeId @unique`, 1:1, `anuladoAt`). Las reversas
  tienen `monto` negativo. La caja diaria suma `totalGeneral` y, si la cuenta es
  `esEfectivo`, `totalEfectivo`.
- Reporte de productos agregado ya existe en Reportes (`reportes.service.ts`,
  `features/reportes/reports/productos.report.tsx`). Este reporte de **detalle**
  es distinto (línea por línea, con acción de deshacer) y vive en Inventario.
- `InventarioPage.tsx`: tabs Productos (activa) / Compras (pronto) / Ajustes
  (pronto). Guard de UX `vendeProductos`; seguridad real en `@Roles(ADMIN)`.

## Enfoque elegido

Acción de **devolución a nivel de línea** (`DetalleCobro` de producto), separada
de `anularPago`, lanzada desde un nuevo reporte de detalle de ventas en
Inventario. Reversa la plata de ese ítem **en la misma forma cobrada** y devuelve
el stock.

Descartado:
- Restituir stock dentro de `anularPago` → estado contradictorio (deuda dice "se
  los llevó" + stock dice "están en estantería") y doble restitución con pagos
  parciales.
- Devolución "todo o nada" del cobro entero → no cubre devoluciones parciales.

## Decisiones tomadas (con el owner)

- Granularidad: por **línea de `DetalleCobro`** (un producto y su cantidad). El
  servicio de la cita nunca se devuelve.
- Reembolso de la parte ya pagada: **misma forma cobrada** (efectivo vuelve como
  efectivo, tarjeta como tarjeta), reversando los pagos vivos del cobro del más
  reciente al más antiguo.
- Acción **solo ADMIN**, desde una pestaña nueva **"Ventas"** en Inventario.
- Solo aplica a ventas **confirmadas** (venta directa, o cita en
  `COBRADO`/`CON_DEUDA`). Líneas en cita `ATENDIDA` se editan desde el cobro
  (editor de productos existente); cobros `ANULADO` no aplican.
- Simplificación aceptada: si hubo **descuento global**, queda aplicado a las
  líneas que restan (igual que `setProductos`). Sin descuento no afecta.
  Prorratear el descuento queda fuera de alcance (se puede agregar después).

## Diseño

### Modelo de datos

Migración **no destructiva** (solo agrega columnas nullable) `add_detalle_devolucion`:

```prisma
model DetalleCobro {
  // ...campos actuales...
  devueltoAt    DateTime?
  devueltoPorId Int?
  devueltoPor   Usuario?  @relation("DetalleDevueltoPor", fields: [devueltoPorId], references: [id])
}
```

`devueltoAt != null` ⇒ la línea ya fue devuelta (idempotencia: no se puede
deshacer dos veces). No se borra la línea (regla de soft delete).

### Backend — `cobros.service.ts`

**`listarDetalleVentas(consultorioId, filtros)`** — listado para el reporte.
Devuelve líneas de `DetalleCobro` con `productoId != null` de cobros confirmados
(venta directa, o cita `COBRADO`/`CON_DEUDA`), excluyendo cobros `ANULADO`. Por
fila: `detalleId`, fecha (cita.fechaHora o cobro.createdAt), producto, cantidad,
precioVenta, subtotal, paciente (nombre o "Mostrador"), estado del cobro,
`controlaStock`, `devueltoAt`. Filtros: rango de fechas + búsqueda
(producto/paciente). Paginado (puede haber muchas líneas). Solo ADMIN.

**`devolverDetalle(consultorioId, detalleId, usuarioId)`** — la reversión. Sean
`Sp` = `saldoPendiente` del cobro, `T` = `total`, `pagado = T − Sp`.

Validaciones (fuera o al inicio de la transacción):
- La línea existe, es de producto (`productoId != null`), del consultorio, y
  **no** está ya devuelta.
- El cobro no está `ANULADO`. Si es de cita, la cita está en `COBRADO`/`CON_DEUDA`
  (confirmada). Si la cita está `ATENDIDA` → error claro ("editá los productos
  desde el cobro").

Transacción:
1. Marcar `devueltoAt = now()`, `devueltoPorId = usuarioId` en la línea.
2. Si `producto.controlaStock`: `stockActual += cantidad`.
3. Recomputar el cobro igual que `setProductos`: `bruto' = SUM(detalles vivos,
   excluyendo las líneas con `devueltoAt != null`)`, `descuento' = min(descuento,
   bruto')`, `total' = bruto' − descuento'`.
4. **Δ = T − total'** = la baja real de lo que el cliente debe/pagó por ese ítem
   (igual al `subtotal` cuando no hay descuento; menor si el descuento se recorta).
   Reparto:
   - `deudaReduccion = min(Δ, Sp)` (parte que aún se debía).
   - `reembolso = max(0, Δ − Sp)` (parte ya pagada).
   - `nuevoSaldo = max(0, Sp − Δ)`.
   Si va a haber reembolso (`reembolso > 0`) → exigir **caja abierta**
   (`exigirCajaAbierta`). Si solo baja deuda, no se exige caja. Estado del cobro:
   `COMPLETO` si `nuevoSaldo ≤ 0`, `PARCIAL` si hubo pagos, si no `PENDIENTE`.
   `update` cobro con `total'`, `descuento'`, `nuevoSaldo`, estado.
5. Deuda del paciente: si el cobro cuenta como deuda real (cita `ATENDIDA`/
   `CON_DEUDA`, o venta directa con paciente) y `deudaReduccion > 0`,
   `deudaTotal -= deudaReduccion`.
6. Reembolso (si `reembolso > 0`): recorrer los pagos vivos (`anuladoAt == null`,
   `monto > 0`) del cobro de más reciente a más antiguo, tomando
   `take = min(restante, pago.monto)` de cada uno hasta cubrir `reembolso`. Por
   cada `take` crear un `Pago` de **devolución** con `monto = −take` y el
   `tipoCuentaId` del pago original, `referencia` "Devolución producto", y bajar
   la caja de hoy (`totalGeneral -= take`; `totalEfectivo -= take` si la cuenta
   es `esEfectivo`). Estos pagos negativos **no** usan `reversaDeId` (el original
   puede quedar vivo parcialmente); el `monto` negativo ya bloquea anularlos.
   *Invariante preservada:* `SUM(pagos) == total − saldoPendiente`.
7. Cita: si es de cita y `nuevoSaldo ≤ 0` y la cita estaba `CON_DEUDA` → cita a
   `COBRADO`.
8. `log` con `entidad: 'Cobro'`, `accion: 'UPDATE'`, payload con el desglose
   (`detalleId`, productoId, cantidad, Δ, deudaReduccion, reembolso, formas).

Endpoint en `cobros.controller.ts`: `GET /cobros/ventas-detalle` (listado) y
`POST /cobros/detalle/:detalleId/devolver` (acción). Ambos `@Roles(Rol.ADMIN)`,
`consultorioId` del JWT (`@CurrentUser()`), nunca del body/params.

### Frontend — `features/inventario/`

- Nueva tab **"Ventas"** en `InventarioPage.tsx` (activa, solo si ADMIN; la
  seguridad real es el backend). Tab de Productos no cambia.
- Componente `VentasDetalleTab.tsx`: tabla (reusa patrones del design system /
  `DataTable`), filtros de fecha + búsqueda, scroll/paginación. Columnas: fecha,
  producto, cantidad, precio, subtotal, paciente, estado, acción. Filas con
  `devueltoAt` muestran badge "Devuelto" y acción deshabilitada. `tabular-nums`
  en montos/cantidades.
- `DevolverItemModal.tsx`: modal de confirmación del design system (nada de
  `window.confirm`). Antes de confirmar muestra el efecto: "Devuelve N al stock ·
  baja Bs X de deuda · reembolsa Bs Z (efectivo/tarjeta)". `useMutation`
  (TanStack Query v5), invalida las queries del reporte + stock + deudores/caja.
- Pasar por los skills `impeccable` + `ui-ux-pro-max` + `frontend-design` antes
  de escribir el JSX (regla UI del proyecto). Touch targets ≥44px, focus-visible,
  color + forma, transiciones 150-300ms.

### Casos borde

- Producto con `controlaStock = false`: no toca stock, igual revierte la plata.
- Reembolso que cae en medio de un pago: se toma parcial de ese pago (varios
  pagos negativos si hace falta para cubrir varias formas).
- Venta directa al contado sin paciente: no hay deuda; todo Δ es reembolso.
- Cobro ya `COMPLETO` (todo pagado): `Sp = 0`, todo Δ es reembolso, cita queda
  `COBRADO`.
- Re-deshacer la misma línea: bloqueado por `devueltoAt`.

## Testing

- Unit/gate de API (`scripts/gate-devolucion-productos.ps1`, crea su tenant):
  - Devolución de ítem no pagado (solo baja deuda + stock).
  - Devolución de ítem pagado en efectivo (reembolso efectivo + stock + caja).
  - Devolución parcial respecto a forma de pago (efectivo + tarjeta, FIFO).
  - Idempotencia (segundo deshacer falla).
  - Producto sin control de stock (stock intacto, plata revertida).
  - Invariante `SUM(pagos) == total − saldoPendiente` tras la devolución.
  - Cita `CON_DEUDA` → `COBRADO` cuando queda saldada.
  - Rechazo en cita `ATENDIDA` y cobro `ANULADO`.
- `npx tsc --noEmit` en api y web antes de commitear.

## Fuera de alcance

- Prorrateo del descuento global entre líneas devueltas.
- Deshacer la devolución (re-vender el ítem si fue error).
- Reembolso por pasarela de pago online.
- Tabs Compras/Ajustes de Inventario (P2/P3).
