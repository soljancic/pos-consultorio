# Productos e Inventario

Fecha: 2026-06-24
Estado: aprobado (diseno), pendiente plan de implementacion
Alcance de este spec: **modulo completo en 3 fases; este documento detalla P1 y
resume P2/P3.** El plan de implementacion arranca por P1.

Modulos nuevos/tocados (P1):
- `apps/api/src/modules/productos` (nuevo)
- `apps/api/src/modules/cobros`, `citas`, `consultorios`, `auth` (integracion)
- `apps/web/src/features/inventario` (nuevo: seccion propia con tab Productos en
  P1; Compras en P2; Ajustes en P3), `agenda` (modal de cobro), `configuracion`
- `packages/types` (tipos compartidos del flag y de las lineas de cobro)

## Problema / objetivo

Hoy el sistema gestiona agenda y servicios. El `Cobro` esta atado **1:1 a una
`Cita`** (`citaId` unico y obligatorio), tiene un unico `total`/`saldoPendiente`
y **no tiene lineas de detalle**. No hay catalogo de productos, ni stock, ni
forma de vender un articulo fisico.

Objetivo: agregar venta de productos fisicos con tablas separadas de Servicios
(escalabilidad), integrada al cobro de la agenda como **venta mixta** (servicio +
productos), permitiendo tambien **venta directa sin servicio** (mostrador). La
mayoria de los consultorios no vende nada: el modulo queda detras de un flag y,
apagado, es invisible (mismo patron que Aseguradoras).

## Decisiones (cerradas con el owner)

1. **Fases:** 3. **P1** = catalogo de productos + flag de consultorio + venta
   mixta en el cobro (lineas de detalle, venta directa sin cita, descuento de
   stock al confirmar). **P2** = compras (ingreso de stock) + kardex. **P3** =
   ajuste de inventario (conteo) + reportes de utilidad. P1 ya deja vender.
2. **Desacople Cobro-Cita:** `Cobro.citaId` pasa a **nullable** (sigue `@unique`:
   Postgres permite varios NULL -> varias ventas directas, y mantiene 1 cobro por
   cita). Nueva tabla **`DetalleCobro`**: cada linea referencia un `servicioId`
   **o** un `productoId` (XOR). El total del cobro pasa a ser `SUM(detalles)`.
3. **Deuda:** se **reusa** lo existente. El saldo impago del cobro (servicios +
   productos) sigue en `Cobro.saldoPendiente` y rola a `Paciente.deudaTotal`. NO
   se crea tabla `deudas` (evita doble fuente de verdad).
