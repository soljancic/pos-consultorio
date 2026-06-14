---
target: DashboardPage
total_score: 25
p0_count: 0
p1_count: 2
timestamp: 2026-06-14T20-19-24Z
slug: apps-web-src-features-dashboard-dashboardpage-tsx
---
# Critique: DashboardPage

Target: apps/web/src/features/dashboard/DashboardPage.tsx | Register: product | Tone goal: calm & trustworthy

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | No loading state; data flashes from zero/empty to real values on every load |
| 2 | Match System / Real World | 3 | Good domain Spanish, but "Buen dia" is missing its accent (dia -> dia) |
| 3 | User Control and Freedom | 3 | Read-only screen; clear links out to /deudores and /agenda |
| 4 | Consistency and Standards | 3 | StatCard re-implements cardUI inline instead of the shared token |
| 5 | Error Prevention | 3 | No user input here; n/a in practice |
| 6 | Recognition Rather Than Recall | 3 | Proximas citas table has no column headers |
| 7 | Flexibility and Efficiency | 2 | Table rows click-only; no keyboard path, no shortcuts |
| 8 | Aesthetic and Minimalist Design | 3 | Clean/restrained, but flat hierarchy + reflex 5-stat strip |
| 9 | Error Recovery | 1 | Zero error handling; failed query silently renders as all zeros / no debt |
| 10 | Help and Documentation | 2 | Self-explanatory, but no contextual affordances |
| Total | | 25/40 | Acceptable - solid foundation, real gaps in loading/error/a11y |

## Anti-Patterns Verdict

Partly AI-looking. No gradient text, glassmorphism, eyebrows, or side-stripes (detector clean, exit 0, []). The 5-across icon-stat-card strip is the most dashboard-by-reflex element; defensible (real metrics) but visually undifferentiated. Slop risk is compositional (flat hierarchy, templated metric strip), not banned markup.

## Overall Impression

Clean, honest dashboard that respects the design system (tabular-nums, semantic tones, focus rings). Biggest opportunity is trust under load: page can't distinguish "fetching" from "genuinely zero," and a failure looks like a quiet day.

## What's Working

- Money presented with care: tabular-nums, blind-arqueo masking, signed resultadoNeto.
- Restraint fits the brand: no gradient hero, glass, or kickers.
- Deudas panel uses color + state well (3xl destructive figure, calm accent for none).

## Priority Issues

[P1] No loading or error states on any of the five queries. Defaults render zeros/"sin deudas" before data, and a failed request looks identical to a real empty result. Fix: skeletons while loading, inline error + retry on isError. Command: /impeccable harden

[P1] Proximas citas rows are click-only, not keyboard accessible. tr onClick has no tabIndex/role/key handler/focus ring; table has no thead. Fix: real link/button target, focus-visible ring, column headers. Command: /impeccable harden

[P2] Flat visual hierarchy. h1 greeting and five stat numbers all text-2xl bold; eye lands nowhere. Fix: vary weight, promote action-relevant metrics (en espera, por cobrar). Command: /impeccable layout

[P2] Small muted-gray money rows fight the confidence-around-money principle. Ingresos/Gastos del mes are text-xs muted-foreground. Fix: bump values toward foreground, verify >=4.5:1, promote resultado neto. Command: /impeccable typeset

[P3] "Por cobrar" uses destructive red tone; it is pending revenue, not an error. Fix: warning/info tone, reserve red for deudas. Command: /impeccable colorize

## Persona Red Flags

Sam (a11y): proximas citas rows not keyboard reachable, no focus indicator, no thead, no aria-live on load.
Riley (stress): false-empty dashboard on slow/failed loads stays silent; empty proximas section vanishes instead of reassuring.
Alex (power user): stat tiles are dead ends, not clickable into filtered views; no on-demand refresh.

## Minor Observations

- "Buen dia" -> "Buen dia" accent (CLAUDE.md rule).
- StatCard hand-rolls cardUI instead of importing it (DRY drift).
- Empty proximas citas hides whole section; an empty state would read as intentional.
- No motion; a subtle reduced-motion-aware stat fade-in would feel deliberate.

## Questions to Consider

- What is the one number the owner opens this screen to see?
- Should stat tiles be doorways into filtered views?
- When a query fails, is "silently render zero" ever acceptable for a money/debt screen?
