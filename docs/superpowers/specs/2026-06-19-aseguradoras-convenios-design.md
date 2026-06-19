# Aseguradoras y Convenios

Fecha: 2026-06-19
Estado: aprobado (diseno), pendiente plan de implementacion
Modulos nuevos/tocados:
- `apps/api/src/modules/aseguradoras` (nuevo)
- `apps/api/src/modules/liquidaciones` (nuevo, F3)
- `apps/api/src/modules/citas`, `cobros`, `pacientes`, `consultorios`, `auth`, `reportes` (integracion)
- `apps/web/src/features/catalogo`, `pacientes`, `agenda`, `configuracion`, `liquidaciones` (nuevo), `reportes`
- `packages/types` (enum + tipos compartidos)

## Problema / objetivo

Hoy toda atencion es particular: el `Cobro` de la cita nace con `total =
precioBase` del servicio (o el override del doctor). No hay forma de registrar
que un paciente se atiende por una aseguradora, ni de separar cuanto paga el
paciente de cuanto se le cobra a la aseguradora, ni de liquidar esas cuentas.

Objetivo: permitir que un paciente tenga aseguradora + plan/categoria asociados,
pero que **en cada cita se decida** si se usa el seguro o se atiende como
particular. Con seguro: tarifario diferenciado (montoPaciente vs
montoAseguradora), cuenta por cobrar a la aseguradora separada, y reportes de
liquidacion. La mayoria de los consultorios NO usa el modulo: queda detras de un
flag y, apagado, es invisible.

## Decisiones (cerradas con el owner)

1. **Acceso al flag `trabajaConAseguradoras`:** vive en el JWT / `AuthUser`
   (auth store, cero red, disponible en todos lados). Fuente de verdad = columna
   en `Consultorio`. Al guardar el toggle en Configuracion se refresca el store
   del admin via `/auth/me` para que lo vea sin re-login. Para otros usuarios
   logueados, el cambio se aplica al refrescar token / re-login (flag que el
   admin cambia muy de vez en cuando: aceptable).
2. **Tarifa faltante (usaSeguro + sin tarifa para ese servicio+categoria):**
   fallback particular. `montoPaciente = precio normal` (override ?? precioBase),
   `montoAseguradora = 0`, la cita queda `usaSeguro = false` de hecho y NO se
   crea LiquidacionItem.
3. **Modelo de la cuenta por cobrar:** un `LiquidacionItem` por cita con seguro,
   con estado individual. "Generar liquidacion mensual" = vista filtrada
   (aseguradora + rango de fechas + estado) + export. Sin cabecera/batch.
4. **Alcance:** el spec cubre el modulo completo; el plan se ejecuta por fases,
   arrancando por F1.
5. **Placement del catalogo:** tab "Aseguradoras" en Catalogo, al lado de "Tipos
   de gasto y cuenta" (admin + flag on).
6. **Default del checkbox UsarSeguro en la cita:** precargado en SI cuando el
   paciente tiene seguro registrado (caso comun), siempre destildable.

## Reglas del proyecto que aplican (PLAN.md 8b)

- `consultorioId` SIEMPRE del JWT (`@CurrentUser()`), nunca del body/params.
- Todo DTO con decoradores class-validator (whitelist global => 400 si falta).
- Dinero en `Decimal` de Prisma; `Number()` solo para UI.
- Borrado soft (`activa: false`); el catalogo borra si no esta usado, sino
  desactiva (patron de tipos-gasto/tipos-cuenta).
- Operaciones multi-tabla en `prisma.$transaction` (cita + cobro + liquidacion).
- Acciones criticas (marcar pagado/rechazado, cambios de tarifa) -> tabla `logs`.
- Roles con `@Roles(Rol.ADMIN)` de `@pos/types`; el catalogo y liquidaciones son
  ADMIN. Enums: backend desde `@prisma/client`, frontend desde `@pos/types`,
  valores identicos.
- UI: cada pantalla nueva/modificada pasa por impeccable + ui-ux-pro-max +
  frontend-design ANTES del JSX. Respetar tokens de `lib/ui.ts`, FloatingInput/
  Select/Textarea, dark mode, touch >=44px, focus-visible, tabular-nums en montos.
- Copy visible en espanol con acentos; identificadores de codigo sin acentos.

## Modelo de datos

### Enum nuevo