4. **Disparo de stock:** se descuenta al **confirmar la venta**, aunque quede
   deuda (la cita sale de ATENDIDA -> COBRADO o CON_DEUDA; venta directa: al crear
   el cobro). El producto se entrega aunque quede saldo; ese saldo va a la deuda.
   Resuelve la contradiccion del pedido ("descuenta al Cobrado" vs "si no paga, va
   a deuda"): "Cobrado" = venta confirmada, no necesariamente pagada.
5. **Stock negativo:** permitido. Si `controlaStock` y `cantidad > stockActual`,
   se **alerta pero no se bloquea** (regla del proyecto: las cosas alertan, no
   bloquean).
6. **Venta directa:** `Cobro` gana `pacienteId` **nullable**. Paciente opcional
   (consumidor final al contado); **obligatorio si queda saldo** (para colgar la
   deuda). Se inicia desde un boton "Venta directa" que **reusa el modal de
   cobro** sin cita (no hay pantalla POS aparte en P1).
7. **Servicio = linea.** Al generar el cobro de una cita se crea automaticamente
   una `DetalleCobro` de servicio. Migracion de **backfill** crea una linea de
   servicio para cada cobro existente, preservando el total.
8. **Aseguradoras intactas.** Los productos son siempre particulares; la parte de
   la aseguradora (`montoAseguradora` / `LiquidacionItem`) no se toca.
9. **Kardex en P2.** En P1 el registro de la venta es la propia `DetalleCobro`
   (que cobro desconto que producto y cuanto). El ledger unificado
   `MovimientoStock` nace en P2 con las compras.
10. **`categoria`** es texto libre en P1 (puede graduar a tabla lookup como
    `tipos_gasto` luego). **`stockActual`** es entero (unidades).
11. **Seccion propia "Inventario"** en el nav (no es un tab de Catalogo): la
    seccion agrupa **Productos** (catalogo, P1), **Compras** (P2) y **Ajustes**
    de inventario (P3) como sub-tabs/sub-rutas. En P1 nace con el tab Productos;
    los otros dos tabs se suman en su fase. Toda la seccion va gateada por
    `vendeProductos` y es ADMIN (la venta sigue en el modal de cobro de la
    Agenda, que es SECRETARIA/CAJA). Nombre tentativo "Inventario"; el owner
    puede renombrarlo.

## Reglas del proyecto que aplican (PLAN.md 8b)

- `consultorioId` SIEMPRE del JWT (`@CurrentUser()`), nunca del body/params.
  **Todas** las queries de productos, cobros y detalle filtran por
  `consultorioId` (incluida `DetalleCobro`, que lleva su propia columna).
- Todo DTO con decoradores class-validator (whitelist global => 400 si falta).
- Dinero en `Decimal` de Prisma; `Number()` solo para UI. `stockActual` y
  `cantidad` son `Int`.
- Borrado soft (`activo:false` / `deletedAt`). El catalogo de productos: si el
  producto esta usado en algun cobro, no se borra -> se archiva (patron de
  tipos-gasto). Gotcha conocido: el booleano se llama **`activo`** (no `activa`)
  para alinear backend/frontend y no repetir el bug de aseguradoras.
- Operaciones multi-tabla en `prisma.$transaction` (cobro + detalle + stock + log).
- Acciones criticas (venta con descuento de stock, anulacion que restituye) ->
  tabla `logs`.
- Roles con `@Roles(Rol.ADMIN)` de `@pos/types`. ABM de productos = ADMIN; la
  venta (agregar lineas en el cobro) la hace SECRETARIA/CAJA como hoy.
- UI: cada pantalla nueva/modificada pasa por impeccable + ui-ux-pro-max +
  frontend-design ANTES del JSX. Tokens de `lib/ui.ts`, FloatingInput/Select,
  dark mode, touch >=44px, focus-visible, tabular-nums en montos y stock.
- Copy visible en espanol con acentos; identificadores de codigo sin acentos.

## Modelo de datos (P1)

### Modelo nuevo: Producto

```prisma
model Producto {
  id              Int      @id @default(autoincrement())
  consultorioId   Int
  consultorio     Consultorio @relation(fields: [consultorioId], references: [id])
  categoria       String?  // texto libre en P1
  nombre          String
  codigoBarras    String?
  precioVenta     Decimal  @db.Decimal(10, 2)
  precioCosto     Decimal  @db.Decimal(10, 2)
  stockActual     Int      @default(0)
  controlaStock   Boolean  @default(true)
  habilitadoVenta Boolean  @default(true)
  activo          Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?

  detalleCobros DetalleCobro[]

  @@unique([consultorioId, codigoBarras])
  @@index([consultorioId])
  @@index([consultorioId, nombre])
  @@map("productos")
}
```

Nota `@@unique([consultorioId, codigoBarras])`: `codigoBarras` es nullable, asi
que Postgres permite varios productos SIN codigo (multiples NULL) y a la vez
impide dos productos con el mismo codigo en un consultorio.

### Modelo nuevo: DetalleCobro (la linea servicio-o-producto)

```prisma
model DetalleCobro {
  id            Int      @id @default(autoincrement())
  consultorioId Int
  consultorio   Consultorio @relation(fields: [consultorioId], references: [id])
  cobroId       Int
  cobro         Cobro    @relation(fields: [cobroId], references: [id])
  servicioId    Int?
  servicio      Servicio? @relation(fields: [servicioId], references: [id])
  productoId    Int?
  producto      Producto? @relation(fields: [productoId], references: [id])
  descripcion   String   // snapshot del nombre (servicio o producto) al vender
  cantidad      Int      @default(1)
  precioVenta   Decimal  @db.Decimal(10, 2) // snapshot
  precioCosto   Decimal  @db.Decimal(10, 2) @default(0) // snapshot; 0 en servicios
  subtotal      Decimal  @db.Decimal(10, 2) // cantidad * precioVenta
  createdAt     DateTime @default(now())

  @@index([consultorioId])
  @@index([cobroId])
  @@index([consultorioId, productoId])
  @@map("detalle_cobros")
}
```

CHECK constraints en la migracion (Prisma no los modela; viven en el SQL):
- **XOR servicio/producto:** exactamente uno no nulo.
  `CHECK ((servicioId IS NOT NULL)::int + (productoId IS NOT NULL)::int = 1)`
- `cantidad > 0`.

`precioVenta`/`precioCosto` son snapshot al momento de la venta (historico para
utilidad en P3). `descripcion` congela el nombre para que renombrar/archivar un
producto no altere cobros viejos.

### Campos agregados a modelos existentes

```prisma
// Consultorio
vendeProductos Boolean @default(false)
// + back-relations: productos Producto[], detalleCobros via Cobro

// Cobro
citaId     Int?     // era obligatorio; pasa a nullable, sigue @unique
pacienteId Int?     // venta directa cuelga aca; en cobro de cita se copia del paciente
paciente   Paciente? @relation(fields: [pacienteId], references: [id])
detalles   DetalleCobro[]
```

Migracion: aditiva salvo `Cobro.citaId` que pasa de `NOT NULL` a `NULL` (cambio
no destructivo) y el **backfill** de `DetalleCobro`. Es data-migration en prod:
se entrega con SQL de verificacion (ver Verificacion).

## Flag y propagacion (AuthUser) — patron Aseguradoras

- `Consultorio.vendeProductos` es la fuente de verdad.
- `AuthUser` gana `vendeProductos: boolean` (en `packages/types` y en el objeto
  `user` que arma el AuthService al loguear: login + loginGoogle, e igual en
  register si devuelve `user`). **NO va en el JWT firmado**: vive en el objeto
  `user` de la respuesta, que el front persiste en el auth store.
- Front: `useAuthStore((s) => s.user?.vendeProductos)` gatea todo el modulo (nav,
  tab de catalogo, boton "Venta directa", tab "Productos" del modal de cobro).
- `PUT /consultorio` (Configuracion) actualiza la columna y devuelve el
  consultorio; en `onSuccess` del toggle el front hace
  `setUser({ ...user, vendeProductos })` para refrescar sin re-login (no existe
  `/auth/me`). Para otros usuarios logueados el cambio aplica al re-login (flag
  que se cambia muy de vez en cuando: aceptable).
- Backend: los endpoints de productos existen siempre (protegidos por rol); la
  validacion de stock/venta se aplica en el path del cobro. Se lee la **columna**
  (no el JWT) donde haga falta evitar stale multi-usuario.

## Integracion con el Cobro (caja y deuda intactas)

Punto de integracion: creacion/finalizacion del cobro en
`apps/api/src/modules/cobros/cobros.service.ts` y la generacion del cobro al
crear/atender la cita en `citas.service.ts`. Pasa a ser transaccional
(cobro + detalle + stock + log).

- **Total derivado de lineas.** `Cobro.total = SUM(detalles.subtotal)`. Al
  generar el cobro de una cita se inserta la linea de servicio
  (`servicioId`, `precioVenta = montoPaciente` cuando hay seguro, si no
  `override ?? precioBase`, `precioCosto = 0`, `cantidad = 1`). La secretaria
  agrega lineas de producto en el modal; al recibirlas se recomputa el total.
- **Venta directa.** Endpoint que crea un `Cobro` con `citaId = null`,
  `pacienteId` opcional y solo lineas de producto. Si el cobro queda con
  `saldoPendiente > 0`, `pacienteId` es **obligatorio** (validacion en el
  service, no solo en el DTO).
- **Descuento de stock.** Al confirmar la venta (transicion de la cita a
  COBRADO/CON_DEUDA; o creacion de la venta directa), por cada linea de producto
  con `producto.controlaStock = true` se hace `stockActual -= cantidad` dentro de
  la `$transaction`. Permite negativo. Si `cantidad > stockActual`, el service
  devuelve una **advertencia** (no bloquea) y el front la muestra al cajero.
- **Restitucion (reversa).** Anular el cobro o reabrir la cita restituye el stock
  de las lineas de producto (`stockActual += cantidad`), en la misma
  `$transaction` y con log. Reusa el patron de reversa ya existente en cobros.
- **Caja y deuda: sin logica nueva.** Como los productos entran al `total` del
  cobro y los pagos son por-cobro, el ingreso por productos ya suma a la caja del
  dia (via `Pago`) y el saldo impago ya rola a `Paciente.deudaTotal`. No se toca
  `caja_diaria` ni el calculo de deuda.
- **Edicion de lineas:** agregar/quitar productos solo **antes** de confirmar.
  Tras confirmar, la correccion es via anular (que restituye stock) -> reusa el
  flujo de reversa; no se editan lineas de un cobro ya confirmado en P1.

## Interfaz (UI) — P1

Cada pantalla pasa por los skills de UI antes del JSX. Reusar tokens de
`lib/ui.ts`, FloatingInput/Select, el patron switch-container de los toggles.

### Configuracion -> Consultorio
Toggle "Vende productos" (switch-container + helper que explica que habilita el
modulo). `onSuccess` refresca AuthUser (`setUser`).

### Seccion nueva "Inventario" -> tab "Productos"
Seccion propia en el nav (no un tab de Catalogo), visible solo admin + flag on.
La seccion tiene su shell con tabs/sub-rutas: **Productos** (P1), y mas adelante
**Compras** (P2) y **Ajustes** (P3). En P1 entra solo Productos.

Tab Productos: lista paginada (patron del grid de pacientes: `{items,total}`,
scroll infinito) con buscador por nombre/codigo de barras y filtros (habilitado,
activo). Alta/edicion con FloatingInputs: categoria, nombre, codigo de barras,
precioVenta, precioCosto, stock inicial, `controlaStock`, `habilitadoVenta`.
Archivar en vez de borrar si esta usado.

### Modal de cobro (Agenda) -> venta mixta
Visible el bloque de productos solo si flag on. Buscador unificado con **tabs
"Servicios | Productos"** (o buscador con filtro): agregar una linea en pocos
clics, editar cantidad, ver subtotal por linea y **total en vivo**. Alerta de
stock cuando `controlaStock` y la cantidad supera el disponible (color + icono,
no solo color). Botones grandes (UX POS, touch >=44px). `tabular-nums` en montos
y stock.

### Boton "Venta directa"
Visible solo si flag on. Abre el **mismo modal de cobro** sin cita: selector de
paciente **opcional** (con aviso "si queda saldo, elegi un paciente"), solo tab
Productos. Reusa todo el flujo (detalle, caja, deuda).

## Verificacion (P1)

- `cd apps/api && npx tsc --noEmit` y `cd apps/web && npx tsc --noEmit` antes de
  cada commit.
- `cd packages/types && pnpm build` tras cambiar tipos compartidos.
- `cd apps/api && npx prisma migrate dev` por cada migracion (solo dev/local).
- **Migracion de prod:** la baja de `NOT NULL` en `citaId` y el backfill de
  `DetalleCobro` son data-migration; entregar SQL de verificacion
  (`SELECT count(*)` de cobros sin linea de servicio = 0 tras backfill;
  `SUM(detalles)` == `cobro.total` por cobro) para correr antes del deploy.
- Gate nuevo `scripts/gate-productos.ps1`: alta producto -> venta mixta (cita +
  producto) -> confirma -> descuenta stock -> anula -> restituye stock -> venta
  directa con paciente (deuda) y sin paciente (contado) -> XOR de la linea ->
  total = SUM(detalles). Gates previos corren como regresion.
- Regla de oro: ninguna migracion destructiva en produccion; las de P1 son
  aditivas salvo el aflojado de `NOT NULL` (no destructivo).

---

## P2 — Compras + Kardex (resumen; spec aparte)

UI: tab **Compras** dentro de la seccion Inventario.

- **`Compra`** (cabecera): `consultorioId`, `fechaCompra`, `proveedor String?`,
  `comentarios String?`, `total`, `registradoPorId`. **`DetalleCompra`**:
  `productoId`, `cantidad`, `costoUnitario`. Confirmar la compra **incrementa**
  `stockActual` (y puede actualizar `precioCosto` del producto).
- **Pago de la compra como Gasto:** la compra genera/enlaza uno o varios `Gasto`
  (reusa el modulo de gastos y la caja); link `Compra` <-> `Gasto`.
- **`MovimientoStock` (kardex):** nace aca. `productoId`, `tipo`
  (COMPRA | VENTA | AJUSTE), `cantidad` (con signo), `stockAntes`,
  `stockDespues`, referencia (compraId/cobroId/ajusteId), `motivo`,
  `createdById`, `createdAt`. Las ventas de P1 se pueden backfillear desde
  `DetalleCobro` o registrar desde el momento en que P2 entra.

## P3 — Ajuste de inventario + Reportes (resumen; spec aparte)

UI: tab **Ajustes** dentro de la seccion Inventario; los reportes de
utilidad/inventario van en el modulo Reportes existente.

- **`AjusteInventario`** (conteo): por producto, `stockContado` vs
  `stockSistema`, `diferencia`, `motivo`, `createdById`. Setea `stockActual` al
  valor contado y deja un `MovimientoStock` tipo AJUSTE (rastro auditable).
- **Reportes:** utilidad (precioVenta - precioCosto desde `DetalleCobro`), valor
  de inventario (stock x costo), productos mas vendidos, stock bajo / negativo.

## Fuera de alcance (YAGNI por ahora)

- Variantes/SKU, lotes, vencimientos, multiples depositos/almacenes.
- Stock fraccionado (decimal): P1 maneja unidades enteras.
- Pantalla POS de mostrador dedicada (se reusa el modal de cobro).
- Codigos de barras por lector fisico / impresion de etiquetas (el campo existe;
  la captura por lector se puede sumar despues).
- Tabla `deudas` separada (se reusa `saldoPendiente` + `deudaTotal`).
