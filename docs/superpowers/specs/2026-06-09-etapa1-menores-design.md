# Cierre de Etapa 1 (Menores) — Spec de Diseno

> Fecha: 2026-06-09
> Feature: Filtro por doctor en agenda + vista DOCTOR, historial de cajas, desglose deuda vieja vs cobros del dia
> Etapa: 1 — MVP Operativo (ultimos tres pendientes)

---

## Objetivo

Cerrar los tres huecos restantes del MVP: (1) la agenda filtra por doctor y el rol DOCTOR ve solo la suya, (2) la caja muestra el historial de dias anteriores, (3) la caja desglosa "pagos de deuda anterior" vs "cobros del dia" como pide el MVP.pdf ("Nuevas deudas. Pagos de deuda").

---

## 1. Filtro por doctor en la agenda

### Contexto
- `GET /citas?fecha=&doctorId=` YA soporta el filtro — solo falta la UI.
- `GET /doctores` devuelve los doctores con `usuarioId` (mapeo usuario→doctor).
- Tabla de permisos (PLAN.md §5): DOCTOR ve "solo la suya".

### Diseno
- Dropdown "Todos los doctores / Dr. X / Dr. Y" en el header de `AgendaPage`, junto a la navegacion de fecha.
- El `doctorId` seleccionado se suma a la queryKey y al request.
- **Rol DOCTOR**: si `user.rol === 'DOCTOR'`, el frontend busca el doctor cuyo `usuarioId === user.id`, fija el filtro en ese doctor y oculta el dropdown. Si el usuario DOCTOR no tiene doctor vinculado, ve todo (fallback con aviso).
- El guard duro en el backend (DOCTOR no puede pedir otra agenda) queda anotado para Etapa 2 — el MVP confia en la UI.

---

## 2. Historial de cajas

### Contexto
- `GET /caja/historial?desde=&hasta=` YA existe y devuelve las CajaDiaria del rango.
- `CajaPage` solo muestra el dia actual.

### Diseno
- `CajaPage` gana dos tabs: **Hoy** (lo actual, sin cambios) e **Historial**.
- Tab Historial: rango de fechas (default: ultimos 30 dias) + tabla:

```
Fecha       Efectivo   QR      Transf.   Tarjeta   TOTAL     Estado
09/06/2026  $12.000    $8.000  $5.000    $0        $25.000   Cerrada
08/06/2026  ...                                              Abierta
                                              TOTAL PERIODO: $xxx
```

---

## 3. Desglose: pagos de deuda anterior vs cobros del dia + nuevas deudas

### Contexto
- MVP.pdf (textual): caja diaria reporta "Total del dia. Total por forma de pago. **Nuevas deudas. Pagos de deuda**".
- Hoy `getHoy` devuelve `{ caja, pagos }` sin distincion.
- Regla: un pago cuya cita es de una fecha anterior a hoy = pago de deuda anterior.
- Nuevas deudas = saldo pendiente de cobros cuyas citas son de HOY y quedaron ATENDIDA o CON_DEUDA.

### Diseno

`getHoy` devuelve dos campos nuevos calculados (sin tocar el schema):

```typescript
{
  caja,
  pagos,                  // igual que hoy
  pagosDeudaAnterior: number,  // suma de pagos de citas con fecha < hoy
  nuevasDeudas: number,        // suma saldoPendiente de cobros de citas de hoy ATENDIDA/CON_DEUDA
}
```

UI en tab Hoy:
- Dos cards nuevas junto a los totales: "Pagos de deuda" (verde) y "Nuevas deudas" (rojo)
- En la tabla de movimientos, badge "Deuda" en los pagos cuya cita es anterior a hoy

---

## Archivos afectados

| Accion | Archivo |
|---|---|
| Modificar | `apps/web/src/features/agenda/AgendaPage.tsx` — dropdown doctor + lock para rol DOCTOR |
| Modificar | `apps/api/src/modules/caja/caja.service.ts` — desglose en getHoy |
| Modificar | `apps/web/src/features/caja/CajaPage.tsx` — tabs Hoy/Historial + cards desglose |

**API:** sin endpoints nuevos — todo existe; solo se enriquece la respuesta de `GET /caja/hoy`.

---

## Criterio de aceptacion

- Puedo filtrar la agenda por doctor y la lista se actualiza
- Un usuario con rol DOCTOR entra a la agenda y ve solo sus citas, sin dropdown
- En Caja > Historial veo los totales por dia de los ultimos 30 dias y el total del periodo
- En Caja > Hoy veo cuanto de lo cobrado corresponde a deudas de dias anteriores y cuanta deuda nueva se genero hoy
- Un pago de deuda vieja se distingue en la tabla de movimientos
