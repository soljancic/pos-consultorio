# Spec: Centro de Notificaciones (Consultech)

> Fecha: 2026-06-16 · Estado: aprobado para plan de implementación
> Owner-decisiones: transporte por **polling** (~30s, sin WebSocket/Web Push en v1) · persistencia en tabla `Notificacion` con **purga de leídas >7 días** · **bandeja admin compartida** (estado leído global) + fila propia del doctor · doctor ve **paciente en espera + cancel/reprog de sus citas** · **deep-link** que abre la cita en la agenda · **sin** botón eliminar en v1.

## 1. Objetivo

Un centro de notificaciones in-app que avise al personal del consultorio de eventos operativos de citas, con una campana + badge de no leídas siempre visible y un panel para revisar, marcar leídas y saltar a la cita relacionada. Reemplaza el "enterarse por casualidad" al refrescar la agenda.

## 2. Principios de diseño

- **Sin infra nueva de tiempo real.** Polling con TanStack Query (`refetchInterval`), mismo patrón que el badge de Mensajes (`/mensajes/pendientes/count`, 2 min) y el estado de caja (60s). El "tiempo real" es práctico (~30s), suficiente para estos eventos en un consultorio. Se puede subir a Web Push/WebSocket después sin rehacer el modelo.
- **Multi-tenant estricto.** `consultorioId` siempre del JWT (`@CurrentUser()`), nunca del body/params. Todo `findMany`/`update` filtra por `consultorioId`.
- **Emisión desacoplada y no bloqueante.** Las notificaciones se emiten fire-and-forget (`void`, try/catch interno) desde `CitasService`, igual que `notificarReservaAceptada`. Si la emisión falla, la operación de la cita NO se rompe.
- **Una fila por evento, discriminador de audiencia.** Bandeja admin compartida = 1 fila con `destinoUsuarioId = null` y `leidaAt` global. Doctor = fila con `destinoUsuarioId` seteado.
- **Efímeras, no dato de negocio.** Borrado real (`DELETE`), sin `deletedAt`. La purga >7d NO viola la REGLA DE ORO (esa protege datos de negocio en producción; estas son notificaciones efímeras por decisión del owner).
- **Consistencia visual.** Design system existente (tokens `lib/ui.ts`, dark mode, `tabular-nums`, focus-visible ring, touch ≥44px, transiciones 150-300ms). UI nueva pasa por skills impeccable + ui-ux-pro-max + frontend-design ANTES del JSX (regla del proyecto).
- **Fechas.** Mostrar con `formatFecha`/`formatHora` de `lib/utils.ts`. El deep-link arma el día calendario local de la cita (`yyyy-MM-dd`).

## 3. Alcance

**Incluye (v1):**
- Tabla `Notificacion` + enum `TipoNotificacion` (Prisma + `@pos/types`).
- 4 tipos de evento: `NUEVA_CITA`, `CITA_CANCELADA`, `CITA_REPROGRAMADA`, `PACIENTE_EN_ESPERA`.
- Emisión desde `CitasService` en los puntos de evento ya existentes.
- Endpoints: lista, conteo no leídas, marcar una leída, marcar todas leídas.
- Campana + badge rojo + panel (dropdown desktop / bottom sheet móvil) con polling.
- Deep-link a la cita en la agenda.
- Purga de leídas >7d en el cron de E3.
- Gate de API.

**Fuera de v1:** eliminar/descartar notificación, WebSocket/Web Push/Firebase, agrupación/colapso de notificaciones, notificaciones de otros módulos (caja, deudores, gastos), preferencias por usuario (silenciar tipos), sonido/vibración.

## 4. Modelo de datos

Migración nueva (solo dev/local; sin tocar datos productivos).

```prisma
enum TipoNotificacion {
  NUEVA_CITA
  CITA_CANCELADA
  CITA_REPROGRAMADA
  PACIENTE_EN_ESPERA
}

model Notificacion {
  id               Int       @id @default(autoincrement())
  consultorioId    Int
  tipo             TipoNotificacion
  titulo           String
  mensaje          String
  citaId           Int?      // acceso rapido; nullable por si un tipo futuro no tiene cita
  destinoUsuarioId Int?      // null = bandeja admin compartida; set = fila propia de ese doctor (Usuario.id)
  leidaAt          DateTime? // null = no leida (estado de lectura global de la fila)
  createdAt        DateTime  @default(now())

  consultorio      Consultorio @relation(fields: [consultorioId], references: [id])
  cita             Cita?       @relation(fields: [citaId], references: [id])
  destinoUsuario   Usuario?    @relation(fields: [destinoUsuarioId], references: [id])

  @@index([consultorioId, destinoUsuarioId, leidaAt])
  @@index([consultorioId, createdAt])
}
```

