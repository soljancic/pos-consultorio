# Editar cita (servicio + seguro + productos) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una acción "Editar" en el menú de la cita para cambiar el servicio, prender/apagar el seguro (con su código) y agregar productos (en ATENDIDA), recalculando el cobro de forma consistente.

**Architecture:** Nuevo método/endpoint `editarCita` con recálculo **Modelo-A** propio (actualiza la línea de servicio del cobro + `total = SUM(detalles vivos) − descuento`, preserva productos, ajusta deuda en ATENDIDA, maneja la liquidación). Espeja la resolución de cobertura de `create()`. NO se refactoriza `reprogramar()` (su recálculo no es Modelo-A; tocarlo arriesga un flujo que anda — duplicación localizada aceptada). Productos reusan `PUT /cobros/:id/lineas`. Frontend: `EditarCitaModal` + ítem en `CitaCard` + cableado en `AgendaPage`.

**Tech Stack:** NestJS + Prisma + PostgreSQL (api), Decimal de Prisma; React 19 + TanStack Query v5 + Tailwind + Zustand (web). Toast global ya existe (`toast.fromError`).

## Global Constraints

- `consultorioId` SIEMPRE del JWT (`@CurrentUser()`), nunca del body/params.
- Dinero con `Decimal` de Prisma; `Number()` solo para UI. Operaciones multi-tabla en `prisma.$transaction`; acciones críticas en `Log`.
- Modelo A: el cobro tiene una línea `DetalleCobro` de servicio + líneas de producto; `total = SUM(detalles) − descuento`. El recálculo actualiza la línea de servicio. Líneas con `devueltoAt != null` se excluyen del SUM (feature de devolución).
- Cobertura: si `usaSeguro` y consultorio `trabajaConAseguradoras` y paciente `tieneSeguro` + `categoriaSeguroId` + `aseguradoraId` → tarifa `TarifaCobertura(categoriaSeguroId, servicioId, activa)`. El cobro del paciente = `montoPaciente`; el `montoAseguradora` NO toca el cobro/caja (va a `LiquidacionItem`).
- Estados donde "Editar" aplica: PENDIENTE, CONFIRMADA, LLEGO, EN_ATENCION, ATENDIDA. La deuda del paciente solo se ajusta en ATENDIDA (la deuda nace ahí).
- Productos editables solo en ATENDIDA (regla actual); el stock se descuenta al confirmar el cobro.
- DTO con class-validator. Endpoints operativos (sin `@Roles` especial, igual que reprogramar). UI: español con acentos; sin `window.confirm/alert`; errores por **toast**; pasar por skills `impeccable` + `ui-ux-pro-max` + `frontend-design` antes del JSX.
- Verificación: `cd apps/api && npx tsc --noEmit` y `cd apps/web && npx tsc --noEmit` limpios; `cd apps/api && npx jest` verde. No deployar. master.
- El front no tiene unit runner; los gates `.ps1` los corre el owner (la API no la puede bootear el agente).

---

### Task 1: Backend — `editarCita` (DTO + método + endpoint)

**Files:**
- Modify: `apps/api/src/modules/citas/citas.service.ts` (DTO `EditarCitaDto` + método `editarCita` + import de `Decimal`/`IsBoolean` si faltan)
- Modify: `apps/api/src/modules/citas/citas.controller.ts` (endpoint `PUT /citas/:id/editar`)

**Interfaces:**
- Produces: `editarCita(consultorioId, citaId, dto: EditarCitaDto, usuarioId)` → cita fresca con `cobro.detalles`. `EditarCitaDto = { servicioId?: number; usaSeguro?: boolean; codigoSeguro?: string }`.

- [ ] **Step 1: Imports y DTO en `citas.service.ts`**

Verificar/asegurar estos imports al tope de `citas.service.ts`:
- `Decimal`: `import { Decimal } from '@prisma/client/runtime/library'` (si no está).
- class-validator: agregar `IsBoolean` a la lista existente (`IsInt`, `IsOptional`, `IsString`, etc.).
- `EstadoCobro`, `EstadoCita`, `EstadoLiquidacion` ya se importan (verificar; `EstadoLiquidacion` se usa en `cambiarEstado`).

