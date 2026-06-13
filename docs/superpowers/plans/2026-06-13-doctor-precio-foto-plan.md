# Precio por doctor/servicio + foto del doctor — Implementation Plan

> Estado: IMPLEMENTADO 2026-06-13. Spec:
> `docs/superpowers/specs/2026-06-13-doctor-precio-foto-design.md`.

**Goal:** (1) precio override por doctor y servicio que el cobro toma al crear la
cita; (2) foto del doctor que sale en agenda dia y horarios (fallback al circulo
de color).

**Architecture:** (1) tabla ADITIVA `doctor_servicio_precios` (no toca el M2M
implicito doctor-servicio). (2) `Doctor.fotoUrl` + upload a Cloudinary (patron del
logo) + componente compartido `DoctorAvatar`.

---

### Task 1 — Precio override (commit 53406de) — [x]

- [x] Schema: modelo `DoctorServicioPrecio` (unique doctorId+servicioId) +
  relaciones en Doctor/Servicio. Migracion `20260613190000_doctor_servicio_precio`.
- [x] `SetServiciosDto` + `PrecioServicioDto` (nested, `@ValidateNested`/`@Type`).
  `setServicios(consultorioId, doctorId, servicioIds, precios)` reconcilia overrides
  (reemplazo completo, solo servicios del tenant) en `$transaction`. `findAll` y
  `setServicios` devuelven `preciosServicio`. Controller pasa `dto.precios`.
- [x] `citas.create`: lookup `doctorServicioPrecio` por (doctorId, servicioId);
  `total/saldoPendiente = override ?? servicio.precioBase`. Mismo override en el
  recalculo de `reprogramar` (citas.service) y `registrar atencion` (atenciones.service).
- [x] `DoctorModal`: input de precio por servicio marcado (placeholder = precioBase);
  payload manda solo los con precio.
- [x] Gate `gate-doctor-servicios` casos 10-13 (+ fix caso 6 stale: la reserva del
  portal exige email).

### Task 2 — Foto del doctor (commit 459151a) — [x]

- [x] `@pos/types` Doctor con `fotoUrl` (`pnpm build`). Schema `Doctor.fotoUrl
  String?` + migracion `20260613200000_doctor_foto`.
- [x] `POST /doctores/:id/foto` (ADMIN, `FileInterceptor`) -> `doctores.service.subirFoto`
  (Cloudinary folder `doctores`, public_id `doctor-{consultorioId}-{doctorId}` con
  overwrite, valida mime JPG/PNG/WebP + 5 MB). Guarda `fotoUrl`.
- [x] `DoctorAvatar` (components/shared): img si hay foto, si no circulo de color con
  iniciales. Cableado en `AgendaDiaGrid`, `CalendarioAtencionPage`, cards del Catalogo.
- [x] `DoctorModal`: preview + boton subir/cambiar; la foto se sube tras crear/editar
  el doctor (FormData a `/doctores/:id/foto`).

**Verificacion:** tsc api/web limpios; gate-doctor-servicios verde; suite E2E 20/20.
**Deploy:** correr migraciones `doctor_servicio_precio` y `doctor_foto`.
