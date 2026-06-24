# Diseño: Prepago de citas (cobrar antes de la atención)

Fecha: 2026-06-24
Estado: aprobado (pendiente plan de implementación)

## Problema

Hoy no se puede cobrar una cita antes de atenderla. El botón Cobrar solo
aparece cuando la cita está `ATENDIDA` o `CON_DEUDA`, y `registrarPago` empuja
la cita a `COBRADO`/`CON_DEUDA`. Lo único "prepago" que existe es el flag
`requierePrepago` del paciente (E3 item 11): una alerta no bloqueante al
agendar a un paciente con historial de no-shows.

Se quiere poder cobrar (total o seña) en las etapas previas a la atención, sin
marcar la cita como cobrada hasta que se atienda.

## Estado actual (verificado)

- Cada cita crea su `Cobro` al agendarse (`citas.service.ts`), con
  `saldoPendiente = total`, estado `PENDIENTE`. El cobro de una cita futura ya
  existe (no cuenta como deuda real).
- "Deuda real" = saldo de cobros cuya cita es `ATENDIDA`/`CON_DEUDA`
  (`cobros.service.ts`). Las citas futuras con cobro PENDIENTE NO son deuda.
- `registrarPago` (`cobros.service.ts`): valida cobro no `COMPLETO`/`ANULADO`
  y caja abierta; luego setea `cita.estado` a `COBRADO` (saldo 0) o `CON_DEUDA`
  (parcial). NO valida el estado de la cita.
- El botón Cobrar en la UI solo aparece en `ATENDIDA`/`CON_DEUDA`
  (`CitaCard.tsx`).
- Cancelar / no-show: el cobro pasa a `ANULADO` **sin revertir los pagos**
  (`citas.service.ts`, `ESTADOS_ANULAN_COBRO`). Reabrir (→ PENDIENTE) revive el
  cobro a `PENDIENTE`.
- Existe `anularPago` (`cobros.service.ts`): reversa con doble entrada (saca la
  plata de caja). Reutilizable para devoluciones.
- Máquina de estados (`@pos/types`): SOLICITADA → PENDIENTE → CONFIRMADA →
  LLEGO → EN_ATENCION → ATENDIDA → COBRADO/CON_DEUDA. `ATENDIDA → COBRADO` y
  `ATENDIDA → CON_DEUDA` ya son transiciones válidas.

## Enfoque elegido

**Desacoplar el `Cobro` del ciclo de vida de la cita.** El prepago mueve solo
el cobro y la caja; la cita sigue su máquina de estados igual. Reusa los estados
existentes, sin estado nuevo ni flag `prepagada`.

(Descartado: estado/flag `PREPAGADA` —complejiza la máquina sin necesidad— y una
entidad "anticipo" separada —el Cobro ya lo hace—.)

## Decisiones tomadas (con el owner)

- Pago parcial (seña/depósito) permitido (el Cobro ya soporta pagos parciales).
- No-show de cita prepagada: la plata **queda** (sin devolución).
- Cancelación de cita prepagada: se ofrece **devolver**, con **confirmación**
  del owner (devolver / mantener); no es automático.
- Copy del botón: "Cobrar" igual que siempre (sin texto especial).
- Fuera de alcance: pago online del paciente desde el portal (requiere pasarela).
  El prepago es el staff registrando el pago en caja, como un cobro normal.

## Diseño

### Backend

**1. `registrarPago` deja de tocar `cita.estado` en estados previos.**
- Si la cita está en un estado **previo a la atención** (`PENDIENTE`,
  `CONFIRMADA`, `LLEGO`, `EN_ATENCION`): actualizar solo el `Cobro`
  (saldo, estado `PARCIAL`/`COMPLETO`), registrar el pago, mandar la plata a
  caja y loguear. **No** cambiar `cita.estado` ni `paciente.deudaTotal` (la cita
  futura no es deuda).
- Si la cita está `ATENDIDA`/`CON_DEUDA` (post-atención): comportamiento actual
  intacto (→ `COBRADO`/`CON_DEUDA`, ajusta `deudaTotal`).
- `SOLICITADA`, `CANCELADA`, `NO_ASISTIO`, `REPROGRAMADA`: no se cobra (el
  endpoint rechaza; la UI no muestra el botón).

**2. Auto-liquidar al terminar la atención.** En el handler de cambio de estado
(`citas.service.ts`), al pasar a `ATENDIDA`:
- Si el cobro está `COMPLETO` (prepago total) → setear la cita directo a
  `COBRADO`.
- Si el cobro está `PARCIAL`/`PENDIENTE` → `ATENDIDA` (se cobra el saldo
  restante como hoy; si hubo seña, el saldo ya viene reducido).

