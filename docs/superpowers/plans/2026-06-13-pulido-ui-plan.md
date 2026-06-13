# Pulido de UI — Implementation Plan

> Estado: IMPLEMENTADO 2026-06-13. Spec:
> `docs/superpowers/specs/2026-06-13-pulido-ui-design.md`.

**Goal:** subir la percepcion de calidad del frontend: landing, modales, estados
vacios, catalogo, UX de portal/agenda y responsive movil.

**Architecture:** componentes compartidos reutilizables (`ModalHeader`,
`EmptyState`, `DoctorAvatar`) + keyframes globales en `index.css`; cambios de
clase aplicados de forma consistente (sed para los 21 modales).

---

- [x] Regla UI: skills `ui-ux-pro-max` + `frontend-design` obligatorios; CLAUDE.md
  + memoria (commit 463097e).
- [x] Landing rediseno tech (commit e526048).
- [x] Modales: scrim+blur+pop global por sed (commit 6f08ee8); `ModalHeader` en
  diarios (d8340c4), catalogo (57efcdc) y el resto (9b89922); subtitulo movil (dab8f26).
- [x] `EmptyState`: paginas principales (361dcad) + Mensajes/Actividad/Calendario/
  Agenda-Dia (c073284).
- [x] Catalogo en 2 tabs (becebd8).
- [x] Portal: columnas dinamicas + Siguiente con scroll + refresh 60s (60e59b4).
- [x] Agenda: auto-refresco 30s (d8d7e21) + selector de orden Estado/Hora (67925ee).
- [x] Revision responsive a 390px (capturas) + fix subtitulo `line-clamp-2`.

**Verificacion:** tsc api/web limpios; suite E2E 20/20.
