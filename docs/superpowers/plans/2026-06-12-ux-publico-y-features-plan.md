# UX publico y features — Implementation Plan

> Estado: IMPLEMENTADO 2026-06-13 (documentado en paralelo a la ejecucion).
> Spec: `docs/superpowers/specs/2026-06-12-ux-publico-y-features-design.md`.
> Un commit por feature, en orden.

**Goal:** 4 features del spec UX publico: (1) calendario mensual estilo Calendly
en el portal, (2) vista Mes en la Agenda, (3) email de resumen al cerrar caja,
(4) landing publica de Consultech en `/`. Requisito del owner: toda la UI pasa
por los skills `ui-ux-pro-max` + `frontend-design`.

**Architecture:** features independientes. (1) y (3) tocan backend + frontend;
(2) y (4) son solo frontend. Sin cambios al modelo salvo `Consultorio.emailCierreCaja`.

---

### Task 1 — Portal: calendario Calendly (commit 0796302) — [x]

- [x] `GET /public/:slug/dias?doctorId=&servicioId=&mes=YYYY-MM` -> `{ dias: string[] }`
  (solo dias con >=1 slot libre). `DoctoresService.getDiasDisponibles`: 2 queries
  (bloques DISPONIBLE + bloqueos del mes; citas no canceladas del mes) y la
  aritmetica de intervalos en memoria por dia (NO itera `getDisponibilidad`).
  Excluye dias pasados; hoy solo si le quedan slots futuros. DTO query con
  class-validator (`mes` regex `^\d{4}-(0[1-9]|1[0-2])$`). Mismo guard que `/slots`.
- [x] `ReservarPage`: mini calendario mensual (date-fns + grilla Tailwind, lunes
  primero) con dias disponibles clickeables, seleccionado solido primary,
  navegacion ‹ › por mes (queryKey `['portal-dias', slug, doctorId, servicioId, mes]`).
  Al elegir dia -> grilla de horarios; al tocar un horario el boton se parte en
  `[hora | Siguiente]`; "Siguiente" revela el form. Mobile-first, 2 columnas en sm+.
- [x] Gate `gate-e25b`: casos 3b (dias del mes contiene el dia sembrado) y 9b
  (doctor que no atiende el servicio -> vacio).

### Task 2 — Agenda: vista Mes (commit a023f47) — [x]

- [x] Nueva vista `mes` en `AgendaPage` (`Vista = lista|dia|semana|mes`), boton en
  el switcher, persistida en el mismo `localStorage`.
- [x] `AgendaMesGrid`: grilla 7 columnas (lunes primero) x 4-6 filas; celda con
  numero del dia + hasta 3 chips (hora + apellido, color del doctor) + "+N mas";
  click en el dia -> vista Dia; dias fuera del mes en gris, hoy resaltado.
- [x] Sin backend nuevo: `/citas?fecha=&hasta=` sobre la grilla visible, queryKey
  `['citas','mes', mesStr, doctorId]`. Navegacion ‹ › de a un mes.
- [x] E2E `agenda-vistas`: paso que cambia a Mes y ve la cita sembrada.

### Task 3 — Email de cierre de caja (commit 4e421a2) — [x]

- [x] Schema `Consultorio.emailCierreCaja String?` + migracion `consultorio_email_cierre_caja`.
- [x] Configuracion: input "Email para cierres de caja" (DTO `@IsEmail` `@IsOptional`
  + `@ValidateIf((o)=>o.emailCierreCaja!=='')` para poder limpiar con `''`).
- [x] `CajaService.cerrar`: tras la transaccion, si hay email envia
  `MailService.htmlCierreCaja` fire-and-forget (un fallo de Resend no rompe ni
  demora el cierre). Contenido: turno, quien abrio/cerro, monto inicial, ingresos
  por forma de pago, gastos, esperado vs contado + diferencia, cantidad de cobros.
  Montos desde Decimal (nunca float). Reabrir y re-cerrar envia otro email.
- [x] Gate `gate-e2m9`: casos 5b (cierre OK con email configurado) y 9c (limpiar
  el campo, re-cierre OK).

### Task 4 — Landing Consultech en `/` (commit 4ea7969 + rediseno e526048) — [x]

- [x] Routing: `/` -> `HomeGate` (con sesion -> /inicio, sin sesion -> `LandingPage`);
  Dashboard se muda a `/inicio`; POS bajo layout route sin path (URLs sin cambios);
  nav "Inicio" -> /inicio. E2E `landing.spec`.
- [x] `LandingPage` estatica (sin API). Rediseno "clinical tech" (commit e526048):
  hero oscuro luminoso con auroras + grilla, preview del producto en glass, titulo
  con gradiente, cards glass, 3 pasos, CTA con halo, footer "by Toptech". Usa el
  isotipo (visible en dark) + wordmark; keyframes CSS con prefers-reduced-motion.

**Verificacion final:** tsc api/web limpios; gates e25b/e2m9 verdes en vivo; suite
E2E 20/20. Docs: PLAN.md items 2, 47, 52, 53 + SIGUIENTE PASO.