Agregar el DTO (junto a `ReprogramarCitaDto`):

```ts
export class EditarCitaDto {
  @IsInt() @IsOptional()
  servicioId?: number

  @IsBoolean() @IsOptional()
  usaSeguro?: boolean

  @IsString() @IsOptional()
  codigoSeguro?: string
}
```

- [ ] **Step 2: Constante de estados editables**

Agregar dentro de `CitasService` (junto a las otras constantes de estados, p.ej. cerca de `ESTADOS_REPROGRAMABLES`):

```ts
  private readonly ESTADOS_EDITABLES: EstadoCita[] = [
    EstadoCita.PENDIENTE,
    EstadoCita.CONFIRMADA,
    EstadoCita.LLEGO,
    EstadoCita.EN_ATENCION,
    EstadoCita.ATENDIDA,
  ]
```

(Si `ESTADOS_REPROGRAMABLES` es un const de módulo y no de clase, definir `ESTADOS_EDITABLES` con el mismo alcance/estilo que el existente.)

- [ ] **Step 3: Implementar `editarCita`**

Agregar el método dentro de `CitasService` (p.ej. después de `reprogramar`):

```ts
  // Editar una cita antes del cobro: cambia servicio y/o prende-apaga el seguro,
  // recalculando el cobro en Modelo-A (actualiza la linea de servicio + total =
  // SUM(detalles vivos) - descuento, preservando productos), ajusta la deuda solo
  // en ATENDIDA y maneja el LiquidacionItem. Espeja la resolucion de cobertura de
  // create(). Los productos se editan aparte (PUT /cobros/:id/lineas).
  async editarCita(
    consultorioId: number,
    citaId: number,
    dto: EditarCitaDto,
    usuarioId: number,
  ) {
    const cita = await this.prisma.cita.findFirst({
      where: { id: citaId, consultorioId, deletedAt: null },
      include: {
        cobro: true,
        liquidacion: { select: { id: true, estado: true } },
        paciente: {
          select: {
            id: true, tieneSeguro: true, aseguradoraId: true,
            categoriaSeguroId: true, codigoSeguro: true,
          },
        },
      },
    })
    if (!cita) throw new NotFoundException('Cita no encontrada')
    if (!this.ESTADOS_EDITABLES.includes(cita.estado as EstadoCita)) {
      throw new BadRequestException(`No se puede editar una cita en estado ${cita.estado}`)
    }
    if (!cita.cobro || cita.cobro.estado === EstadoCobro.ANULADO) {
      throw new BadRequestException('El cobro de la cita no admite edicion')
    }

    // Servicio final (el del dto si cambia, si no el actual). Valida que exista.
    const cambiaServicio = dto.servicioId != null && dto.servicioId !== cita.servicioId
    const servicio = await this.prisma.servicio.findFirst({
      where: { id: cambiaServicio ? dto.servicioId! : cita.servicioId, consultorioId, ...(cambiaServicio && { activo: true }) },
      select: { id: true, nombre: true, precioBase: true, duracionMin: true },
    })
    if (!servicio) throw new NotFoundException('Servicio no encontrado')

    // Precio particular = override del doctor de la cita o precioBase
    const override = await this.prisma.doctorServicioPrecio.findUnique({
      where: { doctorId_servicioId: { doctorId: cita.doctorId, servicioId: servicio.id } },
      select: { precio: true },
    })
    const precioParticular = override?.precio ?? servicio.precioBase

    // Resolver cobertura segun el usaSeguro final
    const usaSeguroFinal = dto.usaSeguro ?? cita.usaSeguro
    let cobertura:
      | { categoriaSeguroId: number; aseguradoraId: number; montoPaciente: Decimal; montoAseguradora: Decimal; codigoSeguro: string | null }
      | null = null
    if (usaSeguroFinal) {
      const consultorio = await this.prisma.consultorio.findUnique({
        where: { id: consultorioId }, select: { trabajaConAseguradoras: true },
      })
      const p = cita.paciente
      if (!consultorio?.trabajaConAseguradoras || !p.tieneSeguro || !p.categoriaSeguroId || !p.aseguradoraId) {
        throw new BadRequestException('El paciente no tiene un seguro configurado para usar cobertura')
      }
      const tarifa = await this.prisma.tarifaCobertura.findFirst({
        where: { consultorioId, categoriaSeguroId: p.categoriaSeguroId, servicioId: servicio.id, activa: true },
        select: { montoPaciente: true, montoAseguradora: true },
      })
      if (!tarifa) {
        throw new BadRequestException('No hay tarifa de seguro para este servicio con la categoria del paciente')
      }
      cobertura = {
        categoriaSeguroId: p.categoriaSeguroId,
        aseguradoraId: p.aseguradoraId,
        montoPaciente: tarifa.montoPaciente,
        montoAseguradora: tarifa.montoAseguradora,
        codigoSeguro: dto.codigoSeguro ?? p.codigoSeguro ?? null,
      }
    }
    const servicioMonto = cobertura ? cobertura.montoPaciente : precioParticular

    const oldSaldo = cita.cobro.saldoPendiente
    const pagado = cita.cobro.total.minus(oldSaldo)
    const esAtendida = cita.estado === EstadoCita.ATENDIDA
    const cobroId = cita.cobro.id

    const fresco = await this.prisma.$transaction(async (tx) => {
      // 1. Actualizar (o crear, auto-heal de cobros legacy) la linea de servicio
      const lineaServicio = await tx.detalleCobro.findFirst({
        where: { cobroId, consultorioId, servicioId: { not: null } }, select: { id: true },
      })
      if (lineaServicio) {
        await tx.detalleCobro.update({
          where: { id: lineaServicio.id },
          data: { servicioId: servicio.id, descripcion: servicio.nombre, precioVenta: servicioMonto, subtotal: servicioMonto },
        })
      } else {
        await tx.detalleCobro.create({
          data: {
            consultorioId, cobroId, servicioId: servicio.id, descripcion: servicio.nombre,
            cantidad: 1, precioVenta: servicioMonto, precioCosto: 0, subtotal: servicioMonto,
          },
        })
      }

      // 2. Recomputar total = SUM(detalles vivos) - descuento (recortado al bruto)
      const agg = await tx.detalleCobro.aggregate({
        where: { cobroId, consultorioId, devueltoAt: null }, _sum: { subtotal: true },
      })
      const bruto = agg._sum.subtotal ?? new Decimal(0)
      const descuento = cita.cobro!.descuento.gt(bruto) ? bruto : cita.cobro!.descuento
      const nuevoTotal = bruto.minus(descuento)
      const nuevoSaldo = nuevoTotal.minus(pagado)
      if (nuevoSaldo.lt(0)) {
        throw new BadRequestException('Los pagos registrados superan el nuevo total: anule pagos antes de editar')
      }
      const nuevoEstadoCobro = nuevoSaldo.lte(0)
        ? EstadoCobro.COMPLETO
        : pagado.gt(0) ? EstadoCobro.PARCIAL : EstadoCobro.PENDIENTE
      await tx.cobro.update({
        where: { id: cobroId },
        data: { total: nuevoTotal, descuento, saldoPendiente: nuevoSaldo, estado: nuevoEstadoCobro },
      })

      // 3. Deuda del paciente: solo si la cita ya genero deuda (ATENDIDA)
      if (esAtendida) {
        const deltaSaldo = nuevoSaldo.minus(oldSaldo)
        if (!deltaSaldo.isZero()) {
          await tx.paciente.update({
            where: { id: cita.pacienteId },
            data: { deudaTotal: { increment: deltaSaldo } },
          })
        }
      }

      // 4. Snapshot de cobertura + servicio en la cita
      await tx.cita.update({
        where: { id: citaId },
        data: {
          ...(cambiaServicio && { servicioId: servicio.id, duracionMin: servicio.duracionMin }),
          usaSeguro: !!cobertura,
          categoriaSeguroId: cobertura?.categoriaSeguroId ?? null,
          montoPaciente: cobertura?.montoPaciente ?? null,
          montoAseguradora: cobertura?.montoAseguradora ?? null,
          codigoSeguro: cobertura?.codigoSeguro ?? null,
        },
      })

      // 5. LiquidacionItem: upsert si hay cobertura con monto > 0; borrar el PENDIENTE si no
      if (cobertura && cobertura.montoAseguradora.gt(0)) {
        if (cita.liquidacion) {
          await tx.liquidacionItem.update({
            where: { id: cita.liquidacion.id },
            data: {
              montoAseguradora: cobertura.montoAseguradora, servicioId: servicio.id,
              categoriaSeguroId: cobertura.categoriaSeguroId, aseguradoraId: cobertura.aseguradoraId,
              codigoSeguro: cobertura.codigoSeguro, fecha: cita.fechaHora,
            },
          })
        } else {
          await tx.liquidacionItem.create({
            data: {
              consultorioId, citaId, aseguradoraId: cobertura.aseguradoraId,
              categoriaSeguroId: cobertura.categoriaSeguroId, pacienteId: cita.pacienteId,
              servicioId: servicio.id, fecha: cita.fechaHora,
              montoAseguradora: cobertura.montoAseguradora, codigoSeguro: cobertura.codigoSeguro,
            },
          })
        }
      } else if (cita.liquidacion && cita.liquidacion.estado === EstadoLiquidacion.PENDIENTE) {
        await tx.liquidacionItem.delete({ where: { id: cita.liquidacion.id } })
      }

      // 6. Log
      await tx.log.create({
        data: {
          consultorioId, usuarioId, entidad: 'Cita', entidadId: citaId, accion: 'UPDATE',
          payloadDespues: {
            evento: 'editar-cita',
            servicioId: servicio.id,
            usaSeguro: !!cobertura,
            total: nuevoTotal.toString(),
            saldo: nuevoSaldo.toString(),
          },
        },
      })

      return tx.cita.findFirst({
        where: { id: citaId, consultorioId },
        include: { cobro: { include: { detalles: { orderBy: { id: 'asc' } } } } },
      })
    })

    return fresco
  }
```

