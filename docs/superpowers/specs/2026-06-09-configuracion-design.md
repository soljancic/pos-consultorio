# Configuracion — Spec de Diseno

> Fecha: 2026-06-09
> Feature: Gestion de usuarios y datos del consultorio
> Etapa: 1 — MVP Operativo

---

## Objetivo

Pantalla de administracion accesible solo para ADMIN que permite gestionar los usuarios del consultorio y actualizar los datos del consultorio (nombre, moneda, etc.).

---

## Contexto del proyecto

- `GET /usuarios` YA EXISTE (lista, solo ADMIN, filtra `activo: true`). Faltan `POST /usuarios` y `PUT /usuarios/:id`. El `findAll` debe modificarse para incluir inactivos y el campo `activo` (si no, no se puede reactivar un usuario).
- `GET /consultorio` y `PUT /consultorio` YA EXISTEN (controller `@Controller('consultorio')`, PUT solo ADMIN, maneja nombre, logoUrl, moneda, timezone). **No crear `/consultorios/mi-consultorio`** — usar los existentes.
- El guard de roles (`RolesGuard`) ya esta registrado globalmente via `APP_GUARD`; el idioma del proyecto es `@Roles(Rol.ADMIN)` con `Rol` de `@pos/types`.
- No existe `ConfiguracionPage` en el frontend ni ruta `/configuracion` en `App.tsx`.
- La entidad `Usuario` tiene unique compuesto `@@unique([email, consultorioId])` → en Prisma se consulta con `email_consultorioId`.
- La creacion de usuarios debe hashear el password con argon2 (igual que auth).
- MVP.pdf (textual): configuracion incluye "logo, moneda, horarios". Logo: campo URL simple (el schema ya tiene `logoUrl`). Horarios de atencion: la API por-doctor ya existe parcialmente (`POST /doctores/:id/horarios`); la UI de horarios se difiere a Etapa 2 (decision documentada).

---

## Diseno

### Layout — dos tabs

```
Configuracion

[ Usuarios ]  [ Consultorio ]

─── Tab: Usuarios ────────────────────────────────────────

Usuarios del sistema                    [ + Nuevo usuario ]

┌──────────────────────────────────────────────────────────┐
│ Nombre          Email              Rol         Estado     │
├──────────────────────────────────────────────────────────┤
│ Ana Gomez       ana@consultorio.com SECRETARIA  Activo [Editar]│
│ Dr. Garcia      garcia@cons.com    DOCTOR       Activo [Editar]│
│ Admin           admin@cons.com     ADMIN        Activo [Editar]│
└──────────────────────────────────────────────────────────┘

─── Tab: Consultorio ─────────────────────────────────────

Datos del consultorio

Nombre: [__________________________]
Logo (URL): [______________________]
Moneda: [ ARS ▼ ]  (ARS, USD, UYU, CLP, PEN, COP, MXN)
Timezone: [ America/Argentina/Buenos_Aires ▼ ]

[ Guardar cambios ]
```

---

### UsuarioModal (crear y editar)

**Crear:**
| Campo | Tipo | Requerido |
|---|---|---|
| nombre | text | Si |
| email | email | Si |
| password | password | Si (minimo 8 chars) |
| rol | select (ADMIN, SECRETARIA, DOCTOR, CAJA) | Si |

**Editar:** igual pero sin campo password (campo opcional: "Nueva contrasena" — si vacio, no cambia).

**Crear:** `POST /usuarios` — hashea password en el backend con argon2
**Editar:** `PUT /usuarios/:id`
**Desactivar:** `PUT /usuarios/:id` con `{ activo: false }` — no hay delete

---

### Tab Consultorio

Campos editables:
- `nombre` (text)
- `logoUrl` (text, URL — upload de archivo queda para etapa posterior)
- `telefono` (text) y `direccion` (text) — de modelo.jpeg, requieren migracion (Task 0 del plan)
- `moneda` (select: ARS, USD, UYU, CLP, PEN, COP, MXN)
- `timezone` (select: listado de zonas de America)

`GET /consultorio` — YA EXISTE, devuelve datos del consultorio del usuario autenticado
`PUT /consultorio` — YA EXISTE (solo ADMIN), actualiza nombre, logoUrl, moneda, timezone

---

### Control de acceso

Toda la ruta `/configuracion` esta protegida por rol ADMIN.
Si un usuario no-ADMIN intenta acceder: redirigir a `/agenda`.

---

## Archivos afectados

### Frontend
| Accion | Archivo |
|---|---|
| Crear | `apps/web/src/features/configuracion/ConfiguracionPage.tsx` |
| Crear | `apps/web/src/features/configuracion/UsuarioModal.tsx` |
| Modificar | `apps/web/src/App.tsx` — ruta `/configuracion` con guard ADMIN |
| Modificar | `apps/web/src/components/shared/AppShell.tsx` — link "Configuracion" solo para ADMIN |

### Backend
| Accion | Archivo |
|---|---|
| Modificar | `apps/api/src/modules/usuarios/usuarios.service.ts` — agregar create/update, incluir inactivos en findAll |
| Modificar | `apps/api/src/modules/usuarios/usuarios.controller.ts` — agregar POST y PUT |

El modulo consultorios NO se toca — `GET/PUT /consultorio` ya existen.

---

## Endpoints

```
GET  /usuarios       YA EXISTE — modificar: incluir inactivos + campo activo
POST /usuarios       NUEVO — crear usuario (hashea password con argon2)
PUT  /usuarios/:id   NUEVO — editar usuario (password opcional, activo)
GET  /consultorio    YA EXISTE — sin cambios
PUT  /consultorio    YA EXISTE — sin cambios
```

---

## Criterio de aceptacion

- Solo un ADMIN puede acceder a `/configuracion`
- Puedo ver, crear y editar usuarios del consultorio
- Puedo desactivar un usuario (no borrarlo)
- Puedo cambiar el nombre del consultorio y la moneda
- Al crear un usuario, el password se hashea en el backend
- Los cambios en la moneda se reflejan en `formatMoneda` de toda la app
