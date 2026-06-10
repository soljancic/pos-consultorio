# Spec — Calendario de Atencion (Etapa 2.5a)

> **Estado: SPEC, no planificado en detalle.** El plan de implementacion se escribe
> just-in-time antes de ejecutar (metodo de Etapa 1/2). Fija alcance y decisiones.
> Fuente: spec del owner (2026-06-10) adaptada al schema y patrones del proyecto.

## Objetivo

Administrar los horarios de atencion de los doctores con un calendario visual:
horarios repetibles, servicios habilitados por doctor, bloqueos/ausencias y
edicion rapida. Cada doctor define su semana (ej: doctor 1, lunes de 9 a 17).
Es el prerequisito del portal publico de agendamiento (Etapa 2.5b).

## Punto de partida (ya existe)

- Tabla `horarios_atencion` (doctorId, diaSemana, horaInicio, horaFin) — modelo simple sin recurrencia real ni excepciones
- `POST /doctores/:id/horarios` (API sin UI)
- `GET /doctores/:id/disponibilidad?fecha=` — slots disponibles; pasara a leer del modelo nuevo

## Modelo de datos

| Tabla | Campos | Notas |
|---|---|---|
| `disponibilidades` | id, consultorioId, doctorId, fecha (o regla de serie), horaInicio, horaFin, tipo, nota, serieId?, deletedAt | Evoluciona/reemplaza `horarios_atencion`. `tipo`: DISPONIBLE, VACACIONES, AUSENCIA, CAPACITACION, REUNION, BLOQUEADO |
| `series_disponibilidad` | id, frecuencia (DIARIA/SEMANAL/MENSUAL), intervaloSemanas, diasSemana[], desde, hasta | Una serie genera/gobierna sus disponibilidades hijas (`serieId`) |
| `plantillas_horario` | id, consultorioId, nombre, horaInicio, horaFin, serviciosDefault[], duracionCitaDefault? | Ej: "Turno manana", "Jornada completa" |
| `doctor_servicios` | doctorId, servicioId | Que servicios atiende cada doctor; opcionalmente restringible por disponibilidad |

Decision de modelado (a validar en el plan detallado): materializar ocurrencias
hasta `hasta` vs. expandir la regla on-the-fly. Inclinacion: materializar (simplifica
solapes, excepciones y "editar desde esta fecha"), con tope de fecha limite obligatorio.

## Funcionalidades

### 1. Calendario visual de disponibilidad
- Vista semanal tipo scheduler: filas = doctores, columnas = dias, bloques = horarios
- Cada bloque muestra: hora inicio/fin, servicios, estado (color por tipo)
- Reutilizar el patron de grilla de `AgendaDiaGrid`/`AgendaSemanaGrid` (apps/web/src/features/agenda/)

### 2. Crear disponibilidad rapida
- Click en dia vacio → presets: 09:00-17:00, 09:00-20:00, 08:00-18:00, u horario manual

### 3. Formulario completo
- Doctor, fecha, hora inicio/fin, duracion automatica, servicios habilitados, nota interna

### 4. Horarios repetibles
- Frecuencia diaria / semanal / mensual; repetir cada X semanas; seleccion de dias (L-D)
- Fecha limite obligatoria ("hasta el 30/12/2026")
- Ej: lunes a viernes de 09:00 a 17:00 hasta fin de ano

### 5. Servicios por doctor
- Cada disponibilidad puede limitar que servicios atiende
- Efecto: solo aparecen horarios validos segun el servicio elegido; el sistema filtra doctores disponibles (aplica a NuevaCitaModal y al portal publico)

### 6. Plantillas de horarios
- Crear/aplicar plantillas (turno manana, tarde, jornada completa, medio tiempo) con horas, servicios default y duracion de cita

### 7. Edicion de disponibilidad
- Abrir bloque → editar / eliminar
- Si pertenece a una serie: **solo este turno / toda la serie / desde esta fecha en adelante** (edicion y eliminacion)
- Eliminacion siempre soft (regla del proyecto)

### 8. Estados especiales (bloqueos)
- VACACIONES, AUSENCIA, CAPACITACION, REUNION, BLOQUEADO: no aceptan citas

## Reglas y validaciones

- No permitir horarios cruzados del mismo doctor (solape de bloques)
- No permitir citas fuera de disponibilidad (validacion en `POST /citas` y `PUT /citas/:id`)
- Validar duracion minima y maxima de bloque
- Si el doctor no realiza un servicio, no aparece disponible para ese servicio
- Si un horario esta bloqueado, no se puede agendar sobre el
- Multi-tenant: `consultorioId` del JWT en todas las queries (PLAN.md §8b)
- Toda mutacion de series en `prisma.$transaction` + registro en `logs`

## Endpoints (borrador)

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | /disponibilidades?desde=&hasta=&doctorId= | Bloques de la semana |
| POST | /disponibilidades | Crear bloque o serie |
| PUT | /disponibilidades/:id?alcance=uno\|serie\|desde | Editar con alcance |
| DELETE | /disponibilidades/:id?alcance= | Soft delete con alcance |
| GET/POST/PUT/DELETE | /plantillas-horario | CRUD plantillas (ADMIN) |
| PUT | /doctores/:id/servicios | Asignar servicios al doctor |
| GET | /doctores/:id/disponibilidad?fecha=&servicioId= | Reescrito sobre el modelo nuevo |

## UI

- Ruta `/calendario-atencion` (nombre del modulo: **Calendario de Atencion**)
- Roles: ADMIN gestiona todo; SECRETARIA ve; DOCTOR ve/edita solo el suyo (decidir en plan detallado)
- Submodulos: Calendario, Plantillas, Ausencias/Bloqueos

## Fuera de alcance (documentado)

- Sedes / ambientes / doble reserva de consultorio fisico → Etapa 5 (multi-sucursal)
- Drag & drop de horarios, copiar semana, vista mensual, colores por especialidad, notificaciones, IA para sugerir horarios → ideas futuras (backlog)

## Verificacion (cuando se implemente)

- Gate runtime: crear serie L-V 9-17, validar solape rechazado, cita fuera de horario rechazada, bloqueo VACACIONES impide agendar, editar "desde esta fecha" no toca el pasado
- Spec Playwright: flujo crear disponibilidad rapida + agendar cita dentro/fuera del horario