- [ ] **Step 4: Endpoint en `citas.controller.ts`**

Agregar `EditarCitaDto` al import de `./citas.service` y el endpoint (junto a `reprogramar`):

```ts
  @Put(':id/editar')
  @ApiOperation({ summary: 'Editar cita (servicio y/o seguro); recalcula el cobro' })
  editar(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarCitaDto,
  ) {
    return this.service.editarCita(user.consultorioId, id, dto, user.sub)
  }
```

(`:id/editar` es de dos segmentos: no choca con `@Put(':id')`.)

- [ ] **Step 5: Verificar tipos**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/citas/citas.service.ts apps/api/src/modules/citas/citas.controller.ts
git commit -m "feat(citas): editarCita (servicio + seguro) con recalculo Modelo-A"
```

(Trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. No push.)

---

### Task 2: Gate de integración — `gate-editar-cita.ps1`

**Files:**
- Create: `scripts/gate-editar-cita.ps1`

**Interfaces:**
- Consumes: `PUT /citas/:id/editar` (Task 1) + endpoints existentes (`/citas`, `/citas/:id/estado`, `/servicios`, `/doctores`, `/pacientes`, `/cobros/cita/:citaId`, `/cobros/:id/pagos`, `/tipos-cuenta`, `/caja/abrir`, `/consultorio`).
- Produces: gate que corre el OWNER con la API en :3000.

- [ ] **Step 1: Escribir el gate**

Crear `scripts/gate-editar-cita.ps1` (sigue el patrón de `scripts/gate-productos.ps1`: tenant fresco, helper `Esperar-Error`, PS 5.1 con JSON manual para arrays de 1 elemento). Escenarios:

```powershell
# Gate editar cita: cambio de servicio (particular), recalculo de cobro, guard de
# estado, y rechazo de pagos > nuevo total. API en :3000.
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmssff"
$email = "editcita$ts@test.com"

