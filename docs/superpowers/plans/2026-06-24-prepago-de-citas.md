# Prepago de citas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir cobrar una cita (total o seña) en estados previos a la atención sin marcarla COBRADA hasta atenderla; conservar la plata en no-show y ofrecer devolución (con confirmación) al cancelar.

**Architecture:** Se desacopla el `Cobro` del ciclo de vida de la cita. `registrarPago` deja de tocar `cita.estado`/`deudaTotal` cuando la cita está pre-atención (solo mueve cobro + caja). Al atender, si el cobro está COMPLETO la cita pasa sola a COBRADO. La devolución es un endpoint propio de Cobros (reversa con doble entrada) que el frontend invoca antes de cancelar; no-show no devuelve.

**Tech Stack:** NestJS + Prisma (api), React 19 + TanStack Query (web). Sin libs nuevas.

**Spec:** `docs/superpowers/specs/2026-06-24-prepago-de-citas-design.md`

## Global Constraints

- `consultorioId` SIEMPRE del JWT (`@CurrentUser()`).
- Dinero: `Decimal` de Prisma siempre; `Number()` solo para mostrar. Pagos NUNCA se borran (corrección vía asiento de reversa).
- Operaciones multi-tabla en `prisma.$transaction`. Acciones críticas registran en `Log`.
- Máquina de estados vía `transicionValida()`. Cancelar/no-show solo ocurre pre-atención (la máquina no permite ATENDIDA→CANCELADA).
- UI nueva/modificada pasa antes por impeccable + ui-ux-pro-max + frontend-design. Sin `window.confirm/alert`. Copy en español con tildes.
- Verificar antes de cada commit: `cd apps/api && npx tsc --noEmit` y `cd apps/web && npx tsc --noEmit`.
- **Desvío del spec (justificado):** el spec proponía un flag `devolverPrepago` en `CambiarEstadoDto`. El plan usa en cambio un endpoint dedicado `POST /cobros/cita/:citaId/devolver` (mantiene la lógica de caja/reversa en CobrosService, evita acoplar CitasService a la caja y deja la devolución auditada como acción propia). El front hace 2 llamadas: devolver → cancelar.

**Estados pre-atención (cobrables sin tocar la cita):** `PENDIENTE`, `CONFIRMADA`, `LLEGO`, `EN_ATENCION`.
**Estados post-atención (cobro mueve la cita, como hoy):** `ATENDIDA`, `CON_DEUDA`.

---

### Task 1: `registrarPago` desacopla cobro y ciclo de vida

**Files:**
- Modify: `apps/api/src/modules/cobros/cobros.service.ts` (`registrarPago`, ~líneas 100-133)

**Interfaces:**
- Consumes: `cobro.cita.estado` (ya viene por el `include: { cita: true }`, línea 74).
- Produces: pagar una cita pre-atención mueve solo el cobro + caja; no cambia `cita.estado` ni `paciente.deudaTotal`. Estados no cobrables → 400.

- [ ] **Step 1: Definir los conjuntos de estados y el guard (antes del `$transaction`)**

Después del bloque que valida `tipoCuenta` (línea 98) y antes de `const nuevoSaldo` (línea 100), insertar:

```ts
    const ESTADOS_PRE_ATENCION: EstadoCita[] = [
      EstadoCita.PENDIENTE, EstadoCita.CONFIRMADA, EstadoCita.LLEGO, EstadoCita.EN_ATENCION,
    ]
    const ESTADOS_POST_ATENCION: EstadoCita[] = [EstadoCita.ATENDIDA, EstadoCita.CON_DEUDA]
    const estadoCita = cobro.cita.estado as EstadoCita
    if (![...ESTADOS_PRE_ATENCION, ...ESTADOS_POST_ATENCION].includes(estadoCita)) {
      throw new BadRequestException('No se puede cobrar una cita en este estado')
    }
    const tocaCita = ESTADOS_POST_ATENCION.includes(estadoCita)
```

- [ ] **Step 2: Condicionar la escritura de `cita.estado` y `deudaTotal` dentro del `$transaction`**

Reemplazar los bloques de las líneas 123-133 (cita.update + paciente.update) por:

```ts
      // Prepago (pre-atencion): no se toca el ciclo de vida de la cita ni la
      // deuda (la cita futura no es deuda). Post-atencion: comportamiento de
      // siempre (la cita pasa a COBRADO/CON_DEUDA y baja la deuda del paciente).
      if (tocaCita) {
        await tx.cita.update({
          where: { id: cobro.citaId },
          data: { estado: nuevoEstadoCita },
        })
        await tx.paciente.update({
          where: { id: cobro.cita.pacienteId },
          data: { deudaTotal: { decrement: monto } },
        })
      }
```