**3. Cancelación con devolución (confirmada).** El endpoint/DTO de cambio de
estado a `CANCELADA` acepta un flag opcional `devolverPrepago: boolean`:
- Si la cita tiene pagos y `devolverPrepago = true`: revertir cada pago con la
  lógica de `anularPago` (doble entrada, plata fuera de caja) dentro de la misma
  transacción, y dejar el cobro `ANULADO`.
- Si `devolverPrepago = false` (mantener) o no hay pagos: comportamiento actual
  (cobro `ANULADO`, pagos intactos, la plata queda).

**4. No-show:** sin cambios. El cobro pasa a `ANULADO` y los pagos quedan
(plata retenida). Es exactamente el comportamiento actual.

### Frontend

**1. Botón Cobrar en estados previos.** `CitaCard.tsx`: mostrar el botón Cobrar
también en `PENDIENTE`, `CONFIRMADA`, `LLEGO`, `EN_ATENCION` (además de
`ATENDIDA`/`CON_DEUDA`). Mismo `CobroModal`, mismo copy "Cobrar".

**2. Indicador anti doble-cobro.** En la tarjeta, si la cita tiene pagos:
- saldo 0 → chip "Pagado".
- saldo parcial → chip "Seña" con el monto pagado.
La fuente de verdad es el cobro (`total`, `saldoPendiente`, `estado`), que ya
viaja en `cita.cobro`.

**3. Confirmación de devolución al cancelar.** `CancelarCitaModal.tsx`: cuando la
cita tiene pagos, mostrar el monto prepagado y dos acciones: "Devolver" (manda
`devolverPrepago: true`) o "Mantener" (`false`). Sin pagos, el modal queda igual
que hoy.

## Flujos (resumen)

- **Prepago total:** PENDIENTE → (pago 100%) cobro COMPLETO, plata a caja, cita
  sigue PENDIENTE → ... → al atender, cita = COBRADO.
- **Seña:** CONFIRMADA → (pago 50%) cobro PARCIAL, cita sigue CONFIRMADA → ... →
  al atender, ATENDIDA con saldo 50% → se cobra el resto → COBRADO.
- **No-show prepagado:** cita NO_ASISTIO, cobro ANULADO, pagos quedan (plata
  retenida).
- **Cancelación prepagada:** confirm → Devolver (reversa, plata sale, cobro
  ANULADO) o Mantener (cobro ANULADO, plata queda).

## Manejo de errores / bordes

- Monto > saldo: ya lo rechaza `registrarPago`.
- Caja cerrada: ya lo exige `registrarPago` (`exigirCajaAbierta`). El prepago
  también requiere caja abierta (es plata que entra a caja).
- Reapertura (CANCELADA/NO_ASISTIO → PENDIENTE) de una cita que tuvo pagos: hoy
  revive el cobro a `PENDIENTE` fijo. Con prepago, reabrir debe **recomputar** el
  estado del cobro desde los pagos vivos: `COMPLETO` si saldo 0, `PARCIAL` si hay
  pagos y saldo > 0, `PENDIENTE` si no quedan pagos. (Si la cancelación devolvió
  la plata, no quedan pagos → `PENDIENTE`, como hoy.)
- Devolución parcial vs total: la confirmación devuelve **todos** los pagos del
  cobro (no se elige monto). Si en el futuro se quiere devolución parcial, es una
  extensión aparte.

## Testing

- **Gate API** (`scripts/gate-*.ps1`, crea su propio tenant):
  - Prepago total en PENDIENTE → cobro COMPLETO, cita sigue PENDIENTE, caja sube;
    al llevar la cita a ATENDIDA, queda COBRADO automáticamente.
  - Seña en CONFIRMADA → cobro PARCIAL; al atender, ATENDIDA con saldo; cobrar el
    resto → COBRADO.
  - No-show de prepagada → cobro ANULADO, pagos intactos, caja no baja.
  - Cancelación con `devolverPrepago: true` → reversa, caja baja, cobro ANULADO.
  - Cancelación con `devolverPrepago: false` → cobro ANULADO, pagos intactos.
  - Prepago no cuenta como deuda real (cita PENDIENTE con saldo reducido no
    aparece en deudores).
- Regresión: gates previos de cobros/citas/caja siguen verdes (cobro post-atención
  sin cambios).

## Archivos afectados (estimado)

- `apps/api/src/modules/cobros/cobros.service.ts` (`registrarPago` desacople)
- `apps/api/src/modules/citas/citas.service.ts` (auto-COBRADO al atender;
  rama de devolución al cancelar; recomputo de cobro al reabrir)
- `apps/api/src/modules/citas/*` (DTO de cambio de estado: `devolverPrepago?`)
- `apps/web/src/features/agenda/CitaCard.tsx` (botón en estados previos + chip)
- `apps/web/src/features/agenda/CancelarCitaModal.tsx` (confirmación devolver/mantener)
- `scripts/gate-*.ps1` (nuevo gate de prepago)
