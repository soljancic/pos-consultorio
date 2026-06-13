# Spec: Catálogo de TipoGasto y TipoCuenta (por consultorio)

> Fecha: 2026-06-13 · Estado: borrador para aprobacion del owner
> Un CRUD por tabla, ambas en `CatalogoPage`, con migracion de datos desde los enums.

---

## Problema

`CategoriaGasto` y `CuentaGasto` son enums de Prisma — globales y fijos para todos los consultorios.
El owner quiere que cada consultorio personalice sus propias categorias de gasto (tipoGasto) y sus
propias cuentas/origenes de fondos (tipoCuenta). Ademas, `TipoCuenta` debe quedar diseñado para
servir tanto a gastos como a cobros en el futuro.

Hoy el arqueo de caja filtra hardcodeado con `cuenta === 'CAJA_EFECTIVO'`; tras la migracion ese
filtro debe ser dinamico usando `TipoCuenta.esEfectivo`.

---

## 1. Schema

### Nuevos modelos

```prisma
model TipoGasto {
  id            Int         @id @default(autoincrement())
  consultorioId Int
  consultorio   Consultorio @relation(fields: [consultorioId], references: [id])
  nombre        String
  activo        Boolean     @default(true)
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  gastos Gasto[]
}

model TipoCuenta {
  id            Int         @id @default(autoincrement())
  consultorioId Int
  consultorio   Consultorio @relation(fields: [consultorioId], references: [id])
  nombre        String
  activo        Boolean     @default(true)
  // Marca la cuenta que participa en el arqueo de efectivo de la caja.
  // Solo debe haber 0 o 1 con esEfectivo=true por consultorio.
  esEfectivo    Boolean     @default(false)
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  gastos Gasto[]
}
```

### Cambios en `Gasto`

```prisma
model Gasto {
  ...
  // Reemplaza: categoria CategoriaGasto
  tipoGastoId   Int
  tipoGasto     TipoGasto  @relation(fields: [tipoGastoId], references: [id])

  // Reemplaza: cuenta CuentaGasto @default(CAJA_EFECTIVO)
  tipoCuentaId  Int
  tipoCuenta    TipoCuenta @relation(fields: [tipoCuentaId], references: [id])
  ...
}
```

### Cambios en `Consultorio`

Agregar las relaciones inversas:
```prisma
tiposGasto   TipoGasto[]
tiposCuenta  TipoCuenta[]
```

### Eliminar

- `enum CategoriaGasto` y `enum CuentaGasto` del schema (tras migrar datos).

---

## 2. Migracion de datos

La migracion necesita SQL custom (no solo `prisma migrate dev`). Pasos:

1. Crear tablas `TipoGasto` y `TipoCuenta`.
2. Para cada consultorio existente: insertar los defaults (abajo).
3. Agregar columnas `tipoGastoId` y `tipoCuentaId` en `Gasto` como nullable temporalmente.
4. Actualizar cada `Gasto` mapeando `categoria` → `tipoGastoId` y `cuenta` → `tipoCuentaId`
   usando el nombre del default que corresponde.
5. Hacer las columnas NOT NULL.
6. Eliminar columnas `categoria` y `cuenta` de `Gasto`.
7. Eliminar los enums.

### Defaults que se insertan por consultorio

**TipoGasto** (corresponden a `CategoriaGasto`):
| nombre      | mapea desde   |
|-------------|---------------|
| Insumos     | INSUMOS       |
| Sueldos     | SUELDOS       |
| Alquiler    | ALQUILER      |
| Servicios   | SERVICIOS     |
| Impuestos   | IMPUESTOS     |
| Otros       | OTROS         |

**TipoCuenta** (corresponden a `CuentaGasto`):
| nombre         | esEfectivo | mapea desde    |
|----------------|------------|----------------|
| Caja efectivo  | true       | CAJA_EFECTIVO  |
| Banco          | false      | BANCO          |
| Otro           | false      | OTRO           |

### Seeding para consultorios nuevos

`ConsultoriosService.create()` debe insertar los mismos 6 TipoGasto y 3 TipoCuenta defaults
dentro de la misma transaccion de creacion del consultorio. El nuevo consultorio no debe
quedar sin defaults al abrir por primera vez la pantalla de gastos.

---

## 3. Backend

### Modulos nuevos

Dos modulos simetricos siguiendo el patron de `servicios/`:

**`tipos-gasto` module** — endpoints SOLO ADMIN:
```
GET    /tipos-gasto          → todos (activos + inactivos) para el catalogo
GET    /tipos-gasto/activos  → solo activos, para dropdowns en GastoModal y filtros
POST   /tipos-gasto          → crear { nombre }
PATCH  /tipos-gasto/:id      → editar nombre y/o activo
```

**`tipos-cuenta` module** — endpoints SOLO ADMIN:
```
GET    /tipos-cuenta         → todos (activos + inactivos)
GET    /tipos-cuenta/activos → solo activos, para dropdowns
POST   /tipos-cuenta         → crear { nombre, esEfectivo? }
PATCH  /tipos-cuenta/:id     → editar nombre, activo, esEfectivo
```

- Soft delete: `activo = false`, nunca borrar filas (puede haber gastos asociados).
- No permitir inactivar un TipoGasto/TipoCuenta que tenga gastos no eliminados; devolver
  `ConflictException` con mensaje claro.
