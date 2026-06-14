---
target: DashboardPage (post-fix)
total_score: 34
p0_count: 0
p1_count: 0
timestamp: 2026-06-14T20-27-02Z
slug: apps-web-src-features-dashboard-dashboardpage-tsx
---
# Critique: DashboardPage (post-fix re-run)

Target: apps/web/src/features/dashboard/DashboardPage.tsx | Register: product | Tone goal: calm & trustworthy

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Skeletons + role=status/aria-busy on every async section |
| 2 | Match System / Real World | 4 | "Buen dia" accent fixed; clean domain Spanish |
| 3 | User Control and Freedom | 3 | Read-only screen; retry paths added |
| 4 | Consistency and Standards | 4 | Reuses cardUI token; thead matches DeudoresPage pattern |
| 5 | Error Prevention | 3 | No user input here; n/a |
| 6 | Recognition Rather Than Recall | 4 | Proximas citas table now has column headers |
| 7 | Flexibility and Efficiency | 3 | Table rows keyboard-navigable (Enter/Space + focus ring); no shortcuts |
| 8 | Aesthetic and Minimalist Design | 3 | Hierarchy improved via emphasized actionable tiles; still a metric strip |
| 9 | Error Recovery | 4 | Inline error + Reintentar on every panel |
| 10 | Help and Documentation | 2 | Self-explanatory, no contextual affordances |
| Total | | 34/40 | Good - solid; remaining gaps are polish-tier |

## Anti-Patterns Verdict

Detector clean (exit 0, []). No banned patterns. The 5-stat strip remains but now reads as hierarchy (actionable tiles En espera + Por cobrar carry tinted backgrounds; informational tiles stay neutral), which softens the templated-dashboard tell.

## What changed since the 25/40 run

- [P1 fixed] Loading + error states on all five queries: skeleton tiles/lines while pending, inline PanelError with Reintentar on isError, role=status/aria-busy for screen readers. "Cargando" is now distinct from "cero" and from "fallo".
- [P1 fixed] Proximas citas rows keyboard-navigable (tabIndex, role=link, Enter/Space handler, focus-visible ring) and table gained a thead with Hora/Paciente/Doctor/Servicio.
- [P2 fixed] Hierarchy: actionable metrics (En espera, Por cobrar) emphasized with tinted card backgrounds; informational ones recede.
- [P2 fixed] Month money values bumped from text-xs muted-gray to font-medium foreground; Resultado neto promoted to text-sm.
- [P3 fixed] Por cobrar retoned off destructive red to primary (pending revenue, not an error); Citas hoy moved to neutral.
- [Minor] "Buen dia" -> "Buen dia" accent; StatCard now composes cardUI; empty "Proximas citas" shows an EmptyState instead of vanishing.

## Remaining (polish-tier)

- No keyboard shortcuts / on-demand refresh (Alex persona); stat tiles still not clickable into filtered views.
- No help/documentation affordances on the screen.
- No entrance motion (intentionally skipped to preserve the calm register; content visible by default).
- If caja-historial or gastos-resumen fail, month KPIs still render as 0 rather than an error (secondary data; main panels handle errors).
