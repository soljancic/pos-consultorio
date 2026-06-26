# Diseño: "Editar cita" (servicio + seguro + productos)

Fecha: 2026-06-26
Estado: aprobado (pendiente plan de implementación)

## Problema

Hoy, en una cita ya creada, no hay una acción única para cambiar el **servicio**,
prender/apagar el **seguro** (y su código), o **agregar productos**. El cambio de
servicio existe escondido en Reprogramar (que es para mover fecha/hora), prender/
apagar el seguro en una cita existente no existe (solo se setea al crear), y los
productos solo se editan desde el cobro cuando la cita está ATENDIDA. El owner quiere
un ítem **"Editar"** en el menú de la cita que junte estas tres ediciones.

## Estado actual (verificado)

- **Cita (Prisma, schema.prisma:329-374)**: `servicioId`, `doctorId`, `fechaHora`,
  `duracionMin`; snapshot de seguro: `usaSeguro` (Boolean), `categoriaSeguroId`
  (Int?), `montoPaciente` (Decimal?), `montoAseguradora` (Decimal?), `codigoSeguro`
  (String?). Relaciones `cobro` (1:1) y `liquidacion` (LiquidacionItem 1:1).
- **Cambio de servicio hoy**: `ReprogramarCitaModal` edita servicio + doctor +
  fecha/hora → `PUT /citas/:id` (`reprogramar()` en citas.service.ts:664-890). Cuando
  cambia el servicio y hay cobro no-ANULADO, recalcula: si `usaSeguro`, busca
  `TarifaCobertura(categoriaSeguroId, servicioId)` → setea total = montoPaciente,
  actualiza snapshots de la cita, y upsert/borra el `LiquidacionItem`; si no hay
  tarifa, vuelve a particular; si es particular, recalcula con el precio del servicio
  con guard de no bajar de lo ya pagado (citas.service.ts:741-849). **No** prende/apaga
  el seguro.
- **Seguro al crear** (`create()` citas.service.ts:147-300): si `usaSeguro` +
  consultorio `trabajaConAseguradoras` + paciente `tieneSeguro`, busca la tarifa,
  snapshot de cobertura, y crea `LiquidacionItem` (PENDIENTE) si `montoAseguradora > 0`.
  El DetalleCobro de servicio se crea con `totalCobro`.
- **Productos** (`setProductos()` cobros.service.ts:128-252): solo con cita
  `ATENDIDA`; UI en `CobroModal` (`LineasProductoEditor`), `lineasEditables =
  vendeProductos && cita.estado === ATENDIDA`; guarda por `PUT /cobros/:id/lineas`.
- **Menú de la cita** (`CitaCard.tsx:256-291`): items Reprogramar / No asistió /
  Cancelar; gating en CitaCard.tsx:31-86 (`ESTADOS_REPROGRAMABLES`, etc.).
- **Modelo A del cobro**: el cobro tiene una línea `DetalleCobro` de servicio + líneas
  de producto; `total = SUM(detalles) - descuento`. El recálculo debe actualizar la
  línea de servicio, no solo `cobro.total`.

## Enfoque elegido

Modal nuevo `EditarCitaModal` (abierto desde el menú "Editar") + método/endpoint
backend `editarCita` para servicio+seguro que **reusa** la lógica de recálculo de
cobro/seguro/liquidación que hoy vive dentro de `reprogramar()` (extraída a un helper
compartido). Los productos reusan `setProductos` (`PUT /cobros/:id/lineas`), sin
cambio backend.

Descartado:
- Extender Reprogramar con seguro+productos → ensucia su foco (mover fecha/hora) y
  obliga a tocar fecha cuando no se quiere mover la cita.
- Meterlo en CobroModal → ese modal es para cobrar (ATENDIDA); servicio/seguro son
  edición previa al cobro.

## Decisiones tomadas (con el owner)

- "Editar" disponible en estados **previos al cobro**: PENDIENTE, CONFIRMADA, LLEGO,
  EN_ATENCION, ATENDIDA. **No** en COBRADO, CON_DEUDA, CANCELADA, NO_ASISTIO.
- **Productos solo editables en ATENDIDA** (igual que hoy; el stock se descuenta al
  confirmar). En estados previos la sección de productos aparece deshabilitada con nota.
- Editar cambia **servicio + seguro (on/off + código) + productos**. **No** cambia
  fecha/hora/doctor (eso es Reprogramar).
- El toggle de seguro solo está disponible si el consultorio trabaja con aseguradoras
  y el paciente tiene seguro configurado (mismo criterio que NuevaCita). Asignarle un
  seguro a un paciente que no lo tiene queda **fuera de alcance** (es edición del
  paciente).

## Diseño

### Backend

**Refactor (sin cambio de comportamiento):** extraer de `reprogramar()` la lógica de
recálculo de cobro al cambiar servicio/seguro (citas.service.ts:741-849) a un helper
privado, p.ej. `recomputarCobroPorCobertura(tx, { cita, cobro, servicioNuevo,
usaSeguroNuevo, ... })`, que:
- Calcula el monto de servicio del paciente: con cobertura (tarifa
  `categoriaSeguroId` + servicio) → `montoPaciente`; sin cobertura → precio particular
  del servicio.