**Discriminador de audiencia = `destinoUsuarioId`:**
- `null` → la ven todos los usuarios con rol ADMIN/SECRETARIA/RECEPCION del consultorio; `leidaAt` es compartido (bandeja común: si uno la lee, queda leída para todos).
- seteado → es del doctor (su `Usuario.id`); solo él la ve y la marca.

**Alternativa descartada:** fan-out por destinatario (una fila por usuario). Con bandeja admin compartida, una sola fila con `leidaAt` global es más simple y hace "marcar todas" trivial; el único fan-out real es admin+doctor (máx. 2 filas por evento).

## 5. Emisión (en `apps/api/src/modules/citas/citas.service.ts`)

`NotificacionesService` expone un método para emitir; `CitasService` lo llama fire-and-forget (`void notificaciones.emitir(...)`) con try/catch interno en el service. La fila de doctor resuelve `Doctor.usuarioId` de la cita; si el doctor no tiene `Usuario` vinculado, esa fila no se crea (sin error).

| Evento | Punto en el código | Filas creadas |
|---|---|---|
| Nueva reserva del portal | `create(...)` con `origen === PORTAL` (nace `SOLICITADA`) | `NUEVA_CITA` → admin (`destinoUsuarioId = null`) |
| Cita cancelada | `cambiarEstado(...)` → `CANCELADA` | `CITA_CANCELADA` → admin (null) **+** doctor de la cita |
| Cita reprogramada | `reprogramar(...)` (éxito de la transacción) | `CITA_REPROGRAMADA` → admin (null) **+** doctor de la cita |
| Paciente en espera | `cambiarEstado(...)` → `LLEGO` | `PACIENTE_EN_ESPERA` → doctor de la cita |

**Contenido (título / mensaje resumido):**
- `NUEVA_CITA`: "Nueva solicitud de cita" / "{paciente} solicitó {servicio} para el {fecha} {hora}".
- `CITA_CANCELADA`: "Cita cancelada" / "{paciente} · {servicio} del {fecha} {hora}".
- `CITA_REPROGRAMADA`: "Cita reprogramada" / "{paciente} · {servicio} → {fecha} {hora}".
- `PACIENTE_EN_ESPERA`: "Paciente en espera" / "{paciente} llegó para {servicio} ({hora})".

**Nota sobre el actor:** quien cancela/reprograma siendo admin verá su propia acción en la bandeja compartida (no se puede ocultar al actor sin romper la bandeja común). Es ruido informativo aceptable. `NUEVA_CITA` viene del paciente (portal), así que es señal pura.

## 6. API (NestJS, JWT global + scope por `consultorioId`)

