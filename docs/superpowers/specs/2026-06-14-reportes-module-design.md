# Spec: Módulo de Reportes (Consultech)

> Fecha: 2026-06-14 · Estado: aprobado para plan de implementación
> Owner-decisiones: build completo (5 reportes), default Hoy + presets, KPIs de pago dinámicos por `TipoCuenta`, exportación Excel + Imprimir (PDF nativo fuera de v1).

## 1. Objetivo

Reemplazar la pantalla de Reportes actual (un solo reporte mensual) por un módulo centralizado que permita ver información operativa y financiera del consultorio con filtros por rango de fechas, KPIs resumidos, tabs por tipo de reporte, tabla detallada (orden, paginación, búsqueda) y exportación.

Reportes: **Citas, Cobranzas, Gastos, Pacientes, Servicios.**

## 2. Principios de diseño

- **Backend calcula, frontend renderiza.** Cada endpoint devuelve KPIs ya calculados + filas paginadas. El front no agrega ni recalcula.
- **Sin cambios de schema.** Todo sale del modelo actual (mapeos en §4). No hay migración SQL nueva.
- **Multi-tenant estricto.** `consultorioId` siempre del JWT (`@CurrentUser()`), nunca del query.
- **Reutilizable.** Filtros, KPIs, tabla y export son componentes genéricos; cada reporte aporta solo su configuración de columnas + mapper de export.
- **Consistencia visual.** Design system existente (tokens teal, dark mode, `tabular-nums`, focus rings, touch ≥44px). Estados loading/vacío/error con los componentes ya construidos (`Skeleton`/`TableSkeleton`, `EmptyState`, `ErrorState`).
- **Fechas por día calendario local** del consultorio (igual que caja/agenda y el reporte mensual actual): `new Date(\`${fecha}T00:00:00\`)`. No `setHours()`.

## 3. Alcance

**Incluye (v1):** los 5 reportes, filtros reutilizables, KPIs por reporte, DataTable genérico (orden/paginación/búsqueda + loading/vacío/error), exportación a Excel e Imprimir, roles ADMIN/DOCTOR.

**Fuera de v1:** exportación a PDF nativo (Imprimir + "Guardar como PDF" del navegador cubre el caso; se puede sumar luego sin tocar la arquitectura). Gráficos/charts (solo tablas + KPIs numéricos en v1).

## 4. Reconciliación con el modelo de datos (sin cambios de schema)

| Spec pedía | Sale de | Nota |
|---|---|---|
| Cita "Observaciones" | `cita.notasSecretaria` | ya existe |
| Gasto "Proveedor" | `gasto.personal` | "a quién se pagó" (texto libre) |
| Cobranza "Concepto" | `servicio.nombre` + `Cita #id` | |
| "Usuario" (cobro/gasto) | `pago.createdBy.nombre` / `gasto.registradoPor.nombre` | |
| Estados de cita | enum `EstadoCita` | etiquetas: Solicitada, Pendiente, Confirmada, Llegó, En atención, Atendida, Cobrado, Con deuda, Cancelada, No asistió, Reprogramada |
| Forma de pago (QR/Transferencia) | `TipoCuenta` (catálogo dinámico) | KPIs por cuenta + split efectivo/no-efectivo (`esEfectivo`) |

### Definiciones de negocio (fijadas)
- **Paciente nuevo**: `paciente.createdAt` dentro del rango.
- **Paciente recurrente**: ≥2 citas atendidas (`ATENDIDA|COBRADO|CON_DEUDA`) en su histórico.
- **Paciente con deuda**: `deudaTotal > 0`.
- **Paciente inactivo**: sin citas atendidas en los últimos 6 meses (relativo a hoy, no al rango).
- **Servicio sin movimiento**: 0 citas atendidas en el rango.
- **Atendida** (para KPIs de ingreso/actividad) = estados `ATENDIDA`, `COBRADO`, `CON_DEUDA`.

## 5. Filtros (DTO reutilizable)

`ReportFiltersDto` (class-validator — sin decoradores el request da 400):

| Campo | Tipo | Req | Validación |
|---|---|---|---|
| `desde` | `string` YYYY-MM-DD | sí | `@IsDateString` |
| `hasta` | `string` YYYY-MM-DD | sí | `@IsDateString` |
| `doctorId` | `number` | no | `@IsOptional @IsInt` (ignorado/forzado para rol DOCTOR) |
| `servicioId` | `number` | no | `@IsOptional @IsInt` |
| `pacienteId` | `number` | no | `@IsOptional @IsInt` |
| `estado` | `EstadoCita` | no | `@IsOptional @IsEnum` (solo Citas) |
| `tipoCuentaId` | `number` | no | `@IsOptional @IsInt` (Cobranzas/Gastos) |
| `q` | `string` | no | `@IsOptional @IsString` (búsqueda rápida) |
| `page` | `number` | no | default 1 |
| `pageSize` | `number` | no | default 25, máx 100 |
| `sortBy` | `string` | no | whitelist por reporte |
| `sortDir` | `'asc'\|'desc'` | no | default `desc` |

