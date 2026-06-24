# Diseño: `mostrarEnBooking` + cifrado corto de IDs en el link de reserva

Fecha: 2026-06-24
Estado: aprobado (pendiente plan de implementación)

## Problema

Dos necesidades sobre el portal público de reservas (`/reservar/:slug`):

1. **Servicios ocultos del display.** El consultorio tiene servicios que el
   paciente NO debe poder elegir desde el dropdown público (ej. "Reconsulta":
   no se quiere que un paciente elija entre Consulta y Reconsulta). Pero sí se
   debe poder reservar ese servicio si el consultorio manda un link directo con
   ese servicio precargado (`&servicio=<reconsulta>`).

2. **Link prolijo / no enumerable.** Hoy el link de reserva manda los IDs de
   doctor y servicio como números crudos (`?doctor=5&servicio=7`). Se quiere
   cifrarlos cortos (`?doctor=aB2k&servicio=x9W1`). El token del paciente
   (`?p=`) ya es opaco; solo doctor/servicio viajan en claro.

## Estado actual (verificado)

- `Servicio` tiene `activo Boolean @default(true)`. No existe `mostrarEnBooking`.
- Portal público (`apps/api/src/modules/portal/`):
  - `GET /public/:slug` (`info`) devuelve `doctores` y `servicios` para el display.
  - `GET /public/:slug/dias`, `/slots`, `POST /public/:slug/reservas` reciben
    `doctorId`/`servicioId` como **números** (query/body).
  - Ya existe token opaco para datos del paciente (`?p=` → `/prefill/:token`) y
    para reprogramar/cancelar; NO para doctor/servicio.
- El link se genera en `apps/web/src/features/agenda/NuevaCitaModal.tsx`
  → `buildLinkReserva()`:
  ```js
  if (doctorId)   query.set('doctor', doctorId)      // id numérico
  if (servicioId) query.set('servicio', servicioId)  // id numérico
  if (paciente)   query.set('p', tokenPortal.token)  // token opaco
  ```
- El link se consume en `apps/web/src/features/portal/ReservarPage.tsx`
  (lee `?doctor=` / `?servicio=` y los usa como string numérico).

## Decisiones tomadas (con el owner)

- **Esquema de cifrado: Sqids** (sin BD, reversible, mismo id → mismo código).
- **Alcance del cifrado: Opción C (liviana, front-only).** El front codifica al
  generar el link y decodifica al cargar ReservarPage; de ahí todo sigue
  numérico como hoy. El backend NO decodifica (menos superficie de cambio).
- **El flag y el bypass son cosas separadas:** ocultar del display ≠ bloquear la
  reserva. La lista pública filtra por el flag; la validación de reserva solo
  exige consultorio + `activo`.
- **Cifrar es ofuscación, no seguridad.** Quien tenga el código puede reservar
  igual; está aceptado porque las citas entran como PENDIENTE y el consultorio
  confirma. La seguridad real la sigue dando el backend validando pertenencia.

## Diseño

### Parte 1 — Flag `mostrarEnBooking`

**Modelo (`apps/api/prisma/schema.prisma`):**
```prisma
model Servicio {
  ...
  mostrarEnBooking Boolean @default(true)
  ...
}
```
- Migración no destructiva (`prisma migrate dev`, solo en dev/local; producción
  la aplica el owner). Los servicios existentes quedan visibles por el default.

**Backend (`portal.service.ts`):**
- `info()` filtra `servicios` a `mostrarEnBooking: true` (además de `activo`).
- `dias()` / `slots()` / `reservar()` **NO** se tocan respecto al flag: siguen
  validando solo que el servicio pertenezca al consultorio y esté `activo`. Así
  un servicio oculto reserva igual cuando llega por el `&servicio=` del link.

**Backend — resolver nombre del servicio oculto:**
- Nuevo `GET /public/:slug/servicio/:id` (`@Public`, throttle como los otros
  endpoints públicos, ej. 30/60s). Valida consultorio + `activo` y devuelve
  `{ id, nombre, duracionMin }`. Toma id **numérico** (el front ya decodificó).
- Tradeoff aceptado: permite enumerar nombres de servicios por id. Riesgo bajo
  (un nombre como "Reconsulta" no es secreto).

**Frontend:**
- `ServicioModal` (form de crear/editar servicio): toggle "Mostrar en reservas
  online" (patrón `role="switch"` ya usado en el proyecto, ej. DoctorModal).
  Default `true`. DTO del servicio incluye `mostrarEnBooking` opcional.