(El `pago.create`, `cobro.update`, `cajaDiaria.upsert` y `log.create` quedan igual: el pago siempre entra a caja y baja el saldo del cobro.)

- [ ] **Step 3: Verificar tipos**

Run: `cd apps/api && npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/cobros/cobros.service.ts
git commit -m "feat(cobros): prepago — registrarPago no toca la cita en estados previos"
```

---

### Task 2: Auto-COBRADO al atender si el cobro está COMPLETO

**Files:**
- Modify: `apps/api/src/modules/citas/citas.service.ts` (`cambiarEstado`, query ~líneas 407-413 y update ~líneas 446-450)

**Interfaces:**
- Consumes: `cita.cobro.estado` (hay que agregarlo al `select`).
- Produces: al pasar a `ATENDIDA` con cobro `COMPLETO` (prepago total), la cita queda en `COBRADO` automáticamente.

- [ ] **Step 1: Incluir `estado` del cobro en la query**

En `cambiarEstado`, el `include` (líneas 409-412), cambiar el select del cobro:

```ts
      include: {
        cobro: { select: { saldoPendiente: true, estado: true } },
        liquidacion: { select: { id: true, estado: true } },
      },
```

- [ ] **Step 2: Calcular el estado final y usarlo en el update**

Antes del `$transaction` (línea 446), agregar:

```ts
    // Prepago total: al atender, si el cobro ya esta saldado, la cita queda
    // COBRADO directo (no hay nada que cobrar al terminar la atencion).
    const estadoFinal =
      dto.estado === EstadoCita.ATENDIDA && cita.cobro?.estado === EstadoCobro.COMPLETO
        ? EstadoCita.COBRADO
        : dto.estado
```

Y en `tx.cita.update` (líneas 447-450), usar `estadoFinal`:

```ts
      const actualizada = await tx.cita.update({
        where: { id: citaId },
        data: { estado: estadoFinal },
      })
```

(El bloque de `deudaTotal` al `ATENDIDA` —líneas 454-458— se deja con `dto.estado === ATENDIDA`: si fue prepago total, `saldoPendiente` es 0 y el incremento es 0, inofensivo. `EstadoCobro` ya está importado en este archivo.)

- [ ] **Step 3: Verificar tipos**

Run: `cd apps/api && npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/citas/citas.service.ts
git commit -m "feat(citas): auto-COBRADO al atender una cita con prepago total"
```

---

### Task 3: Devolución de prepago (endpoint de Cobros) + permitir cancelar con pagos

**Files:**
- Modify: `apps/api/src/modules/cobros/cobros.service.ts` (nuevo método `reversarPagosDeCita`)
- Modify: `apps/api/src/modules/cobros/cobros.controller.ts` (nuevo endpoint)
- Modify: `apps/api/src/modules/citas/citas.service.ts` (quitar el guard 409; recomputar cobro al reabrir)

**Interfaces:**
- Produces:
  - `CobrosService.reversarPagosDeCita(consultorioId: number, citaId: number, usuarioId: number, motivo?: string): Promise<void>` — reversa todos los pagos activos del cobro de la cita (asiento espejo negativo), saca la plata de caja, deja el cobro en su total. NO toca `cita.estado` ni `deudaTotal` (la cancelación es pre-atención).
  - `POST /cobros/cita/:citaId/devolver` → `{ ok: true }`.
  - `cambiarEstado` ya NO tira 409 al cancelar/no-show con pagos: conserva la plata (cobro ANULADO, pagos intactos).

- [ ] **Step 1: Implementar `reversarPagosDeCita` en CobrosService**

Agregar el método (cerca de `anularPago`). Usa helpers ya presentes en el archivo: `diaCajaLocal`, `exigirCajaAbierta`, `EstadoCobro`, `Decimal`.

