# Portal publico de agendamiento (E2.5b) — Implementation Plan

> Estado: IMPLEMENTADO 2026-06-11/12 (plan documentado retroactivamente; el detalle
> vivo esta en PLAN.md item 7). Spec:
> `docs/superpowers/specs/2026-06-10-portal-agendamiento-design.md`.

**Goal:** portal tipo Calendly en `/reservar/:slug`: el cliente elige servicio,
profesional, dia y hora con disponibilidad real y reserva sin auth.

**Architecture:** `Consultorio.slug`/`portalActivo` + `Cita.origen` (INTERNO/PORTAL).
Modulo `portal` con superficie publica (`@Public`, throttle por ruta). El
`consultorioId` se deriva SIEMPRE del slug; las respuestas no exponen datos de
pacientes ni de la agenda (solo horas libres).

---

- [x] Schema: slug/portalActivo en Consultorio, origen en Cita + migracion.
- [x] `GET /public/:slug` (info), `/slots`, `POST /reservas` (match paciente por
  telefono sin revelar existencia; cita PENDIENTE origen PORTAL con createdBy =
  primer ADMIN). Throttle 30/60/10 por minuto.
- [x] `ReservarPage` (wizard mobile-first sin AppShell). Configuracion con slug +
  toggle + link copiable.
- [x] Links precargados: `?doctor= ?servicio= ?p=<portalToken opaco>`; los datos
  personales NUNCA viajan en la URL (`GET /public/:slug/prefill/:token`). Check
  "Actualizar mis datos" opt-in para sincronizar el kardex.
- [x] Estado SOLICITADA: las reservas del portal nacen SOLICITADA; la secretaria
  acepta (->PENDIENTE, email automatico) o cancela. `filtrarSlotsPasados`.
- [x] f2: el doctor solo ofrece sus servicios (409 si no atiende). QR publico
  `/public/:slug/qr`. (El calendario Calendly `/dias` se sumo en el lote UX publico.)

**Verificacion:** gate `gate-e25b` (incl. consultorioId forjado 400, match sin
duplicar, email obligatorio, QR, slots pasados); E2E del portal en regresion.
