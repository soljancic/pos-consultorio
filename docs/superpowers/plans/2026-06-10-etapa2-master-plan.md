# Etapa 2 — Plan Maestro (Valor Clinico + Solidez Operativa)

> **Estado: ACTIVO (adelantado por decision del owner, 2026-06-10).** El trigger original (piloto 2 semanas) quedo sin efecto: se ejecuta en orden de hitos sin esperar deploy ni piloto. Solo E2-M6 (decision Visitas) requiere datos de uso real — se pospone hasta que haya piloto.
>
> **Metodo:** igual que Etapa 1 — por cada hito se escribe el plan detallado con codigo completo JUSTO ANTES de ejecutarlo (writing-plans contra el codigo vigente), se ejecuta, y se verifica con gate runtime + spec Playwright nuevo. Las mini-specs de abajo fijan el alcance y las decisiones; no son los planes de implementacion.

**Objetivo de la etapa:** que el doctor tenga valor clinico real (historia, recetas, adjuntos) y que la operacion financiera sea a prueba de errores humanos (anulaciones, arqueo ciego, auditoria visible).

**Fuentes:** PLAN.md §10 Etapa 2, modelo.jpeg (entidad Visitas, tratamiento), patrones probados de Baby Spa (reversals, arqueo ciego, actividad), MVP.pdf Etapa 2.

---

## Orden de hitos y dependencias

```
E2-M7: Cancelar / No asistio / Reprogramar (UI+API) ← JUNTO A M1: hoy una cita mal agendada no se puede cancelar
E2-M1: Solidez financiera (reversal de pagos)      ← PRIMERO: el piloto VA a registrar pagos mal
E2-M2: Arqueo de caja ciego                        ← depende de M1 (el arqueo cuenta pagos netos de reversas)
E2-M8: Gastos administrativos                      ← depende de M2 (el arqueo compara efectivo neto de egresos)
E2-M3: Actividad reciente (/actividad)             ← independiente; barato (la tabla logs ya se alimenta)
E2-M4: Historia clinica completa                   ← adjuntos + linea de tiempo + guard duro de roles
E2-M5: Recetas PDF                                 ← depende de M4 (cuelga de la atencion)
E2-M6: Evaluacion entidad Visitas (walk-ins)       ← decision de modelado al final, con datos del piloto
```

Racional del orden: los hitos operativos/financieros (M7, M1-M2, M8) protegen la confianza del piloto en la operacion y los numeros — una cita que no se puede cancelar o un pago mal cargado sin forma de anularlo rompen la agenda y la caja el dia 1. Lo clinico (M4-M5) es el valor nuevo pero puede esperar 2-3 semanas de feedback.

---

## E2-M1 — Anulacion de pagos con asiento de reversa — ✔ EJECUTADO 2026-06-10

Plan detallado: `2026-06-10-e2-m1-reversa-pagos-plan.md`. Verificado: gate-e2m1 5/5, Playwright 13/13, regresion m2/m4/e2m7 verde. Commits 4e6a6dc..dcaf935. Nota de implementacion: la caja del dia del pago original cerrada NO bloquea (responde `advertencia`); la reversa siempre impacta la caja de HOY.

**Regla (PLAN.md §8):** los pagos nunca se borran ni editan; se corrigen con una reversa.

Mini-spec:
- Schema `Pago`: + `anuladoAt DateTime?`, `anuladoPorId String?`, `motivoAnulacion String?`, `reversaDeId String? @unique` (autorelacion: la reversa apunta al original).
- `POST /pagos/:id/anular { motivo }` (ADMIN; SECRETARIA configurable despues): transaccion que (1) crea Pago espejo con monto NEGATIVO y `reversaDeId`, (2) marca el original anulado, (3) restaura `cobro.saldoPendiente` y su estado (COMPLETO→PARCIAL/PENDIENTE), (4) revierte estado de la cita (COBRADO→CON_DEUDA o ATENDIDA segun saldo), (5) incrementa `paciente.deudaTotal`, (6) decrementa la caja DEL DIA DE LA REVERSA (no la historica), (7) log accion PAYMENT con payloads.
- Validaciones: no anular una reversa, no anular dos veces, no anular si la caja del dia del pago original esta cerrada y la diferencia importa (alerta, no bloquea — regla "alerta no bloquea").
- UI: boton anular en los movimientos de CajaPage + en CobroModal (lista de pagos del cobro); fila de reversa en rojo con motivo.
- Gate: anular pago parcial → saldo y deudaTotal restaurados, cita vuelve a CON_DEUDA, caja del dia refleja el negativo, log con antes/despues; reintento de anulacion → 400.

