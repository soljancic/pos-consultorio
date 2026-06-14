---
target: AgendaPage (post-fix)
total_score: 36
p0_count: 0
p1_count: 0
timestamp: 2026-06-14T21-20-01Z
slug: apps-web-src-features-agenda-agendapage-tsx
---
# Critique: AgendaPage (post-fix re-run)

Target: apps/web/src/features/agenda/AgendaPage.tsx | Register: product | Tone: calm & trustworthy

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Loading + 30s refresh + per-vista error states |
| 2 | Match System / Real World | 4 | Domain Spanish + calendar metaphors |
| 3 | User Control and Freedom | 4 | CitaCard menu now closes with Escape |
| 4 | Consistency and Standards | 4 | CitaCard reuses cardUI |
| 5 | Error Prevention | 4 | transicionValida + confirm modals |
| 6 | Recognition Rather Than Recall | 3 | Grids still color-only at a glance (no legend) |
| 7 | Flexibility and Efficiency | 3 | No keyboard nav shortcuts |
| 8 | Aesthetic and Minimalist Design | 4 | Clean grids |
| 9 | Error Recovery | 4 | cambiarEstado onError banner + query retry |
| 10 | Help and Documentation | 2 | No legend/contextual docs |
| Total | | 36/40 | Excellent |

## Anti-Patterns Verdict
Detector clean (exit 0, []). No tells.

## What changed since 31/40
- [P1 fixed] cambiarEstado mutation: onError sets a dismissible page-level alert banner (role=alert); onSuccess clears it. Offline/failed state changes no longer silent.
- [P1 fixed] All three citas queries (dia/lista, semana, mes) handle isError with a CargaError retry block instead of a false-empty day.
- [P2 fixed] CitaCard action menu closes on Escape (keydown handler in the open-menu effect).
- [Minor fixed] CitaCard composes cardUI instead of inline classes.

## Remaining (polish-tier)
- No estado/doctor color legend in grids (label reachable via badge/detail/tooltip; full 10-estado legend risks clutter).
- No keyboard navigation shortcuts (prev/next day, today).
- Vista toggle is icon-only below sm breakpoint (has title; not surfaced on touch).