- Actualiza la **línea de servicio** del cobro (DetalleCobro: descripcion/precioVenta/
  subtotal) y recomputa `total = servicioPaciente + SUM(productos) - descuento`, con
  guard de **no bajar de lo ya pagado**.
- Ajusta `cita` (snapshots `usaSeguro`/`categoriaSeguroId`/`montoPaciente`/
  `montoAseguradora`/`codigoSeguro`), la **deuda del paciente** por el delta de saldo
  **solo si la cita ya generó deuda** (ATENDIDA), y el `LiquidacionItem` (upsert si
  `montoAseguradora > 0`, borrar si PENDIENTE y ya no aplica).
- `reprogramar()` pasa a llamar a este helper (queda igual de comportamiento).

**Nuevo método** `editarCita(consultorioId, citaId, dto)` en `citas.service.ts`:
- `dto`: `{ servicioId?: number; usaSeguro?: boolean; codigoSeguro?: string }`
  (class-validator: `@IsInt @IsOptional`, `@IsBoolean @IsOptional`, `@IsString
  @IsOptional`).
- Valida: cita del consultorio; estado en {PENDIENTE, CONFIRMADA, LLEGO, EN_ATENCION,
  ATENDIDA}; cobro no ANULADO.
- Si `usaSeguro === true`: exige consultorio `trabajaConAseguradoras` + paciente
  `tieneSeguro`. La categoría sale del **seguro configurado del paciente** (no del
  body); con ella busca `TarifaCobertura(categoriaDelPaciente, servicioFinal)`. **Si no
  hay tarifa para ese (categoría, servicio) → 400 con mensaje claro** ("No hay tarifa de
  seguro para este servicio con la categoría del paciente"); NO cae a particular en
  silencio. (El campo exacto de la categoría del paciente se fija en el plan, leyendo
  el modelo Paciente / la lógica de `create()`.)
- Si `usaSeguro === false`: vuelve a particular, limpia snapshots de seguro y borra el
  `LiquidacionItem` PENDIENTE si existe.
- Aplica el recálculo vía el helper, en `prisma.$transaction`, con `log`.
- Endpoint: `PUT /citas/:id/editar`, rol operativo (igual que reprogramar),
  `consultorioId` del JWT (`@CurrentUser()`), nunca del body/params.

**Productos:** sin cambio backend; el modal usa `PUT /cobros/:id/lineas` (setProductos,
ATENDIDA).

### Frontend

- **`EditarCitaModal.tsx`** (features/agenda): tres secciones —
  1. Servicio: selector (mismo patrón que ReprogramarCitaModal) con nota de recálculo.
  2. Seguro: toggle "Usa seguro" + input código (solo si `trabajaConAseguradoras` y el
     paciente tiene seguro; si no, no se muestra la sección).
  3. Productos: `LineasProductoEditor` deshabilitado salvo en ATENDIDA (nota en estados
     previos).
  - Guarda en dos llamadas según lo que cambió: `PUT /citas/:id/editar` (servicio/
     seguro) y, si hay cambios de productos y la cita está ATENDIDA, `PUT
     /cobros/:id/lineas`. Errores por **toast** (`toast.fromError`).
  - Invalida cache: `citas`, `cobro-cita`/cobro, `deudores`, `deudores-resumen`,
     `liquidaciones`, `caja-hoy`, `pacientes`/`paciente`.
- **`CitaCard.tsx`**: nueva prop `onEditar`, ítem "Editar" (icono `Pencil`) entre
  Reprogramar y No asistió, con gating `puedeEditar = ESTADOS_EDITABLES.includes(estado)`
  (PENDIENTE, CONFIRMADA, LLEGO, EN_ATENCION, ATENDIDA).
- **`AgendaPage.tsx`**: estado + render del `EditarCitaModal`, cableado de `onEditar`.
- Pasar por los skills `impeccable` + `ui-ux-pro-max` + `frontend-design` antes del JSX.

## Testing

- Unit/gate de API (`scripts/gate-editar-cita.ps1`, crea su tenant):
  - Cambiar servicio (particular) → cobro recalculado al nuevo precio; SUM(detalles)
    consistente; productos preservados.
  - Prender seguro con tarifa válida → total = montoPaciente, snapshots seteados,
    LiquidacionItem PENDIENTE creado.
  - Prender seguro sin tarifa para (categoría, servicio) → 400.
  - Apagar seguro → vuelve a particular, snapshots limpios, LiquidacionItem borrado.
  - Editar en ATENDIDA → ajusta la deuda del paciente por el delta; guard de no bajar
    de lo ya pagado (si parcial) → 400 cuando corresponde.
  - Rechazo en estado no editable (COBRADO/CON_DEUDA/cancelada) → 400.
  - Regresión: `reprogramar()` sigue recalculando igual tras el refactor (gate de
    reprogramación existente sigue verde).
- `npx tsc --noEmit` en api y web; `npx jest` (api) verde.

## Fuera de alcance

- Cambiar fecha/hora/doctor (Reprogramar).
- Asignar/editar el seguro del paciente (edición del paciente).
- Agregar productos fuera de ATENDIDA.