Default de UI: `desde = hasta = hoy`. Presets: Hoy · Esta semana · Este mes · Mes pasado · Personalizado.

## 6. Endpoints + respuesta uniforme

`GET /reportes/citas|cobranzas|gastos|pacientes|servicios` (todos `@ApiBearerAuth`, query = `ReportFiltersDto`).

Respuesta:
```ts
interface ReportKpi { key: string; label: string; value: number; format: 'money'|'number'|'percent'; tone?: 'default'|'success'|'warning'|'danger' }
interface ReportPage<T> { kpis: ReportKpi[]; rows: T[]; page: number; pageSize: number; total: number; meta?: Record<string, unknown> }
```
(Definidos en `@pos/types`, compartidos back/front.)

### 6.1 Citas — fila + KPIs
Fila: `fecha, hora` (de `fechaHora`), `paciente` (Nombre Apellido), `doctor`, `servicio`, `estado`, `monto` (`cobro.total` o `servicio.precioBase` si no hay cobro), `observaciones` (`notasSecretaria`).
KPIs: Total citas · Atendidas · Canceladas · No asistieron · Ingresos generados (pagos netos de esas citas).
Orden por: fecha (default), paciente, doctor, estado, monto. Búsqueda: paciente.

### 6.2 Cobranzas — fila + KPIs
Fila: `fechaPago` (`pago.createdAt`), `paciente`, `concepto` (servicio + `Cita #id`), `formaPago` (`tipoCuenta.nombre`), `monto`, `usuario`. Reversas (monto negativo) se incluyen y netean.
KPIs: Total cobrado · Efectivo (`esEfectivo`) · No efectivo · Deudas pendientes (suma `cobro.saldoPendiente` del rango). `meta.cuentas` = desglose dinámico `[{id,nombre,total}]`.
Orden: fecha (default), paciente, monto, formaPago. Búsqueda: paciente.

### 6.3 Gastos — fila + KPIs (ADMIN only)
Fila: `fecha`, `categoria` (`tipoGasto.nombre`), `descripcion`, `proveedor` (`personal`), `formaPago`, `monto`, `usuario`.
KPIs: Total gastos · (meta) por categoría · (meta) por forma de pago · Utilidad aproximada (ingresos del rango − gastos del rango).
Orden: fecha (default), categoria, monto. Búsqueda: descripcion/proveedor.

### 6.4 Pacientes — fila + KPIs
Fila: `paciente`, `telefono`, `fechaRegistro` (`createdAt`), `ultimaCita`, `cantidadCitas`, `totalPagado`, `deudaPendiente`.
KPIs: Nuevos (en rango) · Recurrentes · Con deuda · Inactivos.
Orden: paciente, ultimaCita, cantidadCitas, totalPagado, deuda. Búsqueda: nombre/apellido/teléfono.

### 6.5 Servicios — fila + KPIs (agregado, sin paginación pesada)
Fila: agrupado por **servicio × doctor**: `servicio`, `doctor`, `cantidadRealizada`, `totalCobrado`, `promedioCobrado`.
KPIs: Servicio más vendido (cantidad) · Servicio con mayor ingreso · Servicios sin movimiento (cantidad).
Orden: cantidad (default), total, promedio.

## 7. Roles y permisos

- **ADMIN**: los 5 reportes, data completa, filtro de doctor visible.
- **DOCTOR**: tabs **Citas, Cobranzas (de sus citas), Servicios, Pacientes** — forzados a su `doctorId` (resuelto desde el JWT vía su registro `Doctor`, igual que AgendaPage; nunca del query). Filtro de doctor oculto. **Gastos: solo ADMIN** (tab no se muestra; endpoint con `@Roles(Rol.ADMIN)`).
- Guard: `@Roles(Rol.ADMIN, Rol.DOCTOR)` en los 4 compartidos; el service escopea por doctor cuando el rol es DOCTOR.

## 8. Arquitectura — Backend

```
apps/api/src/modules/reportes/
  reportes.controller.ts     5 endpoints + el mensual existente (se mantiene)
  reportes.service.ts        un método por reporte + helpers: rangoLocal(desde,hasta), aplicarPaginacion, escoparPorRolDoctor
  dto/report-filters.dto.ts  ReportFiltersDto (class-validator)
packages/types/src/reportes.ts  ReportKpi, ReportPage<T>, filas (CitaReportRow, CobranzaReportRow, ...) + EstadoCita label map
```
Notas: índices Prisma ya cubren los filtros (`[consultorioId,fechaHora]`, `[consultorioId,doctorId,fechaHora]`, `[consultorioId,estado]`, `[consultorioId,pacienteId]`). Agregaciones con `groupBy`/`findMany` + cómputo en memoria como hace `mensual()`. Tras tocar `@pos/types`: `cd packages/types && pnpm build`.

## 9. Arquitectura — Frontend

