# Diseno: link de auto-reprogramacion, bip de notificacion y vista restringida del doctor

Fecha: 2026-06-16
Estado: aprobado por el owner (2026-06-16)

Cuatro features independientes que comparten esta sesion. Cada una se puede
implementar y verificar por separado.

---

## 1. Link de auto-reprogramacion (el cliente reprograma su propia cita)

### Objetivo
Desde el modal "Reprogramar cita", el boton de WhatsApp pasa a enviar un LINK
para que el cliente elija el mismo su nueva fecha/hora (y opcionalmente otro
doctor). El identificador de la cita viaja como token opaco, nunca el id
numerico.

### Decisiones tomadas
- El cliente puede cambiar **fecha, hora y doctor**. El **servicio queda fijo**
  (es la misma cita). El doctor se elige entre los que atienden ese servicio.
- La reprogramacion **mueve la misma cita** (no crea una nueva); la cita vuelve
  a estado `SOLICITADA` (pedido del paciente, la secretaria reconfirma).

### Backend

**Migracion (aditiva, no destructiva):**
- `Cita.portalToken String? @unique` en `apps/api/prisma/schema.prisma`.
  Token opaco para el link de reprogramacion (capability URL), espejo de
  `Paciente.portalToken`.

**CitasService:**
- `tokenReprogramacion(consultorioId, citaId)`: perezoso e idempotente, espejo
  de `pacientes.portalToken()`. Genera `randomBytes(18).toString('base64url')`
  la primera vez y siempre devuelve el mismo. Valida que la cita exista en el
  tenant y que su estado este en `ESTADOS_REPROGRAMABLES`; si no, 404/409.

**CitasController:**
- `GET /citas/:id/token-reprogramacion` (con auth, `consultorioId` del JWT) ->
  `{ token }`. Ruta literal declarada antes que las parametrizadas que
  pudieran colisionar.

**PortalController (publico, `@Public` + `@Throttle`):**
- `GET /public/:slug/reprogramar/:token` -> contexto para el portal:
  - cita actual: `fechaHoraActual`, `doctorActual { id, nombre }`
  - servicio fijo: `{ id, nombre, duracionMin }`
  - `doctores`: los que atienden ese servicio `{ id, nombre, especialidad, colorAgenda }`
  - `paciente`: solo `{ nombre }` para el saludo
  - 404 generico si el token no matchea, el consultorio/portal no esta activo,
    o la cita ya no es reprogramable.
- `POST /public/:slug/reprogramar/:token` body `{ doctorId, fecha, hora }`:
  - DTO con class-validator (doctorId int, fecha ISO8601, hora `HH:mm`).
  - Revalida: doctor atiende el servicio (fijo), slot libre via
    `doctores.getDisponibilidad` + `filtrarSlotsPasados` (mismo guard que
    `/slots` y `/reservas`).
  - Mueve la MISMA cita: nueva `fechaHora` y `doctorId`, estado -> `SOLICITADA`,
    registra log de auditoria. Reusa la logica interna de reprogramar
    (recalculo de cobro si aplica) y/o `getDisponibilidad` ya existentes.
  - `consultorioId` SIEMPRE del slug; el token confirma la cita exacta.
  - Devuelve confirmacion minima `{ fecha, hora, doctor, servicio }` (sin ids
    internos de mas), igual que `reservar`.

Volver a `SOLICITADA` reusa el flujo ya existente: notificacion de "nueva
solicitud" en el centro de notificaciones y el aceptar SOLICITADA -> PENDIENTE.

### Frontend - portal (ReservarPage)
Modo reprogramacion cuando llega `?reprogramar=<token>`:
- Query a `GET /public/:slug/reprogramar/:token` para el contexto.
- Banner arriba del form: "Estas reprogramando tu cita de [servicio] del
  [fecha actual] con [doctor]. Elegi tu nuevo dia y horario."
- Servicio: fijo, visible, no editable.
- Doctor: selector (default = doctor actual; opciones = los que atienden el
  servicio).
- Calendario + slots: reusan las queries `portal-dias` / `portal-slots`
  existentes (ya toman doctorId + servicioId + fecha).
- Sin bloque de datos personales (es la misma persona).
- Boton final "Confirmar nueva fecha" -> `POST .../reprogramar/:token`.
- Confirmacion: "Pedido de reprogramacion enviado. El consultorio lo
  confirmara."

### Frontend - ReprogramarCitaModal
- Trae el token con `GET /citas/:id/token-reprogramacion` (query perezosa, al
  abrir el modal; `enabled` con portal activo).
