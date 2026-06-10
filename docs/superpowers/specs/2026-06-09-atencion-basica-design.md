# Atencion Basica — Spec de Diseno

> Fecha: 2026-06-09
> Feature: Registro clinico simple del doctor (evolucion, diagnostico, tratamiento)
> Etapa: 1 — MVP Operativo (el MVP.pdf la lista textualmente: "Registro simple por parte del doctor de la evolucion, diagnostico y tratamiento indicado en la cita")

---

## Objetivo

Que el doctor pueda registrar en menos de un minuto que hizo en la cita, y que cualquiera con permiso pueda ver "que se le hizo al paciente la ultima vez" (criterio de exito #3 del MVP). NO es la historia clinica completa (recetas, adjuntos, linea de tiempo) — eso es Etapa 2.

---

## Contexto del proyecto

- El modelo `Atencion` YA EXISTE en el schema: `citaId @unique, motivo, diagnostico, evolucion, proximoControl, adjuntos`. Le falta `tratamiento` (el MVP y modelo.jpeg lo nombran explicitamente) — migracion menor.
- El modulo `atenciones` NO existe en `apps/api/src/modules/` — se crea desde cero y se registra en `app.module.ts`.
- `CitaCard` ya tiene botones de accion por estado; se agrega el de atencion.
- `pacientes.service.findOne` ya devuelve las ultimas 10 citas con cobro — se le suma la atencion.
- Relacion 1:1 con la cita (citaId unique) — una cita tiene a lo sumo una atencion.

---

## Diseno

### AtencionModal (desde la agenda)

Se abre desde `CitaCard` con un boton nuevo (icono estetoscopio):
- Visible cuando `estado === EN_ATENCION` (registrar) o la cita ya fue atendida (ver/editar): ATENDIDA, COBRADO, CON_DEUDA.

```
Atencion — Lopez, Maria  •  Consulta  •  09/06/2026 14:00

Motivo de consulta:   [________________________]
Diagnostico:          [________________________]
Tratamiento indicado: [________________________]
Evolucion / notas:    [________________________]  (textarea)
Proximo control:      [ date opcional ]

[ Cancelar ]  [ Guardar ]  [ Guardar y marcar Atendida ]   ← solo si EN_ATENCION
```

- Todos los campos opcionales (registro rapido; guardar con lo que haya)
- "Guardar y marcar Atendida": guarda la atencion y dispara `PUT /citas/:id/estado { estado: ATENDIDA }` — flujo del doctor sin salir de la pantalla
- Si la atencion ya existe, el modal precarga y edita (upsert)

### Endpoints nuevos (modulo `atenciones`)

```
GET /atenciones/cita/:citaId   Atencion de una cita (404 si no hay)
PUT /atenciones/cita/:citaId   Upsert de la atencion (crea o actualiza)
```

Reglas del PUT:
- La cita debe pertenecer al consultorio y no estar borrada
- Estado de la cita debe ser EN_ATENCION, ATENDIDA, COBRADO o CON_DEUDA (no se registra atencion de una cita futura o cancelada)
- Registra log (`entidad: 'Atencion'`, CREATE o UPDATE)

### Ficha del paciente (lectura)

En `PacienteDetallePage`, cada fila del historial con atencion muestra un toggle que expande diagnostico/tratamiento/evolucion debajo de la fila. El backend (`pacientes.service.findOne`) suma `atencion` al include de citas.

### Roles

| Rol | Registrar/editar | Ver |
|---|---|---|
| DOCTOR | Si | Si |
| ADMIN | Si | Si |
| SECRETARIA | No (boton oculto si estado EN_ATENCION; puede ver) | Si |
| CAJA | No | No |

Para el MVP el endpoint no restringe por rol (la UI oculta el boton); el guard fino queda anotado para Etapa 2.

---

## Archivos afectados

| Accion | Archivo |
|---|---|
| Modificar | `apps/api/prisma/schema.prisma` — campo `tratamiento` en Atencion |
| Crear | `apps/api/src/modules/atenciones/atenciones.module.ts` |
| Crear | `apps/api/src/modules/atenciones/atenciones.service.ts` |
| Crear | `apps/api/src/modules/atenciones/atenciones.controller.ts` |
| Modificar | `apps/api/src/app.module.ts` — registrar AtencionesModule |
| Modificar | `apps/api/src/modules/pacientes/pacientes.service.ts` — include atencion |
| Crear | `apps/web/src/features/agenda/AtencionModal.tsx` |
| Modificar | `apps/web/src/features/agenda/CitaCard.tsx` — boton atencion |
| Modificar | `apps/web/src/features/agenda/AgendaPage.tsx` — estado del modal |
| Modificar | `apps/web/src/features/pacientes/PacienteDetallePage.tsx` — fila expandible |

---

## Criterio de aceptacion

- Con una cita EN_ATENCION, el doctor abre el modal, escribe diagnostico y tratamiento, y con un click guarda y pasa la cita a ATENDIDA
- Reabrir el modal muestra lo guardado y permite editar
- En la ficha del paciente se puede expandir una cita pasada y leer que se le hizo
- No se puede registrar atencion de una cita PENDIENTE ni CANCELADA
- Cada guardado queda en la tabla logs
