# Pacientes Completo — Spec de Diseno

> Fecha: 2026-06-09
> Feature: Ficha del paciente + Nuevo paciente + Editar paciente
> Etapa: 1 — MVP Operativo

---

## Objetivo

Completar el modulo de pacientes: ver la ficha completa de un paciente con su historial de citas y deuda, y poder crear/editar pacientes desde la UI.

---

## Contexto del proyecto

- `GET /pacientes/:id` ya existe y devuelve datos personales + historial de citas con cobros incluidos.
- `POST /pacientes` y `PUT /pacientes/:id` ya existen en la API.
- `PacientesPage` tiene la tabla con `cursor-pointer` pero sin `onClick` ni navegacion.
- `NuevoPacienteModal` no existe.
- La ruta `/pacientes/:id` no esta registrada en `App.tsx`.

---

## Diseno

### 1. PacienteDetallePage (`/pacientes/:id`)

**Layout:**
```
[ ← Pacientes ]

[ Nombre Apellido ]   [ Badge: $X en deuda ]   [ Btn: WhatsApp ] [ Btn: Editar ]

┌─────────────────────────────────────────────────────┐
│ DNI: 12.345.678    Telefono: +54 11 1234-5678       │
│ WhatsApp: +54 11   Email: pac@email.com             │
│ Nacimiento: 15/03/1985 (41 anos)   Notas: ...       │
└─────────────────────────────────────────────────────┘

[ Historial de citas ]
┌────────────────────────────────────────────────────────────────────┐
│ Fecha       Doctor      Servicio     Estado    Total   Saldo  Acc  │
│ 09/06/2026  Dr. Garcia  Consulta     COBRADO   $5.000  $0     —    │
│ 01/06/2026  Dr. Garcia  Consulta     CON_DEUDA $5.000  $3.000 Cobrar│
└────────────────────────────────────────────────────────────────────┘
```

**Datos que muestra:**
- Nombre completo, DNI, telefono, whatsapp, email, fecha de nacimiento + edad calculada, sexo, direccion, notas
- Deuda total (badge rojo si > 0)
- Historial de citas ordenado por `fechaHora` desc: fecha, doctor, servicio, estado (badge con color), total cobro, saldo pendiente
- Boton "Cobrar" en filas con `saldoPendiente > 0` (abre CobroModal pasandole la cita)

**Acciones:**
- Boton WhatsApp: `buildWhatsAppUrl(paciente.whatsapp, 'Hola ...')` — solo visible si tiene whatsapp
- Boton Editar: abre `EditarPacienteModal` (mismo form que NuevoPacienteModal pero con datos precargados)
- Boton Cobrar en fila de cita: abre `CobroModal` con esa cita

**Carga de datos:**
- `useQuery(['paciente', id], () => api.get('/pacientes/' + id))`
- El endpoint ya devuelve citas con `cobro` incluido

---

### 2. NuevoPacienteModal

**Trigger:** boton "Nuevo paciente" en `PacientesPage`

**Campos:**
| Campo | Tipo | Requerido |
|---|---|---|
| nombre | text | Si |
| apellido | text | Si |
| dni | text | No |
| telefono | text | No |
| whatsapp | text | No |
| email | email | No |
| fechaNacimiento | date | No |
| sexo | select (F/M/X) | No |
| direccion | text | No |
| notas | textarea | No |

> `sexo` y `direccion` vienen de modelo.jpeg — requieren migracion (Task 0 del plan).

**Comportamiento al guardar:**
- `POST /pacientes`
- On success: `invalidateQueries(['pacientes'])` + `navigate('/pacientes/' + nuevoPaciente.id)`
- On error: mostrar mensaje de error en el modal

---

### 3. EditarPacienteModal

Reutiliza el mismo componente que `NuevoPacienteModal` con prop `paciente` para precarga.

**Trigger:** boton "Editar" en `PacienteDetallePage`

**Comportamiento al guardar:**
- `PUT /pacientes/:id`
- On success: `invalidateQueries(['paciente', id])` + cerrar modal

---

### 4. Cambios en PacientesPage

- `onClick` en cada fila: `navigate('/pacientes/' + p.id)`
- Boton "Nuevo paciente" abre `NuevoPacienteModal`

---

### 5. Cambio en App.tsx

Agregar ruta:
```tsx
<Route path="pacientes/:id" element={<PacienteDetallePage />} />
```

---

## Archivos afectados

| Accion | Archivo |
|---|---|
| Crear | `apps/web/src/features/pacientes/PacienteDetallePage.tsx` |
| Crear | `apps/web/src/features/pacientes/PacienteModal.tsx` (sirve para crear y editar) |
| Modificar | `apps/web/src/features/pacientes/PacientesPage.tsx` |
| Modificar | `apps/web/src/App.tsx` |

**API:** una migracion menor — agregar `sexo` y `direccion` a `Paciente` (schema + DTO). El resto de los endpoints ya existen.

---

## Reglas de negocio

- La edad se calcula en frontend: `Math.floor((now - fechaNacimiento) / 365.25 / 24 / 3600 / 1000)`
- Si no hay historial de citas: mostrar estado vacio "Sin citas registradas"
- Si el paciente tiene deuda: el badge `$X en deuda` debe ser visible y en rojo
- El boton WhatsApp solo aparece si `paciente.whatsapp` tiene valor

---

## Criterio de aceptacion

- Puedo hacer click en un paciente de la lista y ver su ficha completa
- Puedo crear un nuevo paciente desde el boton "Nuevo paciente"
- Puedo editar los datos de un paciente desde su ficha
- La deuda total y el historial de citas son visibles en la ficha
- Puedo iniciar un cobro desde la fila de una cita con saldo pendiente