- `ReservarPage`: cuando hay `?servicio=<id>` que NO está en `info.servicios`
  (porque está oculto), pedir `GET /public/:slug/servicio/:id` para mostrarlo
  como servicio preseleccionado (nombre + duración).
- El filtrado de doctores por servicio en ReservarPage (`d.servicioIds.includes`)
  no cambia: opera sobre el id numérico ya decodificado.

### Parte 2 — Cifrado Sqids (front-only)

**Librería:** `sqids` en `apps/web`. (Confirmar API exacta al implementar; uso
previsto: `new Sqids({ alphabet, minLength })`, `.encode([n]) -> string`,
`.decode(s) -> number[]`.)

**Util nuevo (`apps/web/src/lib/`):**
```ts
// codec.ts (o dentro de lib/portal)
// alphabet: string fijo barajado (o el default de Sqids). Valor concreto al implementar.
const sqids = new Sqids({ minLength: 4, alphabet: ALFABETO })
export function encodeId(id: number): string { return sqids.encode([id]) }
export function decodeId(code: string): number | null {
  const out = sqids.decode(code)
  return out.length === 1 ? out[0] : null
}
```
- `minLength` ~4 para que ids chicos salgan como `aB2k` y no 1-2 chars.
- Salt/alfabeto fijo (config en el front; al ser ofuscación, vive en el bundle).
- doctor y servicio se codifican por separado (`encodeId(doctorId)` y
  `encodeId(servicioId)`). Mismo número da el mismo código en ambos params; es
  inofensivo porque son params distintos.

**Encode (único lugar) — `NuevaCitaModal.buildLinkReserva()`:**
```js
if (doctorId)   query.set('doctor', encodeId(Number(doctorId)))
if (servicioId) query.set('servicio', encodeId(Number(servicioId)))
if (paciente)   query.set('p', tokenPortal.token)   // sin cambios
```

**Decode (único lugar) — `ReservarPage`:**
- Al leer `params.get('doctor')` / `params.get('servicio')`, pasarlos por
  `decodeId`. Si `decodeId` devuelve `null` (código inválido/manipulado), tratar
  como "sin precarga" (no romper: el paciente elige normalmente).
- El estado interno (`doctorId`, `servicioId`) sigue siendo el string numérico,
  igual que hoy. El resto de ReservarPage no cambia.

## No-objetivos (YAGNI)

- NO hay flag para ocultar doctores (solo servicios). El doctor se codifica solo
  por cosmética.
- NO se cifra el tráfico de la API ni se decodifica en el backend (es Opción C).
- NO se firma/manipula-protege el link (no es token HMAC).
- NO se toca el token de paciente/reprogramar/cancelar.

## Manejo de errores

- `decodeId` con código inválido → `null` → ReservarPage ignora la precarga (el
  paciente elige a mano). No se muestra error duro por un link mal pegado.
- `GET /public/:slug/servicio/:id` con id de otro consultorio / inactivo / inexistente
  → 404; ReservarPage cae al flujo normal (sin preselección).
- Reserva de un servicio oculto vía link: permitida (PENDIENTE), igual que un
  servicio visible.

## Testing

- **API gate (`scripts/gate-*.ps1`):** un servicio con `mostrarEnBooking: false`
  NO aparece en `GET /public/:slug` (`info`), pero `GET /public/:slug/dias` y
  `POST /public/:slug/reservas` con ese servicio SÍ funcionan (bypass). El nuevo
  `GET /public/:slug/servicio/:id` devuelve nombre para uno visible y para uno
  oculto, y 404 para uno de otro consultorio.
- **Codec:** round-trip `decodeId(encodeId(n)) === n` para varios n, y
  `decodeId('basura') === null`. Verificación vía script de un solo uso (no hay
  infra de unit test en el front; no se agrega vitest por esto).
- Regresión: gates/specs previos del portal siguen verdes.

## Archivos afectados (estimado)

- `apps/api/prisma/schema.prisma` (+ migración)
- `apps/api/src/modules/portal/portal.service.ts` (filtro `info` + `servicio()`)
- `apps/api/src/modules/portal/portal.controller.ts` (endpoint `servicio/:id`)
- `apps/api/src/modules/servicios/*` (DTO/servicio: `mostrarEnBooking`)
- `apps/web/src/lib/` (nuevo `codec.ts` con Sqids)
- `apps/web/src/features/agenda/NuevaCitaModal.tsx` (`buildLinkReserva`)
- `apps/web/src/features/portal/ReservarPage.tsx` (decode + resolver nombre)
- `apps/web/src/features/catalogo/ServicioModal.tsx` (toggle)
- `scripts/gate-*.ps1` (nuevo gate)