`EstadoLiquidacion = PENDIENTE | FACTURADO | PAGADO | RECHAZADO`
- Prisma: `enum EstadoLiquidacion` en schema.
- `@pos/types`: enum identico + helper de label/color (patron de EstadoCobro).

### Modelos nuevos

```prisma
model Aseguradora {
  id            Int      @id @default(autoincrement())
  consultorioId Int
  consultorio   Consultorio @relation(fields: [consultorioId], references: [id])
  nombre        String
  contacto      String?
  telefono      String?
  email         String?
  observaciones String?
  activa        Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  categorias    CategoriaSeguro[]
  tarifas       TarifaCobertura[]
  liquidaciones LiquidacionItem[]

  @@index([consultorioId])
  @@map("aseguradoras")
}

model CategoriaSeguro {
  id                  Int      @id @default(autoincrement())
  consultorioId       Int
  consultorio         Consultorio @relation(fields: [consultorioId], references: [id])
  aseguradoraId       Int
  aseguradora         Aseguradora @relation(fields: [aseguradoraId], references: [id])
  nombre              String
  porcentajeCobertura Decimal  @db.Decimal(5, 2)
  activa              Boolean  @default(true)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  tarifas       TarifaCobertura[]
  pacientes     Paciente[]
  citas         Cita[]
  liquidaciones LiquidacionItem[]

  @@index([consultorioId])
  @@index([aseguradoraId])
  @@map("categorias_seguro")
}

model TarifaCobertura {
  id                Int      @id @default(autoincrement())
  consultorioId     Int
  consultorio       Consultorio @relation(fields: [consultorioId], references: [id])
  categoriaSeguroId Int
  categoriaSeguro   CategoriaSeguro @relation(fields: [categoriaSeguroId], references: [id])
  servicioId        Int
  servicio          Servicio @relation(fields: [servicioId], references: [id])
  montoPaciente     Decimal  @db.Decimal(10, 2)
  montoAseguradora  Decimal  @db.Decimal(10, 2)
  activa            Boolean  @default(true)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@unique([categoriaSeguroId, servicioId])
  @@index([consultorioId])
  @@map("tarifas_cobertura")
}

// Cuenta por cobrar a la aseguradora (F3). 1 por cita con seguro. Todo snapshot:
// si el paciente cambia de seguro despues, esta fila no se toca.
model LiquidacionItem {
  id                Int      @id @default(autoincrement())
  consultorioId     Int
  consultorio       Consultorio @relation(fields: [consultorioId], references: [id])
  citaId            Int      @unique
  cita              Cita     @relation(fields: [citaId], references: [id])
  aseguradoraId     Int
  aseguradora       Aseguradora @relation(fields: [aseguradoraId], references: [id])
  categoriaSeguroId Int
  categoriaSeguro   CategoriaSeguro @relation(fields: [categoriaSeguroId], references: [id])
  pacienteId        Int
  paciente          Paciente @relation(fields: [pacienteId], references: [id])
  servicioId        Int
  servicio          Servicio @relation(fields: [servicioId], references: [id])
  fecha             DateTime // = fechaHora de la cita (snapshot, para filtro mensual)
  montoAseguradora  Decimal  @db.Decimal(10, 2)
  codigoSeguro      String?
  estado            EstadoLiquidacion @default(PENDIENTE)
  facturadoAt       DateTime?
  pagadoAt          DateTime?
  rechazoMotivo     String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([consultorioId, aseguradoraId, estado])
  @@index([consultorioId, fecha])
  @@map("liquidacion_items")
}
```

### Campos agregados a modelos existentes

```prisma
// Consultorio
trabajaConAseguradoras Boolean @default(false)
// + back-relations: aseguradoras, categoriasSeguro, tarifas, liquidaciones

// Paciente (seguro OPCIONAL del paciente)
tieneSeguro       Boolean @default(false)
aseguradoraId     Int?
aseguradora       Aseguradora? @relation(...)
categoriaSeguroId Int?
categoriaSeguro   CategoriaSeguro? @relation(...)
codigoSeguro      String?

// Cita (snapshot inmutable de la cobertura usada en ESA atencion)
usaSeguro         Boolean @default(false)
categoriaSeguroId Int?
categoriaSeguro   CategoriaSeguro? @relation(...)
montoPaciente     Decimal? @db.Decimal(10, 2)
montoAseguradora  Decimal? @db.Decimal(10, 2)
codigoSeguro      String?
```