function Esperar-Error($accion, $codigoEsperado, $etiqueta) {
  try { & $accion | Out-Null; Write-Output "$etiqueta : FALLO (no dio error, esperado $codigoEsperado)" }
  catch {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status -eq $codigoEsperado) { Write-Output "$etiqueta : OK ($status)" }
    else { Write-Output "$etiqueta : FALLO (dio $status, esperado $codigoEsperado)" }
  }
}

Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" `
  -Body (@{ consultorioNombre = "EditGate $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" `
  -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }
$tc = Invoke-RestMethod -Uri "$base/tipos-cuenta" -Headers $h
$tcEfectivo = ($tc | Where-Object { $_.esEfectivo })[0].id
Invoke-RestMethod -Uri "$base/caja/abrir" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ montoInicial = 0 } | ConvertTo-Json) | Out-Null

$svcA = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Consulta A $ts"; duracionMin = 30; precioBase = 100 } | ConvertTo-Json)
$svcB = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Consulta B $ts"; duracionMin = 45; precioBase = 250 } | ConvertTo-Json)
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Dr Edit $ts" } | ConvertTo-Json)
$pac = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ nombre = "Pac"; apellido = "Edit $ts" } | ConvertTo-Json)
$manana = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")

# ---- S1: cambiar servicio (particular) recalcula el cobro ----
$cita1 = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $svcA.id; fechaHora = "${manana}T09:00:00Z" } | ConvertTo-Json)
$cobro1a = Invoke-RestMethod -Uri "$base/cobros/cita/$($cita1.id)" -Headers $h
Invoke-RestMethod -Uri "$base/citas/$($cita1.id)/editar" -Method Put -Headers $h -ContentType "application/json" `
  -Body (@{ servicioId = $svcB.id } | ConvertTo-Json) | Out-Null
$cobro1b = Invoke-RestMethod -Uri "$base/cobros/cita/$($cita1.id)" -Headers $h
$total1 = [double]$cobro1b.total
$sum1 = [double](($cobro1b.detalles | Measure-Object -Property subtotal -Sum).Sum)
if ($total1 -eq 250 -and [math]::Round($sum1,2) -eq 250) {
  Write-Output "S1 CAMBIO SERVICIO: OK (total $($cobro1a.total)->$total1 SUM=$sum1)"
} else { Write-Output "S1 CAMBIO SERVICIO: FALLO (total=$total1 SUM=$sum1 esperado 250)" }

# ---- S2: editar en estado no editable (COBRADO) -> 400 ----
# Llevar la cita a ATENDIDA y cobrar total para que quede COBRADO
foreach ($e in @("CONFIRMADA","LLEGO","EN_ATENCION","ATENDIDA")) {
  Invoke-RestMethod -Uri "$base/citas/$($cita1.id)/estado" -Method Put -Headers $h -ContentType "application/json" `
    -Body (@{ estado = $e } | ConvertTo-Json) | Out-Null
}
Invoke-RestMethod -Uri "$base/cobros/$($cobro1b.id)/pagos" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ monto = 250; tipoCuentaId = $tcEfectivo } | ConvertTo-Json) | Out-Null
Esperar-Error {
  Invoke-RestMethod -Uri "$base/citas/$($cita1.id)/editar" -Method Put -Headers $h -ContentType "application/json" `
    -Body (@{ servicioId = $svcA.id } | ConvertTo-Json)
} 400 "S2 EDITAR EN COBRADO"

# ---- S3: editar en ATENDIDA con pago parcial -> rechaza bajar total por debajo de lo pagado ----
$cita3 = Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $svcB.id; fechaHora = "${manana}T10:00:00Z" } | ConvertTo-Json)
foreach ($e in @("CONFIRMADA","LLEGO","EN_ATENCION","ATENDIDA")) {
  Invoke-RestMethod -Uri "$base/citas/$($cita3.id)/estado" -Method Put -Headers $h -ContentType "application/json" `
    -Body (@{ estado = $e } | ConvertTo-Json) | Out-Null
}
$cobro3 = Invoke-RestMethod -Uri "$base/cobros/cita/$($cita3.id)" -Headers $h
# pago parcial 150 de 250
Invoke-RestMethod -Uri "$base/cobros/$($cobro3.id)/pagos" -Method Post -Headers $h -ContentType "application/json" `
  -Body (@{ monto = 150; tipoCuentaId = $tcEfectivo } | ConvertTo-Json) | Out-Null
# bajar a svcA (100) < pagado (150) -> 400
Esperar-Error {
  Invoke-RestMethod -Uri "$base/citas/$($cita3.id)/editar" -Method Put -Headers $h -ContentType "application/json" `
    -Body (@{ servicioId = $svcA.id } | ConvertTo-Json)
} 400 "S3 EDITAR BAJO LO PAGADO"

# ---- S4: prender seguro sin que el paciente tenga seguro -> 400 ----
Esperar-Error {
  Invoke-RestMethod -Uri "$base/citas/$($cita3.id)/editar" -Method Put -Headers $h -ContentType "application/json" `
    -Body (@{ usaSeguro = $true } | ConvertTo-Json)
} 400 "S4 SEGURO SIN CONFIG PACIENTE"

Write-Output "GATE editar-cita: FIN"
```

> Nota: el escenario completo de seguro (tarifa + liquidación) requiere setear aseguradora/categoría/tarifa del tenant; el gate cubre el rechazo (S4). El flujo feliz de seguro se verifica manualmente o se amplía si el owner lo pide.

- [ ] **Step 2: Parse-check**

Run: `powershell -NoProfile -Command "[scriptblock]::Create((Get-Content -Raw scripts/gate-editar-cita.ps1)) | Out-Null; 'parse-ok'"`
Expected: imprime `parse-ok`.

- [ ] **Step 3: Commit**

```bash
git add scripts/gate-editar-cita.ps1
git commit -m "test(citas): gate-editar-cita.ps1 (cambio servicio + guards)"
```

> El owner corre el gate con la API en :3000.

---

### Task 3: Frontend — `EditarCitaModal` + ítem en menú + cableado

**Files:**
- Create: `apps/web/src/features/agenda/EditarCitaModal.tsx`
- Modify: `apps/web/src/features/agenda/CitaCard.tsx` (prop `onEditar` + ítem "Editar" + gating `puedeEditar`)
- Modify: `apps/web/src/features/agenda/AgendaPage.tsx` (estado + render del modal + `onEditar`)

**Interfaces:**
- Consumes: `PUT /citas/:id/editar` (Task 1); `PUT /cobros/:id/lineas` (existente, ATENDIDA); `GET /servicios`; `GET /cobros/cita/:citaId`.

- [ ] **Step 1: Pasar por los skills de UI (obligatorio antes del JSX)**

Invocar `impeccable` + `ui-ux-pro-max` + `frontend-design` para un modal de edición con 3 secciones (selector de servicio, toggle de seguro + código, editor de productos deshabilitado salvo ATENDIDA), aviso de recálculo del cobro, y errores por toast. Aplicar su guía al JSX.

- [ ] **Step 2: Crear `EditarCitaModal.tsx`**

Sigue el chrome de modal de `ReprogramarCitaModal.tsx` (overlay `bg-slate-950/55 backdrop-blur-sm modal-fade`, panel `bg-card rounded-2xl ... modal-pop`, `ModalHeader`). Reusa: el selector de servicio de `ReprogramarCitaModal` (query `['servicios']` → `GET /servicios`), el toggle de seguro de `NuevaCitaModal` (visible solo si el consultorio trabaja con aseguradoras y el paciente tiene seguro — usar los flags que ya expone la cita/el paciente), y `LineasProductoEditor` de `CobroModal` (deshabilitado salvo `cita.estado === 'ATENDIDA'`). Props: `{ cita: Cita; onClose: () => void }`.

Lógica de guardado (toast para errores, invalidaciones de cache):
```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api-client'
import { toast } from '../../stores/toast.store'
// ...
const qc = useQueryClient()

// Guarda servicio/seguro (solo si cambiaron) y, si la cita esta ATENDIDA y hubo
// cambios de productos, guarda las lineas por el endpoint existente.
const guardar = useMutation({
  mutationFn: async () => {
    const cambioCitaBody: { servicioId?: number; usaSeguro?: boolean; codigoSeguro?: string } = {}
    if (servicioId !== cita.servicioId) cambioCitaBody.servicioId = servicioId
    if (usaSeguro !== cita.usaSeguro) cambioCitaBody.usaSeguro = usaSeguro
    if (usaSeguro && codigoSeguro) cambioCitaBody.codigoSeguro = codigoSeguro
    if (Object.keys(cambioCitaBody).length > 0) {
      await api.put(`/citas/${cita.id}/editar`, cambioCitaBody)
    }
    if (cita.estado === 'ATENDIDA' && hayCambiosLineas && cobroId) {
      await api.put(`/cobros/${cobroId}/lineas`, {
        lineas: lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad })),
      })
    }
  },
  onSuccess: () => {
    for (const key of ['citas', 'cobro-cita', 'deudores', 'deudores-resumen', 'liquidaciones', 'caja-hoy', 'pacientes', 'paciente']) {
      qc.invalidateQueries({ queryKey: [key] })
    }
    onClose()
  },
  onError: (err) => toast.fromError(err, 'No se pudo guardar la edicion de la cita'),
})
```

(El `cobroId` y las `lineas` actuales salen de `GET /cobros/cita/:citaId` — mismo patrón que `CobroModal`. Estados locales: `servicioId`, `usaSeguro`, `codigoSeguro`, `lineas`, `hayCambiosLineas`.)

- [ ] **Step 3: `CitaCard.tsx` — ítem "Editar" + gating**

- Importar `Pencil` de `lucide-react`.
- Agregar a `CitaCardProps` la prop `onEditar: () => void`.
- Definir el gating (junto a `puedeReprogramar`, etc.):
```tsx
const ESTADOS_EDITABLES: EstadoCita[] = [
  EstadoCita.PENDIENTE, EstadoCita.CONFIRMADA, EstadoCita.LLEGO,
  EstadoCita.EN_ATENCION, EstadoCita.ATENDIDA,
]
// ... dentro del componente:
const puedeEditar = ESTADOS_EDITABLES.includes(cita.estado)
```
- Agregar el ítem en el menú, entre Reprogramar y No asistió (mismo patrón que los otros `role="menuitem"`):
```tsx
{puedeEditar && (
  <button
    role="menuitem"
    onClick={() => { setMenuAbierto(false); onEditar() }}
    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-foreground cursor-pointer hover:bg-muted/60 focus-visible:outline-none focus-visible:bg-muted/60 transition-colors duration-150"
  >
    <Pencil className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
    Editar
  </button>
)}
```

- [ ] **Step 4: `AgendaPage.tsx` — estado + render + cableado**

- Estado: `const [citaEditar, setCitaEditar] = useState<Cita | null>(null)`.
- Pasar `onEditar` a cada `CitaCard` (donde se renderizan las cards, junto a `onReprogramar`/`onCancelar`): `onEditar={() => setCitaEditar(cita)}`. (Hay render de cards en la vista lista y posiblemente en el detalle; cablear en los mismos lugares que `onReprogramar`.)
- Render del modal (junto a los otros modales):
```tsx
{citaEditar && (
  <EditarCitaModal cita={citaEditar} onClose={() => setCitaEditar(null)} />
)}
```
- Importar `EditarCitaModal`.

- [ ] **Step 5: Verificar tipos**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/agenda/EditarCitaModal.tsx apps/web/src/features/agenda/CitaCard.tsx apps/web/src/features/agenda/AgendaPage.tsx
git commit -m "feat(agenda): modal Editar cita (servicio + seguro + productos)"
```

(Trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. No push.)

---

## Verificación final (owner)

- `cd apps/api && npx tsc --noEmit` y `cd apps/web && npx tsc --noEmit` limpios; `cd apps/api && npx jest` verde; `pwsh scripts/gate-editar-cita.ps1` (API :3000) todo OK.
- Manual: editar una cita PENDIENTE cambiando el servicio → el cobro refleja el nuevo precio; prender/apagar seguro (paciente con seguro) → total = montoPaciente / vuelve a particular, liquidación creada/borrada; en ATENDIDA agregar productos desde el mismo modal.
- Listo para deploy (sin deployar).

## Fuera de alcance / notas

- NO se refactoriza `reprogramar()` (recálculo no-Modelo-A; se deja intacto). `editarCita` tiene su recálculo propio; la duplicación de la resolución de cobertura es deliberada para no regresar reprogramar.
- Cambiar fecha/hora/doctor sigue siendo Reprogramar. Asignar seguro a un paciente sin seguro = edición del paciente (fuera de alcance). Productos solo en ATENDIDA.
