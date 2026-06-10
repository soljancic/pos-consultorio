# Vista de Deudores — Spec de Diseno

> Fecha: 2026-06-09
> Feature: Listado de pacientes con saldo pendiente
> Etapa: 1 — MVP Operativo

---

## Objetivo

Pantalla que permite ver rapidamente todos los pacientes que tienen saldo pendiente, con acceso directo a cobrar o enviar un recordatorio por WhatsApp.

---

## Contexto del proyecto

- `GET /cobros/deudores` YA EXISTE pero devuelve una lista plana de cobros PENDIENTE/PARCIAL **sin filtrar por estado de la cita**: como toda cita crea un cobro PENDIENTE, hoy lista tambien citas futuras y canceladas. Hay que **modificarlo**, no crearlo.
- Definicion de deuda (regla de negocio): saldo pendiente de cobros cuya cita esta en estado `ATENDIDA` o `CON_DEUDA` (servicio ya prestado). Citas futuras, canceladas o no asistidas NO son deuda.
- MVP.pdf (textual): "Vista de deudores. Saldo pendiente. **Ultimo pago**. Boton WhatsApp" — la columna de ultimo pago es requerida.
- `cobros` tabla tiene `saldoPendiente` y `estado` (PENDIENTE, PARCIAL, COMPLETO); `pagos` tiene la fecha de cada pago.
- `pacientes.deudaTotal` es desnormalizado y se corrige en el plan de fixes previos — esta vista calcula desde cobros igualmente.
- `CobroModal` ya existe y funciona desde la agenda.
- No existe ruta `/deudores` en `App.tsx`.

---

## Diseno

### Layout

```
Deudores                                        [ Buscar por nombre... ]

┌────────────────────────────────────────────────────────────────────────────┐
│ Paciente         Ultima cita   Servicio   Ultimo pago   Deuda    Acciones  │
├────────────────────────────────────────────────────────────────────────────┤
│ Lopez, Maria     03/06/2026    Consulta   01/06/2026    $8.000  [WA][Cobrar]│
│ Diaz, Carlos     28/05/2026    Control    Sin pagos     $3.500  [WA][Cobrar]│
│ ...                                                                         │
└────────────────────────────────────────────────────────────────────────────┘

Total adeudado: $45.000 — 7 pacientes
```

---

### Endpoint a MODIFICAR: `GET /cobros/deudores`

Ya existe (lista plana). Se reescribe `getDeudores` para agrupar por paciente y filtrar solo deuda real, ordenado por deuda desc.

```typescript
// Respuesta por item:
{
  pacienteId: string
  nombre: string
  apellido: string
  whatsapp: string | null
  deudaTotal: number          // suma de saldoPendiente de sus cobros con deuda real
  ultimaCitaFecha: Date
  ultimoServicio: string
  ultimoPago: Date | null     // fecha del pago mas reciente entre sus cobros (MVP: "Ultimo pago")
  cobros: Array<{
    id: string
    citaId: string
    total: number
    saldoPendiente: number
    cita: { fechaHora: Date, servicio: { nombre: string } }
  }>
}
```

**Query en Prisma:**
```typescript
prisma.cobro.findMany({
  where: {
    consultorioId,
    saldoPendiente: { gt: 0 },
    cita: { estado: { in: ['ATENDIDA', 'CON_DEUDA'] }, deletedAt: null },
  },
  include: {
    pagos: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
    cita: {
      include: {
        paciente: { select: { id, nombre, apellido, whatsapp } },
        servicio: { select: { nombre } },
      }
    }
  },
})
// Agrupar por paciente en el service; ultimoPago = max(pagos[0].createdAt) entre los cobros del paciente
```

---

### Acciones por fila

- **Boton WA**: `buildWhatsAppUrl(paciente.whatsapp, template)` — solo si tiene whatsapp
  - Template: `"Hola [nombre], te recordamos que tenes un saldo pendiente de $[monto]. Muchas gracias!"`
- **Boton Cobrar**: abre `CobroModal` — necesita recibir la cita con mayor saldo pendiente del paciente

---

### Busqueda

Filtro local (client-side) sobre los resultados ya cargados. No requiere nuevo request.

---

### CobroModal desde Deudores

`CobroModal` actualmente recibe una `Cita` completa. Para reutilizarlo desde deudores, necesita recibir el cobro del paciente. El componente ya maneja el caso correctamente — solo hay que pasarle la cita adecuada del cobro seleccionado.

---

## Archivos afectados

| Accion | Archivo |
|---|---|
| Crear | `apps/web/src/features/deudores/DeudoresPage.tsx` |
| Modificar | `apps/api/src/modules/cobros/cobros.service.ts` — reescribir `getDeudores()` (agrupar + filtrar estado de cita) |
| Modificar | `apps/web/src/App.tsx` — agregar ruta `/deudores` |
| Modificar | `apps/web/src/components/shared/AppShell.tsx` — agregar link nav "Deudores" |

El controller no cambia: `GET /cobros/deudores` ya esta declarado (antes de `GET cita/:citaId`).

---

## Criterio de aceptacion

- La pagina lista solo pacientes con deuda real (citas ATENDIDA o CON_DEUDA con saldo > 0)
- Un paciente con cita futura agendada pero sin deuda NO aparece
- Se muestra la fecha del ultimo pago de cada deudor (o "Sin pagos")
- Se puede filtrar por nombre en tiempo real
- El total adeudado y cantidad de pacientes se muestra al pie
- El boton WA genera un mensaje con el monto exacto
- El boton Cobrar abre el modal de cobro con los datos del paciente