Nota: en `Cita` guardamos `categoriaSeguroId` (por relacion se sabe la
aseguradora) + los montos calculados. Como las categorias se borran soft
(`activa:false`, nunca hard delete), la FK historica nunca queda colgada.

## Flag y propagacion (AuthUser)

- `Consultorio.trabajaConAseguradoras` es la fuente de verdad.
- `AuthUser` gana `trabajaConAseguradoras: boolean` (en `packages/types` y en el
  payload que arma el AuthService en login, refresh y `/auth/me`).
- Front: `useAuthStore((s) => s.user?.trabajaConAseguradoras)`. Gate de todo el
  modulo (nav, tabs, bloques) con ese booleano.
- `PUT /consultorio` (Configuracion) actualiza la columna; el front, en
  `onSuccess` del toggle, hace `GET /auth/me` y `setUser(...)` para refrescar el
  store del admin sin re-login.
- Backend: los endpoints del modulo existen siempre (protegidos por
  `@Roles(ADMIN)`), pero la **logica de cobertura en la cita** solo corre si el
  consultorio tiene el flag on (se lee la columna, no el JWT, en el path de
  creacion de cita para evitar stale en multi-usuario).

## Integracion con Cobro (deudores/caja intactos)

Punto de integracion: creacion de cita en
`apps/api/src/modules/citas/citas.service.ts` (hoy lineas 177-191, el `precio` y
el `cobro.create`). Pasa a ser transaccional (cita + cobro + liquidacion en un
`$transaction`).

Calculo del precio al crear/atender la cita:
- **Sin seguro** (`usaSeguro=false`): igual que hoy -> `precio = override ??
  precioBase`. `Cobro.total = precio`. Sin LiquidacionItem.
- **Con seguro y HAY tarifa** (`categoriaSeguro` + `servicio` con
  `TarifaCobertura` activa): `Cobro.total = tarifa.montoPaciente`. Snapshot en la
  cita (`usaSeguro=true`, `categoriaSeguroId`, `montoPaciente`,
  `montoAseguradora`, `codigoSeguro`). Si `montoAseguradora > 0` -> crea
  `LiquidacionItem` (estado PENDIENTE, snapshot de aseguradora/categoria/
  paciente/servicio/fecha/monto/codigo).
- **Con seguro y SIN tarifa**: fallback particular (decision 2). `precio`
  normal, `usaSeguro=false`, sin LiquidacionItem.

Invariantes:
- Cobros, deudores y caja siguen operando SOLO sobre `Cobro.total` /
  `saldoPendiente` (= montoPaciente cuando hay seguro). No cambian.
- `montoAseguradora` vive SOLO en `LiquidacionItem`; nunca toca `caja_diaria` ni
  `Paciente.deudaTotal`.
- Reprogramacion / cambio de servicio (citas.service ~linea 603, donde hoy
  recalcula `precioServicioNuevo`): si la cita `usaSeguro`, recalcula
  `montoPaciente`/`montoAseguradora` desde la tarifa del nuevo servicio, ajusta
  `Cobro.total` y el `LiquidacionItem` (o lo elimina si el nuevo servicio no
  tiene tarifa -> vuelve a particular). Solo si el cobro no esta saldado (misma
  regla del ajuste de precio actual).
- Cancelacion de cita: el `LiquidacionItem` se marca de baja (no se factura algo
  no atendido). Detalle de implementacion en el plan (F3).

## Interfaz (UI)

Cada pantalla pasa por los skills de UI antes del JSX. Reusar tokens de
`lib/ui.ts` y el patron switch-container ya hecho en `DoctorModal` para los
toggles.

### Configuracion -> Consultorio (F1)
Toggle "Trabaja con aseguradoras" (switch-container, helper que explica que
habilita el modulo). `onSuccess` refresca AuthUser.

### Catalogo -> tab "Aseguradoras" (F1)
Visible solo admin + flag on, al lado de "Tipos de gasto y cuenta".
- Lista de aseguradoras (tabla: nombre, contacto, estado; acciones editar/baja).
- AseguradoraModal (alta/edicion: nombre, contacto, telefono, email,
  observaciones, activa).
- Drill-in a una aseguradora: sus **Categorias** (nombre, % cobertura, activa) y
  el **Tarifario** = grilla categoria x servicio con inputs montoPaciente /
  montoAseguradora (patron de la grilla precios-por-servicio del DoctorModal).