```ts
  // Devolucion de prepago: reversa TODOS los pagos activos del cobro de la cita
  // (espejo negativo, los originales quedan anulados). Saca la plata de la caja
  // de hoy. Deja el cobro en su total/PENDIENTE; al cancelar la cita pasara a
  // ANULADO. No toca cita.estado ni deudaTotal (cancelar es siempre pre-atencion,
  // donde el prepago no impacto la deuda).
  async reversarPagosDeCita(
    consultorioId: number,
    citaId: number,
    usuarioId: number,
    motivo?: string,
  ): Promise<void> {
    const pagos = await this.prisma.pago.findMany({
      where: { cobro: { citaId, consultorioId }, anuladoAt: null, monto: { gt: 0 } },
      select: {
        id: true, monto: true, tipoCuentaId: true, referencia: true,
        tipoCuenta: { select: { esEfectivo: true } },
        cobro: { select: { id: true, total: true } },
      },
    })
    if (pagos.length === 0) return
    await this.exigirCajaAbierta(consultorioId)
    const { clave: hoy } = diaCajaLocal()

    await this.prisma.$transaction(async (tx) => {
      for (const p of pagos) {
        await tx.pago.create({
          data: {
            cobroId: p.cobro.id,
            tipoCuentaId: p.tipoCuentaId,
            monto: p.monto.negated(),
            referencia: p.referencia,
            createdById: usuarioId,
            reversaDeId: p.id,
          },
        })
        await tx.pago.update({
          where: { id: p.id },
          data: { anuladoAt: new Date(), anuladoPorId: usuarioId, motivoAnulacion: motivo },
        })
        await tx.cajaDiaria.upsert({
          where: { consultorioId_fecha: { consultorioId, fecha: hoy } },
          create: {
            consultorioId, fecha: hoy, usuarioAperturaId: usuarioId,
            ...(p.tipoCuenta.esEfectivo && { totalEfectivo: p.monto.negated() }),
            totalGeneral: p.monto.negated(),
          },
          update: {
            ...(p.tipoCuenta.esEfectivo && { totalEfectivo: { decrement: p.monto } }),
            totalGeneral: { decrement: p.monto },
          },
        })
        await tx.log.create({
          data: {
            consultorioId, usuarioId, entidad: 'Pago', entidadId: p.id, accion: 'PAYMENT',
            payloadAntes: { monto: p.monto.toString() },
            payloadDespues: { anulado: true, motivo: motivo ?? null, citaId, devolucion: true },
          },
        })
      }
      // El cobro vuelve a su total; quedara ANULADO al cancelar la cita
      await tx.cobro.update({
        where: { id: pagos[0].cobro.id },
        data: { saldoPendiente: pagos[0].cobro.total, estado: EstadoCobro.PENDIENTE },
      })
    })
  }
```

- [ ] **Step 2: Exponer el endpoint en CobrosController**

En `cobros.controller.ts`, agregar (mismo `@Roles(Rol.ADMIN)` que `anularPago`; `Roles`, `Rol`, `Post`, `Param`, `ParseIntPipe`, `Body`, `CurrentUser`, `JwtPayload` ya están importados). La ruta `cita/:citaId/devolver` no choca con `GET cita/:citaId` (distinto método) ni con `:id/pagos`:

```ts
  @Post('cita/:citaId/devolver')
  @Roles(Rol.ADMIN)
  @ApiOperation({ summary: 'Devolver (reversar) todos los pagos de prepago de una cita' })
  devolverPrepago(
    @CurrentUser() user: JwtPayload,
    @Param('citaId', ParseIntPipe) citaId: number,
    @Body() body: { motivo?: string },
  ) {
    return this.service.reversarPagosDeCita(user.consultorioId, citaId, user.sub, body?.motivo)
  }
```

- [ ] **Step 3: Quitar el guard 409 de cancelar/no-show con pagos**

En `citas.service.ts`, eliminar el bloque de las líneas 435-444:

```ts
    // (BORRAR) — antes bloqueaba cancelar/no-show con pagos:
    // if (ESTADOS_ANULAN_COBRO.includes(dto.estado)) {
    //   const pagos = await this.prisma.pago.count({ where: { cobro: { citaId } } })
    //   if (pagos > 0) { throw new ConflictException(...) }
    // }
```

Ahora cancelar/no-show con pagos queda permitido: el cobro pasa a `ANULADO` (bloque existente, líneas 462-467) y los pagos quedan (plata retenida). La devolución, cuando corresponde, ya la hizo el front llamando a `/cobros/cita/:id/devolver` antes de cancelar.

- [ ] **Step 4: Recomputar el cobro al reabrir (no forzar PENDIENTE)**

En el bloque de reapertura (líneas 470-479), reemplazar el `data: { estado: EstadoCobro.PENDIENTE }` fijo por un recomputo según el saldo (una cita prepagada que se mantuvo conserva su saldo reducido):

