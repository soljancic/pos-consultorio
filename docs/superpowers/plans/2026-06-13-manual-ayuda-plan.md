# Manual de usuario in-app (/ayuda) — Implementation Plan

> **For agentic workers:** usar superpowers:executing-plans / subagent-driven-development.
> Spec: `docs/superpowers/specs/2026-06-13-manual-ayuda-design.md`. Estado: PENDIENTE.

**Goal:** seccion `/ayuda` dentro de la app, organizada por rol (Admin/Secretaria/
Doctor/Caja), con pasos numerados y capturas de pantalla. Data-driven y regenerable.

**Architecture:** feature solo-frontend. Contenido en un dato tipado
(`features/ayuda/contenido.ts`) renderizado por `AyudaPage`. Capturas estaticas en
`public/ayuda/` generadas por un script Playwright que siembra datos via API.
Sin backend nuevo.

**Skills:** la UI pasa por `ui-ux-pro-max` + `frontend-design` (regla del proyecto).

---

### Fase 1 — Estructura y navegacion

- [ ] Tipo `TemaAyuda { id, titulo, intro?, pasos: string[], imagen?: string }` y
  `SeccionAyuda { rol: Rol, label, icono, temas: TemaAyuda[] }` en `features/ayuda/`.
- [ ] `contenido.ts` con las 4 secciones y 1 tema real por rol (placeholder de imagen).
- [ ] `AyudaPage`: layout 2 columnas (indice de roles+temas / contenido), anclas por
  `tema.id`, preselecciona el rol del usuario (`auth.store`), selector para cambiar.
  Responsive: indice colapsable en movil. Reusa tokens (cardUI, EmptyState si hace falta).
- [ ] Ruta `/ayuda` en `App.tsx` bajo `AppShell`; item "Ayuda" (`HelpCircle`) en el
  nav (visible a todos) + boton "?" en la topbar.
- [ ] Verificacion: tsc web; E2E corto (`/ayuda` carga, cambia de rol, ve un tema).

### Fase 2 — Contenido (texto, sin imagenes aun)

- [ ] Escribir todos los temas del outline del spec, por rol, con pasos numerados
  en espanol con tildes. Reutilizar nombres de botones/pantallas reales del producto.
- [ ] Marcar cada tema con el nombre de la captura que va a necesitar (`imagen`).

### Fase 3 — Capturas

- [ ] Script Playwright (`apps/web/e2e/capturar-ayuda.spec.ts` o
  `scripts/capturar-ayuda.ts`): registra consultorio, siembra servicios/doctores/
  pacientes/cita via API, inyecta token, navega cada flujo y saca screenshot a
  `apps/web/public/ayuda/<id>.png` (viewport desktop + recorte de la zona util).
- [ ] Cablear `imagen` en `contenido.ts`; documentar como regenerar (un comando).

### Fase 4 — Pulido

- [ ] Deep-link por ancla (`/ayuda#cobrar-una-cita`), boton "copiar enlace" opcional.
- [ ] Revision responsive a 390px; estados de carga si las imagenes tardan.
- [ ] (Opcional) buscador simple por titulo de tema.

**Entregable:** `/ayuda` navegable por rol con texto + capturas; PLAN.md gana un item
de roadmap (Plataforma). Sin migraciones ni backend.