## E2-M2 — Arqueo de caja ciego — ✔ EJECUTADO 2026-06-10

Plan detallado: `2026-06-10-e2-m2-arqueo-ciego-plan.md`. Verificado: gate-e2m2 8/8, Playwright 14/14, regresion verde. Commits 8c2fda0..fa73f3d. Notas: `montoEsperado` se snapshotea al cierre (una reversa posterior mueve totalEfectivo); el modal es ciego pero la pagina de caja sigue mostrando el total de efectivo — ocultarlo a SECRETARIA hasta el cierre queda como mejora futura.

Patron Baby Spa (probado en produccion).

Mini-spec:
- Schema `CajaDiaria`: + `montoDeclarado Decimal?`, `diferencia Decimal?`, `notasCierre String?`, `revisadaPorId String?`, `revisadaAt DateTime?`.
- Cerrar caja pasa a 2 pasos: la secretaria declara el efectivo contado SIN ver el esperado (el modal no muestra totales de efectivo); el sistema calcula `diferencia = declarado - totalEfectivo` y la guarda.
- Si diferencia = 0 → auto-aprobada. Si no → queda "pendiente de revision"; el ADMIN la ve en Caja > Historial con badge y puede aprobar con nota.
- Solo el efectivo participa del arqueo (QR/transferencia/tarjeta son rastreables).
- UI: modal de cierre ciego, badge de diferencia en historial, accion revisar (ADMIN).
- Gate: cierre con declarado exacto → APROBADA; con faltante → diferencia negativa + pendiente; ADMIN aprueba con nota → log.

## E2-M3 — Actividad reciente

- `GET /logs?entidad=&accion=&desde=&hasta=&page=` (ADMIN) sobre la tabla `logs` existente — solo lectura, paginado.
- Pagina `/actividad` (ADMIN): feed agrupado por dia, filtros por tipo, payloadAntes/Despues expandible.
- Sin migracion. Es el hito mas barato y da visibilidad inmediata de lo que pasa en el piloto.

## E2-M4 — Historia clinica completa

Sobre la atencion basica de Etapa 1:
- **Linea de tiempo** en la ficha del paciente: todas las atenciones cronologicas (hoy: filas expandibles de las ultimas 10 citas) — vista dedicada con busqueda.
- **Adjuntos**: el campo `Atencion.adjuntos Json` ya existe. Decision pendiente de infra: almacenar en disco del server vs S3/R2 (Railway: volumen persistente o R2 — definir con el deploy andando). Subida desde AtencionModal, galeria en la ficha.
- **Guard duro por rol**: `@Roles(DOCTOR, ADMIN)` en PUT /atenciones (hoy la UI oculta, el backend no restringe); DOCTOR solo edita atenciones de sus propias citas; agenda del DOCTOR forzada en backend (`doctorId` del token, no del query).
- `proximoControl` accionable: boton "agendar control" que precarga NuevaCitaModal con la fecha.

## E2-M5 — Recetas PDF

- Modelo `Receta` ya existe (atencionId, contenido Json, pdfUrl).
- Generacion server-side (pdfkit o similar) con membrete del consultorio (logoUrl, nombre, telefono, direccion — ya capturados en Configuracion).
- `POST /atenciones/:citaId/recetas` + descarga; boton en AtencionModal.
- Para WhatsApp manual: link de descarga copiable (wa.me con el link).

## E2-M7 — Cancelar / No asistio / Reprogramar (UI + API) — ✔ EJECUTADO 2026-06-10

Plan detallado: `2026-06-10-e2-m7-cancelar-reprogramar-plan.md`. Verificado: jest 10/10, `gate-e2m7.ps1` 8/8, Playwright 12/12. Commits dae337b..d171035. De paso: falso negativo historico de gate-m2 corregido (PS 5.1 y arrays vacios) y suite E2E reparada (selectores rotos por Google auth + role="tab" del pase de UI).

Decision del owner (2026-06-10): reprogramar = **editar fecha/hora en el lugar**, no crear cita nueva.