- Borrado: si la aseguradora/categoria/tarifa esta usada (citas/liquidaciones),
  no se borra -> se desactiva y se avisa (patron tipos-gasto).

### PacienteModal -> seccion "Seguro" (F2)
Visible solo flag on. Toggle `tieneSeguro` -> select Aseguradora -> select
Categoria (dependiente) -> input Codigo. Opcional. DTO con class-validator
(condicionales: si `tieneSeguro`, aseguradora+categoria requeridas).

### Cita (modal de alta/edicion) -> bloque "Cobertura" (F2)
Visible solo flag on + paciente con seguro. Checkbox "Usar seguro" (precargado
en SI, decision 6). Al tildar: precarga aseguradora/categoria/codigo del
paciente (editable el codigo), muestra `montoPaciente` y `montoAseguradora`
calculados desde la tarifa, y un aviso si no hay tarifa (=> se atendera
particular). El estado se persiste como snapshot al crear la cita.

### Liquidaciones (pagina nueva, ruta + nav) (F3)
Admin + flag on. Tabla de `LiquidacionItem` con filtros: aseguradora, rango de
fechas, estado, paciente. Columnas: fecha, aseguradora, paciente, servicio,
montoAseguradora, codigo, estado.
- "Generar liquidacion mensual": selecciona aseguradora + mes -> lista los
  PENDIENTE del periodo, con total, y permite exportar.
- Acciones de estado: marcar FACTURADO / PAGADO / RECHAZADO (con motivo).
  Transiciones validadas en el service; cada cambio -> log.
- Export PDF y Excel (Excel via `exceljs`, ya elegido en el spec de pacientes;
  PDF: definir libreria en el plan F3).

### Reportes (F4)
Nuevos tabs/reportes:
- **Aseguradoras**: atenciones por aseguradora, pacientes por aseguradora,
  servicios mas usados, ingresos por aseguradora (montoAseguradora), monto
  pendiente / cobrado / rechazado (por estado de LiquidacionItem).
- **Cobertura**: cantidad de pacientes con/sin seguro, distribucion por
  aseguradora y por categoria.

## Fases (el plan se faseara asi; arrancamos por F1)

- **F1 - Fundaciones + catalogo:** enum + 3 modelos (Aseguradora, Categoria,
  Tarifa) + campos `Consultorio.trabajaConAseguradoras` + migracion;
  `@pos/types`; propagacion del flag a AuthUser (login/refresh/me) + toggle en
  Configuracion; modulo API `aseguradoras` (CRUD aseguradoras/categorias/
  tarifario, ADMIN); tab "Aseguradoras" en Catalogo. LiquidacionItem y campos de
  Paciente/Cita pueden entrar en la migracion de F1 (aditivos, sin uso) o
  diferirse; el plan decide para minimizar migraciones.
- **F2 - Paciente + cita + cobro:** campos de Paciente/Cita; seccion Seguro del
  paciente; bloque Cobertura en la cita; integracion transaccional con Cobro
  (montoPaciente) + creacion de LiquidacionItem; manejo de reprogramacion/cambio
  de servicio y cancelacion.
- **F3 - Liquidaciones:** modulo API + pagina; filtros; transiciones de estado +
  logs; generar liquidacion mensual; export PDF + Excel.
- **F4 - Reportes:** reportes Aseguradoras + Cobertura.

## Fuera de alcance (YAGNI por ahora)

- Facturacion fiscal / integracion con SIN/impuestos (item 22, bloqueado).
- Conciliacion automatica de pagos de aseguradora contra extractos bancarios.
- Carga masiva de tarifarios por Excel (se puede sumar despues si hay demanda).
- Multiples coberturas simultaneas en una misma cita (1 cobertura por cita).

## Verificacion

- `cd apps/api && npx tsc --noEmit` y `cd apps/web && npx tsc --noEmit` antes de
  cada commit.
- `cd packages/types && pnpm build` tras cambiar tipos compartidos.
- `cd apps/api && npx prisma migrate dev` para cada migracion (solo dev/local).
- Gate nuevo por fase (patron `scripts/gate-*.ps1`): F1 catalogo CRUD + flag; F2
  calculo de montoPaciente/montoAseguradora y creacion de LiquidacionItem; F3
  transiciones de estado. Un bug de runtime gana su caso en el gate.
- Regla de oro: ninguna migracion destructiva en produccion; todas las de este
  modulo son aditivas.
