---
target: AgendaPage
total_score: 31
p0_count: 0
p1_count: 2
timestamp: 2026-06-14T21-17-26Z
slug: apps-web-src-features-agenda-agendapage-tsx
---
# Critique: AgendaPage (+ grids, CitaCard)

Target: apps/web/src/features/agenda/AgendaPage.tsx | Register: product | Tone: calm & trustworthy

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Loading text + 30s refresh, but no error state on the 4 queries |
| 2 | Match System / Real World | 4 | Excellent domain Spanish + calendar metaphors |
| 3 | User Control and Freedom | 3 | Vista persisted, Hoy/nav present; CitaCard menu has no Esc-to-close |
| 4 | Consistency and Standards | 3 | CitaCard re-implements cardUI inline |
| 5 | Error Prevention | 4 | transicionValida blocks invalid state moves; confirm modals |
| 6 | Recognition Rather Than Recall | 3 | Grids encode estado/doctor by color with no legend |
| 7 | Flexibility and Efficiency | 3 | Persistence, filters, click-empty-slot; no keyboard nav shortcuts |
| 8 | Aesthetic and Minimalist Design | 4 | Clean, well-composed grids |
| 9 | Error Recovery | 2 | cambiarEstado mutation has no onError - silent failure |
| 10 | Help and Documentation | 2 | Tooltips help; no color legend |
| Total | | 31/40 | Good - gaps are all about what happens when things fail |

## Anti-Patterns Verdict
Detector clean (exit 0, []) across all 5 files. No tells. Pabau-style grids are domain-appropriate and quiet.

## Priority Issues
[P1] State-change mutation fails silently: cambiarEstado.mutate has onSuccess but no onError. Offline PWA -> advancing a cita can fail with zero feedback. Fix: onError + dismissible alert banner.
[P1] No error state on citas queries: failed fetch defaults to [] -> "No hay citas" (failure disguised as empty day). Fix: per-vista isError -> inline retry.
[P2] CitaCard action menu can't close with Escape. Fix: Escape handler.
[P3] Grids communicate estado/doctor by color alone (no legend); mitigated by label via badge/detail/tooltip. Noting only.
[P3] CitaCard re-implements cardUI inline - minor drift.

## Persona Red Flags
Sam (a11y): CitaCard menu no Esc; grids color-at-a-glance. Riley: offline state change silently no-ops; failed fetch looks empty. Casey: vista toggle icon-only below sm.