Módulo `notificaciones` (controller + service + DTO con class-validator). Todas las rutas literales antes que las parametrizadas.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/notificaciones` | Últimas ~30, `createdAt` desc. Visibilidad por rol (ver abajo). Devuelve items con `{ id, tipo, titulo, mensaje, citaId, citaFecha, leida, createdAt }`. `citaFecha` (YYYY-MM-DD, día local de la cita) viaja para que el deep-link sepa qué día abrir en la agenda. |
| GET | `/notificaciones/no-leidas/count` | `{ count }` para el badge (lo consume el polling). |
| PATCH | `/notificaciones/:id/leida` | Setea `leidaAt = now()`. Valida consultorio + audiencia; si no es visible para el usuario → 404. Idempotente. |
| PATCH | `/notificaciones/leidas` | Marca todas las visibles del usuario (con `leidaAt IS NULL`) como leídas: un solo `updateMany` con `leidaAt = now()`. |

**Visibilidad por rol** (se construye en el service desde `@CurrentUser()`):
- `DOCTOR` → `where consultorioId = X AND destinoUsuarioId = (usuario.id)`.
- ADMIN/SECRETARIA/RECEPCION → `where consultorioId = X AND destinoUsuarioId IS NULL`.

El conteo y la lista usan exactamente el mismo `where` por rol, para que badge y panel siempre coincidan. No hay endpoint DELETE en v1.

## 7. Retención (cron de E3)

En el mismo cron donde vive `procesarNoShows`, sumar un barrido diario `purgarNotificacionesViejas`:

```sql
DELETE FROM Notificacion WHERE leidaAt IS NOT NULL AND leidaAt < (now() - interval '7 days')
```

Borrado real (no soft). Las no leídas nunca se purgan automáticamente.

## 8. Frontend

### 8.1 Tipos compartidos
Agregar `TipoNotificacion` a `@pos/types` (espejo del enum Prisma, patrón `EstadoCita`: API importa de `@prisma/client`, web de `@pos/types`). Recordar `cd packages/types && pnpm build` tras el cambio.

### 8.2 `NotificacionesBell`
Campana con badge **rojo** (conteo de no leídas; `99+` tope). Vive montada en `AppShell` (no dentro de una ruta), para verse en todo el sistema.
- **Desktop:** botón `fixed` arriba-derecha, flotante (sombra suave, fondo card), `z` por encima del contenido y por debajo de modales.
- **Móvil:** FAB estilo WhatsApp, `fixed` abajo-derecha.
- **Polling:** `useQuery(['notificaciones','count'])` con `refetchInterval ~30s` y `staleTime` corto. Badge oculto si count = 0.
- Touch target ≥44px, focus-visible ring, `aria-label` con el conteo.

### 8.3 Panel
- **Desktop:** dropdown anclado bajo la campana (cierra con click afuera / Esc).
- **Móvil:** bottom sheet / drawer con animación 150-300ms y backdrop (patrón del drawer de `AppShell`).
- **Header del panel:** título "Notificaciones" + acción "Marcar todas como leídas".
- **Ítem:** ícono según `tipo` (lucide), título, mensaje resumido (truncado), fecha/hora (`formatFecha`/`formatHora`, `tabular-nums`), indicador de no-leída **color + forma** (punto + peso de fuente, no solo color).
- **Estados:** loading (skeleton), vacío (`EmptyState`: "Sin notificaciones"), error (`ErrorState`).
- Al abrir el panel, refetch de la lista (`['notificaciones','lista']`).

### 8.4 Acciones e interacción
- **Click en ítem:** marca leída (mutation optimista → invalida `['notificaciones','count']` y `['notificaciones','lista']`) y navega a `/agenda?fecha=YYYY-MM-DD&citaId=N` (cierra el panel).
- **Marcar todas:** mutation → invalida count + lista.

### 8.5 Deep-link en la agenda
`AgendaPage` hoy selecciona la cita por estado local (`citaSeleccionada`) y consulta por fecha (`/citas?fecha=...`). Cablear lectura de `searchParams` al montar: si vienen `fecha` + `citaId`, posicionar la fecha, esperar a que llegue la query de citas y auto-abrir el detalle de esa cita (la misma vista que al click manual). Limpiar los params tras abrir para no re-disparar al navegar.

## 9. Roles y seguridad

- Todas las rutas bajo el guard JWT global; scope por `consultorioId` del token.
- La separación admin vs doctor es backend-real (el `where` por rol se arma en el service), no solo UX.
- Una notificación de otro consultorio o de otra audiencia nunca aparece ni se puede marcar (404 en el PATCH).
- DTOs con decoradores class-validator (sin ellos, 400).

## 10. Testing

- **Gate de API** (`scripts/gate-notificaciones.ps1`, patrón de los gates existentes; crea su propio tenant):
  1. Crea reserva PORTAL → existe 1 `NUEVA_CITA` admin (`destinoUsuarioId null`).
  2. `CANCELADA` → existen `CITA_CANCELADA` admin + doctor.
  3. `reprogramar` → existen `CITA_REPROGRAMADA` admin + doctor.
  4. `LLEGO` → existe `PACIENTE_EN_ESPERA` doctor (no admin).
  5. Visibilidad: el doctor solo ve las suyas; admin solo las `null`.
  6. `count` coincide con la lista; `PATCH /:id/leida` baja el count; `PATCH /leidas` lo deja en 0.
  7. Marcar leída una notificación de otra audiencia → 404.
- **(Opcional) Playwright:** badge visible, abrir panel, marcar leída baja el badge, click navega a la cita.
- Regresión: los gates anteriores siguen pasando.

## 11. Reconciliación con el modelo / dependencias

| Necesita | De dónde sale | Nota |
|---|---|---|
| Usuario del doctor | `Doctor.usuarioId` | si null, no se crea la fila del doctor |
| Datos del mensaje | `cita.paciente`, `cita.servicio`, `cita.fechaHora` | ya disponibles en los includes de `CitasService` |
| Rol del usuario | `@CurrentUser()` (JWT) | define el `where` de visibilidad |
| Cron de purga | mismo scheduler que `procesarNoShows` (E3) | sumar un job diario |

Sin cambios destructivos. Única migración: crear tabla `Notificacion` + enum (aditiva).
