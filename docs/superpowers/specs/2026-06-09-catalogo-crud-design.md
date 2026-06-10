# Catalogo CRUD — Spec de Diseno

> Fecha: 2026-06-09
> Feature: Gestion de servicios y doctores desde la UI
> Etapa: 1 — MVP Operativo

---

## Objetivo

Permitir al admin crear, editar y desactivar servicios y doctores directamente desde la pantalla de Catalogo, sin necesidad de acceso directo a la base de datos.

---

## Contexto del proyecto

- `CatalogoPage` ya existe y muestra servicios y doctores en modo lectura.
- API: `POST /servicios`, `PUT /servicios/:id`, `GET /servicios`, `DELETE /servicios/:id` (soft) ya existen.
- API: `POST /doctores`, `GET /doctores` ya existen. **`PUT /doctores/:id` NO existe** — hay que agregarlo (service + controller).
- `PUT /servicios/:id` usa `Partial<CreateServicioDto>` que NO incluye `activo` — hay que definir `UpdateServicioDto` con `activo` (cubierto en el plan de fixes previos).
- `GET /servicios` y `GET /doctores` filtran `activo: true` — un item desactivado desaparece y no se puede reactivar. Se agrega query param `?todos=true` para el catalogo (admin); la agenda sigue viendo solo activos.

---

## Diseno

### CatalogoPage refactorizada

Agrega botones de accion a cada tabla. Solo visible para rol ADMIN.

#### Seccion Servicios

```
Servicios                                    [ + Nuevo servicio ]

┌───────────────────────────────────────────────────────┐
│ Nombre         Duracion  Precio base  Estado  Acciones │
├───────────────────────────────────────────────────────┤
│ Consulta       30 min    $5.000       Activo   [Editar]│
│ Control        15 min    $3.000       Activo   [Editar]│
│ Derivacion     45 min    $8.000       Inactivo [Editar]│
└───────────────────────────────────────────────────────┘
```

#### Seccion Doctores

```
Doctores                                     [ + Nuevo doctor ]

┌──────────────────────────────────────────────────────────────┐
│ [●] Dr. Garcia   Cardiologia   Lun-Vie    Activo   [Editar]  │
│ [●] Dr. Gomez    Clinica       Mar-Jue    Activo   [Editar]  │
└──────────────────────────────────────────────────────────────┘
```

---

### ServicioModal (crear y editar)

Campos:
| Campo | Tipo | Requerido |
|---|---|---|
| nombre | text | Si |
| descripcion | textarea | No |
| duracionMin | number (min: 5, step: 5) | Si |
| precioBase | number (decimal) | Si |
| activo | checkbox/toggle | Si (default: true) |

**Crear:** `POST /servicios`
**Editar:** `PUT /servicios/:id`

---

### DoctorModal (crear y editar)

Campos:
| Campo | Tipo | Requerido |
|---|---|---|
| nombre | text | Si |
| especialidad | text | No |
| colorAgenda | color picker (6 opciones predefinidas) | Si (default: #3B82F6) |
| activo | checkbox/toggle | Si (default: true) |

Colores predefinidos: azul, verde, naranja, rojo, violeta, rosa — el doctor elige uno.

**Crear:** `POST /doctores`
**Editar:** `PUT /doctores/:id`

**Nota:** Los horarios de atencion del doctor son Etapa 2 — por ahora solo datos basicos.

---

### Control de acceso

Los botones "+ Nuevo" y "Editar" solo se muestran si `usuario.rol === 'ADMIN'`.
Si el rol es SECRETARIA o DOCTOR, la pagina es solo lectura (igual que hoy).

Para esto se usa `useAuthStore` que ya tiene el usuario con su rol.

---

## Archivos afectados

| Accion | Archivo |
|---|---|
| Crear | `apps/web/src/features/catalogo/ServicioModal.tsx` |
| Crear | `apps/web/src/features/catalogo/DoctorModal.tsx` |
| Modificar | `apps/web/src/features/catalogo/CatalogoPage.tsx` |
| Modificar | `apps/api/src/modules/doctores/doctores.service.ts` — agregar `update()` |
| Modificar | `apps/api/src/modules/doctores/doctores.controller.ts` — agregar `PUT /doctores/:id` |
| Modificar | `apps/api/src/modules/servicios/servicios.service.ts` y `doctores.service.ts` — `findAll` con `?todos=true` |

---

## Criterio de aceptacion

- Un admin puede crear un nuevo servicio con nombre, duracion y precio
- Un admin puede editar un servicio existente
- Un admin puede desactivar un servicio (activo: false) — desaparece del selector de nueva cita pero sigue visible en el catalogo (badge Inactivo) y puede reactivarse
- Un admin puede crear un nuevo doctor con nombre, especialidad y color
- Un admin puede editar un doctor existente
- Un usuario no-admin ve el catalogo en modo solo lectura
