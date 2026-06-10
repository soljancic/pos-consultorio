# Dashboard — Spec de Diseno

> Fecha: 2026-06-09
> Feature: Pantalla de inicio con metricas del dia
> Etapa: 1 — MVP Operativo

---

## Objetivo

Pantalla de bienvenida al sistema que responde en segundos las preguntas clave: cuantas citas hay hoy, cuanto se cobro, y quienes deben.

---

## Contexto del proyecto

- Actualmente `/` redirige a `/agenda`.
- No existe endpoint de dashboard en la API.
- `CajaPage` ya consume `GET /caja/hoy` que devuelve totales por forma de pago.
- `GET /citas?fecha=` ya existe.
- No hay endpoint agregado de deudas totales.
- `GET /caja/historial?desde=&hasta=` ya existe (para ingresos del mes).
- Deuda real = cobros con saldo de citas ATENDIDA/CON_DEUDA (ver spec de deudores).

---

## Diseno

### Layout

```
Buenos dias, [nombre usuario]             Lunes 9 de junio

┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Citas hoy   │ │  En espera   │ │  En atencion │ │  Por cobrar  │
│     12       │ │      3       │ │      1       │ │      4       │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘

┌─────────────────────────────┐  ┌──────────────────────────────┐
│     Caja del dia            │  │     Deudas pendientes        │
│  Efectivo:   $12.000        │  │  Total:   $45.000            │
│  QR:          $8.000        │  │  Pacientes: 7               │
│  Transf:      $5.000        │  │  [ Ver deudores ]           │
│  Total:      $25.000        │  │                              │
└─────────────────────────────┘  └──────────────────────────────┘

Proximas citas (hoy)
┌──────────────────────────────────────────────────────┐
│ 14:00  Juan Perez       Dr. Garcia   Consulta        │
│ 14:30  Maria Lopez      Dr. Garcia   Control         │
│ 15:00  Carlos Diaz      Dr. Gomez    Derivacion      │
└──────────────────────────────────────────────────────┘
```

---

### Metricas del dia (tarjetas)

| Metrica | Fuente |
|---|---|
| Citas hoy (total) | `GET /citas?fecha=hoy` — count |
| En espera (LLEGO) | filter por estado |
| En atencion (EN_ATENCION) | filter por estado |
| Por cobrar (ATENDIDA + CON_DEUDA) | filter por estado |

Estas 4 metricas se calculan en frontend desde la misma query de citas del dia — sin endpoint adicional.

---

### Resumen de caja

Reutiliza datos de `GET /caja/hoy`:
- `totalEfectivo`, `totalQr`, `totalTransferencia`, `totalTarjeta`, `totalGeneral`
- Si la caja no esta abierta (404): mostrar "Caja no iniciada hoy" con boton "Abrir caja"

---

### Resumen de deudas

Nuevo endpoint: `GET /cobros/deudores/resumen`

Se declara junto a `GET deudores` (que ya existe en el controller; no hay conflicto de rutas porque el controller no tiene `GET /:id`). Filtra igual que `getDeudores`: solo cobros con `saldoPendiente > 0` cuya cita esta en `ATENDIDA` o `CON_DEUDA` (las citas futuras crean cobros PENDIENTE que NO son deuda).

Devuelve:
```json
{ "totalDeuda": 45000, "cantidadPacientes": 7 }
```

`cantidadPacientes` = pacientes unicos (via `cita.pacienteId`), no cantidad de cobros.

Boton "Ver deudores" navega a `/deudores`.

---

### Metricas adicionales del MVP (Reportes basicos)

MVP.pdf pide: "Citas del dia. Ingresos diarios. Ingresos mensuales. Deudas pendientes. Pacientes atendidos".

- **Pacientes atendidos hoy**: 5ta tarjeta — count de citas en estado ATENDIDA, COBRADO o CON_DEUDA (frontend, misma query).
- **Ingresos del mes**: linea extra en el panel de Caja, usando `GET /caja/historial?desde=YYYY-MM-01&hasta=hoy` (endpoint ya existente) y sumando `totalGeneral`.

---

### Proximas citas

Las proximas 5 citas del dia con estado PENDIENTE o CONFIRMADA, ordenadas por hora.
Se calculan en frontend desde la query de citas del dia — sin endpoint adicional.
Click en una cita navega a `/agenda`.

---

## Archivos afectados

| Accion | Archivo |
|---|---|
| Crear | `apps/web/src/features/dashboard/DashboardPage.tsx` |
| Crear | `apps/api/src/modules/cobros/dto/deudores-resumen.dto.ts` |
| Modificar | `apps/api/src/modules/cobros/cobros.service.ts` — agregar `getDeudoresResumen` |
| Modificar | `apps/api/src/modules/cobros/cobros.controller.ts` — agregar `GET /cobros/deudores/resumen` |
| Modificar | `apps/web/src/App.tsx` — `/` ahora es DashboardPage (no redirect) |

---

## Roles que pueden ver el dashboard

- ADMIN: ve todo
- SECRETARIA: ve todo excepto totales de caja (opcional, discutir)
- DOCTOR: no ve dashboard — redirige a su agenda
- CAJA: ve solo caja y deudas

Para MVP: todos los roles autenticados ven el dashboard completo.

---

## Criterio de aceptacion

- Al hacer login la pantalla de inicio muestra las metricas del dia
- Las 4 tarjetas de estado reflejan el estado real de las citas de hoy
- El resumen de caja muestra los totales del dia
- El resumen de deudas muestra el total adeudado y numero de pacientes
- Las proximas citas del dia son visibles con hora y paciente