```
apps/web/src/features/reportes/
  ReportesPage.tsx           orquesta filtros + KPIs + tabs + tabla + export; aplica rol
  components/
    ReportFilters.tsx        rango + presets + doctor/servicio/paciente/estado/forma de pago (campos según tab)
    ReportTabs.tsx           role="tablist" (patrón Caja/Catálogo); oculta Gastos para DOCTOR
    KpiCards.tsx             renderiza ReportKpi[] (grilla como Dashboard)
    DataTable.tsx            genérico: columnas, orden server-side (aria-sort), paginación, búsqueda, loading(Skeleton)/vacío(EmptyState)/error(ErrorState)
    ExportButtons.tsx        Excel (xlsx) + Imprimir (print CSS)
  reports/
    citas.report.ts          { columns, exportMapper, searchPlaceholder, defaultSort }
    cobranzas.report.ts · gastos.report.ts · pacientes.report.ts · servicios.report.ts
  hooks/
    useReportFilters.ts      estado de filtros + presets + sync con querystring (deep-link)
    useReportData.ts         useQuery keyed por ['reportes', tab, filtros, page, sort]
  api/reportes.api.ts        axios por reporte
```
La página guarda el tab activo y filtros en la URL (deep-link/compartible). `DataTable` es presentacional: recibe `columns`, `rows`, estado de carga y callbacks de orden/página.

## 10. Flujo de datos

`ReportFilters` (estado + URL) → `useReportData(tab, filtros, page, sort)` → `GET /reportes/<tab>` → backend valida DTO, escopea por consultorio (+doctor si rol DOCTOR), calcula KPIs y pagina → `{kpis, rows, total, meta}` → `KpiCards` + `DataTable` renderizan → `ExportButtons`: Excel arma el `.xlsx` desde las filas + columnas del reporte activo (todas las páginas vía fetch sin paginar para export, o la consulta export-completa); Imprimir aplica `@media print` y deja la tabla + KPIs limpios.

## 11. UX/UI

Layout (mobile-first, responsive):
```
Reportes  (header con título + chip)
[ Filtros: rango + presets + selects según tab ]      [ Excel ] [ Imprimir ]
[ Tabs: Citas · Cobranzas · Gastos* · Pacientes · Servicios ]   (*solo ADMIN)
[ KPI cards (grilla 2/3/4/5 cols responsive) ]
[ Búsqueda rápida ]                                   [ paginación arriba-derecha opcional ]
[ DataTable: thead con orden, filas, footer con total/paginación ]
```
- Tabla responsive: scroll horizontal en mobile (`overflow-x-auto` + `min-w`), `tabular-nums` en montos/fechas/horas.
- KPIs con tono semántico (deuda en `destructive`, etc.), color + texto (no solo color).
- Toda UI nueva/modificada pasa por los skills **ui-ux-pro-max + frontend-design** antes del JSX (regla del proyecto).

## 12. Ejemplo JSON (`GET /reportes/cobranzas?desde=2026-06-14&hasta=2026-06-14`)
```json
{
  "kpis": [
    { "key": "total", "label": "Total cobrado", "value": 1250.5, "format": "money" },
    { "key": "efectivo", "label": "Efectivo", "value": 700, "format": "money" },
    { "key": "no_efectivo", "label": "No efectivo", "value": 550.5, "format": "money" },
    { "key": "deuda", "label": "Deudas pendientes", "value": 300, "format": "money", "tone": "danger" }
  ],
  "rows": [
    { "id": 1, "fechaPago": "2026-06-14T13:10:00Z", "paciente": "Esteban Quito",
      "concepto": "Sesión · Cita #84", "formaPago": "Efectivo", "monto": 700, "usuario": "Recepción" }
  ],
  "page": 1, "pageSize": 25, "total": 1,
  "meta": { "cuentas": [{ "id": 3, "nombre": "Efectivo", "total": 700 }, { "id": 5, "nombre": "QR", "total": 550.5 }] }
}
```

## 13. Testing
- Gate de API por reporte (crean su propio tenant; siguen el patrón `scripts/gate-*.ps1`): rango obligatorio (400 sin `desde/hasta`), escopeo por consultorio, escopeo por doctor (rol DOCTOR no ve otros), KPIs vs filas, paginación/orden.
- Un bug de runtime gana un caso en el gate que lo hubiera atrapado.
- E2E opcional (Playwright) del happy-path: filtrar → cambiar tab → exportar.

## 14. Recomendaciones / mejores prácticas
- Tipos compartidos en `@pos/types` = un contrato único; evita drift back/front.
- Verificar antes de cada commit: `cd apps/api && npx tsc --noEmit` y `cd apps/web && npx tsc --noEmit`.
- Export: para Excel del dataset completo, exponer la consulta sin paginar (o `pageSize` grande con tope) detrás del mismo endpoint (`?export=1`) para no rearmar lógica.
- `Decimal` de Prisma → llega como string al front; convertir con `Number()` solo para mostrar.
- PDF nativo (jsPDF/pdfmake) como mejora futura; la arquitectura de `ExportButtons` ya lo admite.

## 15. Fuera de alcance (explícito)
PDF nativo · gráficos/charts · reportes agendados/emailing · comparativas entre rangos. (El reporte `mensual` actual se mantiene operativo; su deprecación se evalúa después de migrar Dashboard/otros consumidores.)