Mini-spec:
- Maquina de estados (`@pos/types`): agregar `PENDIENTE → NO_ASISTIO` (tambien lo exige el cron NO-SHOW de Etapa 3). `REPROGRAMADA` queda documentado como estado sin uso (no se elimina del enum por compatibilidad con datos existentes).
- `PUT /citas/:id` nuevo (fechaHora, doctorId?, servicioId?, duracionMin?, notas?): permitido solo en PENDIENTE/CONFIRMADA/LLEGO; revalida solape con la query existente de citas.service (excluye CANCELADA/NO_ASISTIO); al reprogramar el estado vuelve a PENDIENTE (hay que re-confirmar); log AGENDA con payloadAntes/Despues.
- Cancelar: `PUT /citas/:id/estado` a CANCELADA + `motivo` opcional en el DTO. Cobro sin pagos → nuevo valor `EstadoCobro.ANULADO` (hoy el enum solo tiene PENDIENTE/PARCIAL/COMPLETO); cobro con pagos → 409 "anular pagos primero" (depende de E2-M1).
- UI: menu "⋯" en CitaCard y CitaDetalleModal con **Reprogramar** (modal fecha/hora/doctor), **Cancelar** (confirmacion + motivo) y **No asistio** (segun maquina de estados). Confirmacion antes de acciones destructivas; colores ya definidos en COLORES_ESTADO (gris cancelada, gris oscuro no-show).
- Gate: cancelar cita sin pagos → cobro ANULADO + log; cancelar con pagos → 409; reprogramar → solape revalidado, estado PENDIENTE, log con antes/despues. Spec Playwright: cancelar y reprogramar desde la agenda.

## E2-M8 — Gastos administrativos — ✔ EJECUTADO 2026-06-11

Plan detallado: `2026-06-11-e2-m8-gastos-plan.md`. Verificado: gate-e2m8 8/8, Playwright 15/15. Nota: los egresos NO reescriben `cajaDiaria` (se computan on-the-fly en /caja/hoy y al cerrar); borrar un gasto antes del cierre corrige el neto solo.

Registro de egresos con categorizacion + KPI en dashboard. Decision del owner (2026-06-10): los gastos en efectivo **descuentan de la caja diaria** (impactan el arqueo ciego de M2; por eso va despues).

Mini-spec:
- Tabla `gastos`: id, consultorioId, fecha, categoria (enum: INSUMOS, SUELDOS, ALQUILER, SERVICIOS, IMPUESTOS, OTROS), monto Decimal, descripcion, personal (texto libre o usuarioId opcional: a quien se pago), cuenta (enum: CAJA_EFECTIVO, BANCO, OTRO), comprobanteUrl?, registradoPorId, deletedAt.
- Endpoints: `GET/POST /gastos`, `PUT /gastos/:id`, `DELETE` soft, `GET /gastos/resumen?desde=&hasta=` (totales por categoria). SECRETARIA registra; solo ADMIN edita/anula.
- Caja: los gastos con cuenta CAJA_EFECTIVO del dia restan del efectivo esperado (`/caja/hoy` expone `totalEgresos`); el arqueo de M2 compara el declarado contra efectivo NETO de egresos.
- UI: pagina `/gastos` (lista con filtros por fecha/categoria + modal de alta, patron PacientesPage/CatalogoPage).
- Dashboard KPI: card "Gastos del mes" + "Resultado neto" (ingresos del mes − gastos del mes) en DashboardPage.
- Gate: gasto en efectivo → `/caja/hoy` refleja el egreso; resumen por categoria suma bien; soft delete restaura el efectivo; SECRETARIA no puede editar (403).

## E2-M6 — Decision: entidad Visitas (walk-ins)

Con 2+ semanas de datos del piloto, decidir si los walk-ins justifican la entidad `Visitas` de modelo.jpeg (cita_id opcional) o si "crear cita en el momento" alcanza. Si alcanza: cerrar el punto en PLAN.md 4b y no construirla. Es una decision, no un feature — entra como spike de medio dia.

---

## Checklist transversal de la etapa

- [ ] Cada hito: plan detallado just-in-time + gate runtime + spec Playwright nuevo en `apps/web/e2e/`
- [ ] PLAN.md §8b (practicas) aplica integro; toda mutacion financiera en transaccion con log
- [ ] Migraciones aditivas (columnas nullable) — el piloto estara en produccion: `prisma migrate deploy`, nunca reset
- [ ] Actualizar PLAN.md y memoria al cierre de cada hito