```ts
      // Reabrir (CANCELADA/NO_ASISTIO -> PENDIENTE) revive el cobro segun los
      // pagos vivos: si quedo plata retenida, el saldo sigue reducido.
      if (
        dto.estado === EstadoCita.PENDIENTE &&
        ESTADOS_ANULAN_COBRO.includes(cita.estado) &&
        cita.cobro
      ) {
        const total = await tx.cobro.findUnique({
          where: { citaId }, select: { total: true, saldoPendiente: true },
        })
        const estadoCobro = !total
          ? EstadoCobro.PENDIENTE
          : total.saldoPendiente.lte(0)
            ? EstadoCobro.COMPLETO
            : total.saldoPendiente.lt(total.total)
              ? EstadoCobro.PARCIAL
              : EstadoCobro.PENDIENTE
        await tx.cobro.update({ where: { citaId }, data: { estado: estadoCobro } })
      }
```

- [ ] **Step 5: Verificar tipos**

Run: `cd apps/api && npx tsc --noEmit`
Expected: 0 errores. Si quedó `ConflictException` sin usar en `citas.service.ts`, quitar el import.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/cobros/cobros.service.ts apps/api/src/modules/cobros/cobros.controller.ts apps/api/src/modules/citas/citas.service.ts
git commit -m "feat(cobros): devolucion de prepago + permitir cancelar/no-show con pagos"
```

---

### Task 4: CitaCard — botón Cobrar en estados previos + chip Pagado/Seña

**Files:**
- Modify: `apps/web/src/features/agenda/CitaCard.tsx` (~líneas 200-213 botón cobro; agregar chip)

**Interfaces:**
- Consumes: `cita.cobro` con `{ total, saldoPendiente, estado }` (ya viaja en la lista de citas).

- [ ] **Step 1 (UI gate): pasar por los skills de UI antes del JSX**

Antes de tocar el JSX: impeccable + ui-ux-pro-max + frontend-design. Para el chip: color + forma (no solo color), `tabular-nums` en el monto, touch target del botón ≥44px (ya lo da `btnIconUI`), `focus-visible` (ya presente).

- [ ] **Step 2: Definir el set de estados cobrables y mostrar el botón**

En `CitaCard.tsx`, cerca de los imports/constantes, agregar:

```ts
const ESTADOS_COBRABLES: EstadoCita[] = [
  EstadoCita.PENDIENTE, EstadoCita.CONFIRMADA, EstadoCita.LLEGO,
  EstadoCita.EN_ATENCION, EstadoCita.ATENDIDA, EstadoCita.CON_DEUDA,
]
```

Reemplazar la condición del botón Cobrar (línea 204) por una que cubra los estados previos y solo muestre el botón si queda saldo:

```tsx
        {ESTADOS_COBRABLES.includes(cita.estado) && cita.cobro && Number(cita.cobro.saldoPendiente) > 0 && (
          <button
            onClick={onCobrar}
            className={cn(btnIconUI, 'text-emerald-600 hover:bg-emerald-500/10')}
            title="Cobrar"
            aria-label="Cobrar cita"
          >
            <DollarSign className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
```

(Mantener las clases/colores que ya usaba el botón original; arriba es ilustrativo.)

- [ ] **Step 3: Agregar el chip Pagado/Seña en estados previos**

En la zona de la tarjeta donde van los chips/estado, agregar (gateado a estados previos para no duplicar el color de COBRADO/CON_DEUDA):

```tsx
        {[EstadoCita.PENDIENTE, EstadoCita.CONFIRMADA, EstadoCita.LLEGO, EstadoCita.EN_ATENCION].includes(cita.estado)
          && cita.cobro && cita.cobro.estado !== 'PENDIENTE' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-700 px-2 py-0.5 text-xs font-medium tabular-nums">
            {Number(cita.cobro.saldoPendiente) <= 0
              ? 'Pagado'
              : `Seña ${formatMoneda(Number(cita.cobro.total) - Number(cita.cobro.saldoPendiente))}`}
          </span>
        )}
```

(`formatMoneda` ya está importado en CitaCard. Usar el token de chip del design system si existe uno equivalente; ajustar al revisar con los skills de UI.)

- [ ] **Step 4: Verificar tipos**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/agenda/CitaCard.tsx
git commit -m "feat(agenda): boton Cobrar en estados previos + chip Pagado/Seña (prepago)"
```

---

### Task 5: CancelarCitaModal — confirmación devolver / mantener

**Files:**
- Modify: `apps/web/src/features/agenda/CancelarCitaModal.tsx`

**Interfaces:**
- Consumes: `POST /cobros/cita/:citaId/devolver` (Task 3); `cita.cobro` con `saldoPendiente`/`total`.

- [ ] **Step 1 (UI gate): pasar por los skills de UI antes del JSX.**

- [ ] **Step 2: Detectar prepago y calcular el monto pagado**

Dentro del componente, después de `const t = TEXTOS[modo]`:

```ts
  const pagado = cita.cobro ? Number(cita.cobro.total) - Number(cita.cobro.saldoPendiente) : 0
  const tienePrepago = modo === 'cancelar' && pagado > 0
```

- [ ] **Step 3: Cambiar la mutation para devolver antes de cancelar cuando corresponda**

Reemplazar la mutation (líneas 51-67) por una que reciba si se devuelve:

```ts
  const cancelar = useMutation({
    mutationFn: async (devolver: boolean) => {
      if (modo === 'cancelar' && devolver && pagado > 0) {
        await api.post(`/cobros/cita/${cita.id}/devolver`, { motivo: motivo || undefined })
      }
      return api.put(`/citas/${cita.id}/estado`, {
        estado: modo === 'cancelar' ? EstadoCita.CANCELADA : EstadoCita.NO_ASISTIO,
        motivo: motivo || undefined,
      })
    },
    onSuccess: () => {
      for (const key of ['citas', 'deudores', 'deudores-resumen', 'pacientes', 'paciente', 'cobro-cita', 'caja-hoy']) {
        qc.invalidateQueries({ queryKey: [key] })
      }
      onClose()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'Error al guardar')
    },
  })
```

- [ ] **Step 4: Mostrar el aviso de prepago y dos acciones cuando hay plata pagada**

Cuando `tienePrepago`, mostrar el monto y reemplazar el botón único por dos (Devolver / Mantener). Insertar antes del bloque de botones (línea 99) un aviso:

```tsx
          {tienePrepago && (
            <div className="rounded-lg border border-amber-300/60 bg-amber-500/10 p-3 text-sm text-foreground">
              Esta cita tiene <span className="font-semibold tabular-nums">{formatMoneda(pagado)}</span> prepagados.
              ¿Devolver al paciente o mantener el pago?
            </div>
          )}
```

Y reemplazar el bloque de botones (líneas 99-111) por:

```tsx
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className={cn(btnOutlineUI, 'flex-1')}>
              Volver
            </button>
            {tienePrepago ? (
              <>
                <button type="button" onClick={() => { setError(''); cancelar.mutate(false) }}
                  disabled={cancelar.isPending} className={cn(btnOutlineUI, 'flex-1')}>
                  Mantener
                </button>
                <button type="button" onClick={() => { setError(''); cancelar.mutate(true) }}
                  disabled={cancelar.isPending} className={cn(btnDestructiveUI, 'flex-1')}>
                  {cancelar.isPending ? 'Procesando...' : 'Devolver y cancelar'}
                </button>
              </>
            ) : (
              <button type="button" onClick={() => { setError(''); cancelar.mutate(false) }}
                disabled={cancelar.isPending} className={cn(btnDestructiveUI, 'flex-1')}>
                {cancelar.isPending ? t.botonCargando : t.boton}
              </button>
            )}
          </div>
```

Agregar `formatMoneda` al import de `lib/utils` (línea 6).

- [ ] **Step 5: Verificar tipos**

Run: `cd apps/web && npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/agenda/CancelarCitaModal.tsx
git commit -m "feat(agenda): cancelar con prepago ofrece devolver o mantener (confirmacion)"
```

---

### Task 6: Gate de prepago (owner-runnable)

**Files:**
- Create: `apps/api/scripts/gate-prepago.ps1` (misma carpeta que los gates existentes)

**Interfaces:**
- Consumes: endpoints de Tasks 1-3.

- [ ] **Step 1: Escribir el gate**

Reusar el harness de tenant+login+caja-abierta de un gate de cobros existente (los gates de cobro abren caja; copiar ese setup). Aserciones específicas (necesita: un servicio con precio, un doctor, una cita creada, caja abierta):

1. **Prepago total:** crear cita (queda PENDIENTE). Registrar pago por el total (`POST` al endpoint de cobro que usa la UI). Verificar: cobro `estado=COMPLETO`, `saldoPendiente=0`; la **cita sigue PENDIENTE**; `caja-hoy` subió por el monto.
2. **Auto-COBRADO:** llevar la cita por la máquina (CONFIRMADA→LLEGO→EN_ATENCION→ATENDIDA). Tras ATENDIDA, la cita queda **COBRADO** (no ATENDIDA).
3. **Seña + cobrar resto:** otra cita CONFIRMADA, pagar 50%. cobro `PARCIAL`; cita sigue CONFIRMADA. Llevar a ATENDIDA → queda ATENDIDA con `saldoPendiente>0`. Cobrar el resto → COBRADO.
4. **No-show conserva:** cita PENDIENTE prepagada → `PUT estado NO_ASISTIO`. cobro `ANULADO`; los pagos siguen (no hay reversa); `caja-hoy` NO baja.
5. **Cancelación + devolver:** cita PENDIENTE prepagada → `POST /cobros/cita/:id/devolver` → `PUT estado CANCELADA`. Verificar: caja-hoy bajó por el monto; cobro `ANULADO`; existe un pago de reversa (monto negativo).
6. **Cancelación + mantener:** cita PENDIENTE prepagada → `PUT estado CANCELADA` (sin devolver). cobro `ANULADO`; caja-hoy NO baja.
7. **No es deuda:** una cita PENDIENTE prepagada parcial no aparece en deudores (`GET /cobros/deudores` o el endpoint que use la UI).

Esqueleto (PS 5.1: `ConvertFrom-Json -InputObject`):

Rutas reales (verificadas en `cobros.controller.ts`): el cobro de una cita es
`GET /cobros/cita/:citaId`; registrar pago es `POST /cobros/:cobroId/pagos`
(el param es el id del **cobro**, no de la cita). Por eso hay que obtener el
cobro primero.

```powershell
# ... harness: $base, $token ($h), caja abierta, $citaId, $servicioPrecio, $cuentaId ...
function Estado($id) { (Invoke-RestMethod -Uri "$base/citas/$id" -Headers $h).estado }
function CobroDe($id) { Invoke-RestMethod -Uri "$base/cobros/cita/$id" -Headers $h }

# 1. Prepago total
$cobro = CobroDe $citaId
Invoke-RestMethod -Uri "$base/cobros/$($cobro.id)/pagos" -Method Post -Headers $h -ContentType 'application/json' -Body (@{ monto=$servicioPrecio; tipoCuentaId=$cuentaId } | ConvertTo-Json) | Out-Null
$c = CobroDe $citaId
if ($c.estado -ne 'COMPLETO') { throw "FAIL: cobro no COMPLETO ($($c.estado))" }
if ((Estado $citaId) -ne 'PENDIENTE') { throw 'FAIL: la cita cambio de estado con el prepago' }

# 2. Auto-COBRADO al atender
foreach ($e in 'CONFIRMADA','LLEGO','EN_ATENCION','ATENDIDA') {
  Invoke-RestMethod -Uri "$base/citas/$citaId/estado" -Method Put -Headers $h -ContentType 'application/json' -Body (@{ estado=$e } | ConvertTo-Json) | Out-Null
}
if ((Estado $citaId) -ne 'COBRADO') { throw "FAIL: no auto-COBRADO ($(Estado $citaId))" }

# (4) No-show conserva, (5) devolver, (6) mantener: repetir con citas nuevas y
# comparar caja-hoy antes/despues. Ver detalle en los pasos 4-6 de arriba.

Write-Host 'GATE prepago: PASS' -ForegroundColor Green
```

(Ajustar las rutas exactas de cobro/pago/caja a las que ya usan los gates de cobros del repo.)

- [ ] **Step 2: Commit (el owner corre el gate con la API levantada y caja abierta)**

```bash
git add apps/api/scripts/gate-prepago.ps1
git commit -m "test(cobros): gate de prepago (total, sena, auto-cobrado, no-show, devolucion)"
```

---

## Notas de cierre

- Tras todo: `cd apps/api && npx tsc --noEmit` y `cd apps/web && npx tsc --noEmit` en verde.
- El owner corre `scripts/gate-prepago.ps1` (API en `:3000`, caja abierta).
- Verificación manual sugerida por el owner: prepagar una cita futura, ver el chip "Pagado", atenderla y confirmar que queda en verde (COBRADO); cancelar otra prepagada y probar Devolver vs Mantener mirando la caja del día.
- Listo para deploy cuando el owner lo pida.
