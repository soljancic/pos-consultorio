# Calendario de Atencion (E2.5a + f2) — Implementation Plan

> Estado: IMPLEMENTADO 2026-06-11 (plan documentado retroactivamente; el detalle
> vivo esta en PLAN.md item 6). Spec:
> `docs/superpowers/specs/2026-06-10-calendario-atencion-design.md`.

**Goal:** horarios reales por doctor (serie semanal + fecha limite, bloqueos),
scheduler semanal, edicion por alcance, y citas validadas contra el horario.

**Architecture:** modelos `Disponibilidad` + `SerieDisponibilidad` (materializada,
tope 400, horas "HH:mm" comparadas lexicograficamente). Sin calendario = modo
legacy (no rompe gates).

---

- [x] Schema Disponibilidad/SerieDisponibilidad + migracion.
- [x] `/disponibilidades` CRUD con alcance `uno|serie|desde` (ADMIN o el propio doctor).
- [x] Pagina `/calendario-atencion` (nav "Horarios"); `DisponibilidadModal` con
  presets + plantillas.
- [x] Citas validan contra el horario: bloqueos 409; fuera de horario 400 solo si el
  doctor tiene bloques DISPONIBLE.
- [x] f2a servicios-por-doctor (M2M; lista vacia = atiende todos; el portal filtra
  y rechaza). Gate `gate-doctor-servicios`.
- [x] f2b plantillas de horario nombradas (`plantillas_horario`). Gate `gate-plantillas`.
- [x] `GET /doctores/:id/disponibilidad` reescrito sobre el modelo nuevo (base del
  portal). Gate `gate-slots`.

**Verificacion:** gates `gate-e25a`, `gate-doctor-servicios`, `gate-plantillas`,
`gate-slots` verdes; jest + Playwright en regresion.