- Necesita `consultorio.slug` + `consultorio.portalActivo` (query `consultorio`,
  igual que NuevaCitaModal).
- `buildLinkReprogramar()` ->
  `${publicBaseUrl()}/reservar/${slug}?reprogramar=${token}`.
- Boton "Enviar link por WhatsApp": `abrirWhatsApp(tel, msg, pais)` con un
  mensaje que incluye el link (reemplaza al actual "Consultar nueva fecha").
- Boton "Copiar link" al lado (ver feature 2).
- Ambos botones gateados a `portalActivo` y a `cita.paciente?.telefono` (el de
  WhatsApp). Se mantiene el formulario de reprogramacion manual en el lugar.

---

## 2. Copiar link

Boton "Copiar link" junto al de WhatsApp en ReprogramarCitaModal. Espejo exacto
de `copiarLink()` de NuevaCitaModal: `navigator.clipboard.writeText(...)`,
estado local `copiado` que muestra "Copiado" por 2s, y manejo de error con el
patron de error local del modal.

---

## 3. Bip en notificacion nueva + silenciar

### NotificacionesBell
- Guardar el count previo en un `useRef`. Cuando el count **sube** (y no es la
  carga inicial, es decir el previo estaba definido) -> reproducir un bip corto.
- Bip via Web Audio API: `AudioContext` + `OscillatorNode` (~880Hz, ~150ms,
  `GainNode` con volumen bajo y release suave para evitar click). Sin archivo de
  audio: anda offline en la PWA y no toca `workbox.globPatterns`.
- El `AudioContext` se crea/`resume()` perezosamente en el primer bip; los
  browsers exigen un gesto de usuario previo para reproducir (el staff siempre
  interactua con la app, asi que en la practica suena).

### Silenciar
- Toggle persistido en `localStorage` (`pos-notif-sonido`, default activado).
- Expuesto con un boton-icono (Volume2 / VolumeOff de lucide) en el header del
  `NotificacionesPanel`.
- El bip respeta el toggle: si esta silenciado, no suena.

---

## 4. Perfil doctor: vista restringida

El doctor no debe ver ciertas secciones ni los horarios de otros doctores. Es
guarda de UX; la seguridad real sigue siendo del backend.

### Menu (AppShell)
- Agregar a `NAV_ITEMS` un flag por item (p.ej. `ocultarDoctor?: boolean`).
- Ocultar para DOCTOR: **Deudores, Mensajes, Caja, Gastos, Catalogo**.
- El doctor conserva: Inicio, Agenda, Horarios, Pacientes, Ayuda. Los items
  `soloAdmin` (Reportes, Actividad, Configuracion) siguen ocultos como hoy.
- Tambien ocultar para DOCTOR el widget de estado de turno / "Abrir caja" (linkea
  a /caja).
- Evitar la query del badge de Mensajes (`mensajes-pendientes-count`) para
  doctores (item oculto; ahorra el request).
- SECRETARIA y ADMIN no cambian.

### Rutas (App.tsx)
- Guard `SoloStaff` (permite ADMIN y SECRETARIA), espejo de `AdminRoute`. Si el
  rol no esta permitido, `Navigate to="/agenda"`.
- Envolver las rutas: `caja`, `gastos`, `deudores`, `mensajes`, `catalogo`.
- `AdminRoute` se mantiene para las rutas admin-only.

### Horarios (CalendarioAtencionPage)
- Ya calcula `doctorPropio = doctores.find(d => d.usuarioId === user.id)` para
  rol DOCTOR.
- Para DOCTOR, renderizar **solo su fila** (filtrar la lista a `doctorPropio`)
  tanto en mobile como en desktop.
- Si el usuario DOCTOR no tiene Doctor vinculado (`doctorPropio` undefined),
  mostrar empty state amable en vez de la grilla vacia o la de todos.

---

## Verificacion
- `cd apps/api && npx tsc --noEmit`
- `cd apps/web && npx tsc --noEmit`
- `cd apps/api && npx prisma migrate dev` para la columna nueva (solo dev/local).
- Pruebas manuales: link de reprogramacion end-to-end; bip al entrar una
  notificacion; login como DOCTOR (menu, rutas tipeadas a mano, horarios).

## Fuera de alcance (YAGNI)
- Restriccion por rol a nivel backend de las 5 secciones (es trabajo aparte;
  esta feature es la guarda de UX que pidio el owner).
- Reprogramacion que cambie el servicio (decision: servicio fijo).
- Sonidos configurables / multiples tonos.