- `consultorioId` siempre del JWT, nunca del body.
- DTOs con class-validator: `@IsString() @IsNotEmpty()` en `nombre`;
  `@IsBoolean() @IsOptional()` en `activo` y `esEfectivo`.

### Cambios en `GastosService`

- `CreateGastoDto`: `tipoGastoId: number` (`@IsInt() @Min(1)`) y
  `tipoCuentaId: number` (`@IsInt() @Min(1)`).
- `findAll`: hacer `include: { tipoGasto: true, tipoCuenta: true }`.
- `resumen()`: agrupar por `tipoGasto.nombre` en vez de `g.categoria`.
- `create()`: validar que `tipoGastoId` y `tipoCuentaId` pertenecen al mismo `consultorioId`
  (findFirst con ambos filtros; 404 si no existe).

### Cambios en `CajaService`

- La logica de arqueo usa actualmente `g.cuenta === 'CAJA_EFECTIVO'`.
- Cambiar a: incluir `tipoCuenta` en la query de gastos y filtrar con
  `g.tipoCuenta.esEfectivo === true`.
- La funcion `calcularResumen` (o equivalente) debe agrupar gastos por
  `tipoCuenta.nombre` para el resumen dinamico del cierre.

### Cambios en `@pos/types`

- Eliminar `CategoriaGasto` y `CuentaGasto` del enum export (o deprecarlos si hay
  referencias en el frontend que se actualicen gradualmente).

---

## 4. Frontend

### `CatalogoPage`: dos secciones nuevas (al final, debajo de Doctores)

Patron identico a la seccion Servicios: tabla con `nombre`, columna `Estado`
(activo/inactivo), boton "Nuevo" solo ADMIN, boton de editar por fila.

**Seccion Tipos de gasto**
- Query: `GET /tipos-gasto` (todos), queryKey `['tipos-gasto', 'todos']`.
- Modal `TipoGastoModal`: input `nombre` + toggle `activo`.

**Seccion Tipos de cuenta**
- Query: `GET /tipos-cuenta` (todos), queryKey `['tipos-cuenta', 'todos']`.
- Modal `TipoCuentaModal`: input `nombre` + toggle `activo` + checkbox `Es cuenta de efectivo
  (participa en el arqueo de caja)`.
- El checkbox `esEfectivo` solo visible si `activo === true`; si se intenta poner dos cuentas
  con `esEfectivo=true` el backend devuelve un error (ver validacion abajo).

### `GastoModal`

- Reemplazar los `<select>` de enum por dropdowns cargados de la API.
- `tiposGasto`: `GET /tipos-gasto/activos`, queryKey `['tipos-gasto', 'activos']`.
- `tipoCuenta`: `GET /tipos-cuenta/activos`, queryKey `['tipos-cuenta', 'activos']`.
- El aviso "Los gastos en efectivo descuentan del arqueo" aparece cuando el `tipoCuenta`
  seleccionado tiene `esEfectivo === true` (en vez del hardcode anterior).
- Valor inicial: el primer `TipoGasto` activo y la `TipoCuenta` con `esEfectivo=true`
  (si existe); si no hay ninguna activa mostrar error vacío con mensaje "Configure tipos
  en Catálogo".

### `GastosPage`

- El filtro de `categoria` pasa a ser un `<select>` cargado de `/tipos-gasto/activos`.
- Si el filtro es por `tipoGastoId` en vez de enum string, el endpoint backend debe
  aceptar `?tipoGastoId=` (ajustar query param en GastosService.findAll).

### `ReportesPage`

- Actualizar cualquier referencia a `LABEL_CATEGORIA` o `LABEL_CUENTA` para usar el
  `nombre` dinamico que viene del backend (ya incluido en la respuesta de gastos).

---

## 5. Validacion extra en backend

- No se pueden tener dos `TipoCuenta` con `esEfectivo=true` para el mismo consultorio.
  `POST /tipos-cuenta` y `PATCH /tipos-cuenta/:id`: si el payload incluye
  `esEfectivo: true`, hacer `updateMany({ where: { consultorioId, esEfectivo: true },
  data: { esEfectivo: false } })` antes de guardar el nuevo (cambia el anterior en vez de
  rechazar). Esto permite "mover" el rol efectivo a otra cuenta sin error.

---

## 6. Verificacion

- `npx tsc --noEmit` en api y web.
- Gate `scripts/gate-tipos-gasto-cuenta.ps1`:
  - CRUD completo de TipoGasto (crear, editar nombre, inactivar).
  - CRUD completo de TipoCuenta (crear, marcar esEfectivo, verificar que el anterior
    pierde esEfectivo).
  - Crear un Gasto con los nuevos IDs; verificar que aparece en findAll con nombres.
  - Intentar inactivar un TipoGasto con gastos asociados → 409.
  - Cerrar caja con un gasto en la cuenta efectivo → arqueo correcto.
- Revision visual: catalogo muestra las 2 secciones nuevas; GastoModal usa dropdowns.

---

## Fuera de alcance

- Vincular `TipoCuenta` a cobros (queda preparado el modelo; la integracion con `Pago`
  es una tarea futura).
- Reordenar o agrupar los tipos (orden alfabetico es suficiente por ahora).
- Importar/exportar tipos entre consultorios.
