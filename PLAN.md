# Plan de Trabajo — POS del Consultorio

> Ultima actualizacion: 2026-06-09
> Fuente: MVP.pdf + FRD en NotebookLM (notebook: f7ea57f8-2fb2-4690-ac2c-09599034c535)

---

## 1. Vision del producto

Sistema operativo tipo POS para consultorios pequenos y medianos (1-10 profesionales).
No es un sistema hospitalario: es rapido, visual y accionable.

**Regla de oro de UX:** La secretaria debe poder operar el 80% del consultorio desde la pantalla de agenda sin cambiar de vista.

**Criterios de exito del MVP:**
- La secretaria puede ver en segundos cuanto se cobro hoy
- El admin puede ver quien debe y cuanto
- El doctor puede ver que se le hizo al paciente la ultima vez

**Publico objetivo:** Medicos independientes, odontologos, psicologos, fisioterapeutas, nutricionistas y esteticas medicas con 1 a 10 profesionales.

---

## 2. Stack tecnologico

| Capa | Definido en MVP.pdf | Implementado |
|---|---|---|
| Frontend | React + TypeScript + Vite + Tailwind | React + TypeScript + Vite + Tailwind |
| Backend | Node.js + Express + TypeScript | NestJS + TypeScript |
| Base de datos | MySQL / MariaDB | PostgreSQL via Prisma |
| Auth | JWT + roles | JWT + Passport + roles |
| Monorepo | No especificado | pnpm workspaces |
| Hosting | Railway / VPS / Docker | Pendiente de definir |

NestJS reemplaza a Express para mayor estructura modular. PostgreSQL reemplaza a MySQL — mismo modelo relacional, mejor soporte para queries avanzadas.

---

## 3. Arquitectura del monorepo

```
pos-consultorio/
  apps/
    api/                     NestJS — API REST multi-tenant
      src/
        auth/                Login, JWT, estrategia, guards
        modules/
          citas/             Motor de la agenda (estados, transiciones)
          cobros/            Pagos parciales y deudas
          caja/              Caja diaria por forma de pago
          pacientes/         Ficha del paciente
          doctores/          Profesionales y horarios
          servicios/         Catalogo de prestaciones
          consultorios/      Config del consultorio (SaaS tenant)
          usuarios/          Usuarios y roles
          atenciones/        (Etapa 2) Historia clinica
        common/
          guards/            JwtAuthGuard, RolesGuard
          decorators/        @CurrentUser, @Roles
          filters/           HttpExceptionFilter
        prisma/              PrismaService, PrismaModule
      prisma/
        schema.prisma        Esquema completo de la BD
        migrations/          Historial de migraciones
    web/                     React SPA — frontend
      src/
        features/
          auth/              LoginPage
          agenda/            AgendaPage, CitaCard, NuevaCitaModal, CobroModal
          pacientes/         PacientesPage, PacienteDetallePage (pendiente)
          caja/              CajaPage
          catalogo/          CatalogoPage (servicios + doctores)
          dashboard/         DashboardPage (pendiente)
          configuracion/     ConfiguracionPage (pendiente)
          deudores/          DeudoresPage (pendiente)
        components/
          shared/            AppShell, nav, layout
        lib/
          api-client.ts      Axios con interceptors JWT
          utils.ts           formatFecha, formatHora, formatMoneda, buildWhatsAppUrl
        stores/
          auth.store.ts      Token y usuario (zustand)
  packages/
    types/                   Enums y tipos compartidos (EstadoCita, FormaPago, etc.)
      src/
        enums/               EstadoCita, FormaPago, EstadoCobro, Rol
        types/               Cita, Paciente, Doctor, Servicio, Cobro
```

---

## 4. Modelo de datos (entidades clave)

| Tabla | Campos principales |
|---|---|
| consultorios | id, nombre, logo, moneda, timezone, plan, activo |
| usuarios | id, consultorioId, nombre, email, passwordHash, rol, activo |
| doctores | id, consultorioId, usuarioId, nombre, especialidad, colorAgenda, activo |
| horarios_atencion | id, doctorId, diaSemana, horaInicio, horaFin |
| pacientes | id, consultorioId, nombre, apellido, dni, telefono, whatsapp, fechaNacimiento, deudaTotal |
| servicios | id, consultorioId, nombre, duracionMin, precioBase, activo |
| citas | id, consultorioId, pacienteId, doctorId, servicioId, fechaHora, duracionMin, estado, notasSecretaria |
| atenciones | id, citaId, motivo, diagnostico, tratamiento, proximoControl, adjuntos |
| recetas | id, atencionId, contenido, pdfUrl |
| cobros | id, citaId, consultorioId, total, saldoPendiente, estado |
| pagos | id, cobroId, formaPago, monto, referencia, createdById |
| caja_diaria | id, consultorioId, fecha, totalEfectivo, totalQr, totalTransferencia, totalTarjeta, cerrada |
| logs | id, consultorioId, usuarioId, entidad, entidadId, accion, payloadAntes, payloadDespues |

**Regla critica:** Toda tabla tiene `consultorioId` — filtro obligatorio en cada query de la API. (En modelo.jpeg: `empresa_id` "va con todos" — mismo concepto.)

### 4b. modelo.jpeg (guia de modelo de clases) vs schema actual

Mapeo verificado el 2026-06-09 contra el diagrama del usuario:

| modelo.jpeg | Schema actual | Estado |
|---|---|---|
| Empresas (id, nombre, logo, telefono, direccion, moneda, activo) | Consultorio | Faltan `telefono`, `direccion` → se agregan en plan configuracion. Schema suma `timezone`, `plan` |
| Usuarios (usuario, password_hash, rol, activo) | Usuario | Cubierto; `email` reemplaza a `usuario` (decision: mejor para SaaS multi-tenant) |
| Doctores (nombre, activo) | Doctor | Cubierto y ampliado (especialidad, colorAgenda, horarios, usuarioId) |
| Pacientes (documento, telefono, whatsapp, fecha_nacimiento, sexo, direccion, observaciones) | Paciente | Faltan `sexo`, `direccion` → se agregan en plan pacientes. Schema suma apellido, email, deudaTotal |
| Citas (paciente, doctor, servicio, fecha_inicio, fecha_fin, estado, observacion, created_by) | Cita | Cubierto; `fechaHora + duracionMin` equivale a inicio/fin |
| Atenciones (motivo, diagnostico, tratamiento, observaciones, proximo_control) | Atencion | Etapa 2; al implementarla separar `tratamiento` de `evolucion` segun el diagrama |
| Visitas (fecha, cita_id 0..1, paciente_id) | — no existe | Diferido: la cita + estado LLEGO cubre el MVP; walk-in = crear cita en el momento. Revisar en Etapa 2 |
| Servicios-Productos (tipo, precio, duracion, stock_actual, controla_stock) | Servicio | Parcial: sin `tipo` ni stock. Productos con inventario → Etapa 4 |
| DetalleCuenta (cantidad, precio_unit, costo, pago, debe, borrada) | Cobro (1:1 con cita) | Diferido a Etapa 4: venta multi-linea con costo/margen reemplazara al Cobro simple |
| Pagos (detalle_cuenta_id, monto, cuenta_id, usuario_id, fecha) | Pago | Cubierto para MVP; `cuenta_id` se mapeara cuando exista tabla Cuentas |
| Cuentas (nombre, activa) | enum FormaPago | Diferido a Etapa 4: formas de pago configurables como tabla en lugar de enum |
| Logs (usuario, accion, entidad, entidad_id, fecha) | Log | Cubierto y ampliado (payloadAntes/Despues, ip) |

**Decision:** el diagrama es la guia conceptual; el schema actual la implementa con mejoras (timezone, caja diaria, estados de cobro). Los conceptos POS avanzados (Visitas, DetalleCuenta multi-linea, Cuentas, stock de productos) quedan anclados a Etapa 2/4 del roadmap para no complicar el MVP.

---

## 5. Roles y permisos

| Rol | Agenda | Pacientes | Cobros | Caja | Catalogo | Configuracion |
|---|---|---|---|---|---|---|
| ADMIN | Completo | Completo | Completo | Completo | CRUD | Completo |
| SECRETARIA | Completo | Completo | Completo | Ver + cerrar | Ver | Sin acceso |
| DOCTOR | Solo la suya | Ver ficha | Sin acceso | Sin acceso | Ver | Sin acceso |
| CAJA | Ver | Sin acceso | Completo | Completo | Sin acceso | Sin acceso |

---

## 6. Pantallas del frontend

### Etapa 1 — MVP Operativo

| Ruta | Pantalla | Rol | Estado |
|---|---|---|---|
| /login | Login | Todos | Hecho |
| / | Dashboard | ADMIN, SECRETARIA | Hecho (v0.1.0) |
| /agenda | Agenda diaria (+ filtro doctor, atencion) | SECRETARIA, ADMIN, DOCTOR | Hecho (v0.1.0) |
| /pacientes | Lista de pacientes (+ modal nuevo) | SECRETARIA, ADMIN | Hecho (v0.1.0) |
| /pacientes/:id | Ficha del paciente (+ atencion expandible) | SECRETARIA, ADMIN, DOCTOR | Hecho (v0.1.0) |
| /deudores | Lista de deudores | SECRETARIA, ADMIN, CAJA | Hecho (v0.1.0) |
| /caja | Caja diaria (+ historial, desglose deuda) | ADMIN, SECRETARIA, CAJA | Hecho (v0.1.0) |
| /catalogo | Servicios y doctores (CRUD ADMIN) | ADMIN, SECRETARIA | Hecho (v0.1.0) |
| /configuracion | Admin de usuarios y settings | ADMIN | Hecho (v0.1.0) |

### Detalle de cada pantalla

**/ — Dashboard**
- Total citas hoy / en espera / en atencion
- Total cobrado hoy
- Total deudas pendientes
- Acceso rapido a agenda del dia

**/ agenda — Agenda operativa**
- Navegacion por fecha (← hoy →)
- Filtro por doctor (dropdown)
- Tarjeta por cita: hora, paciente, doctor, servicio, estado (color), saldo pendiente
- Acciones: cambiar estado, abrir cobro, link WhatsApp
- Boton nueva cita (modal)

**/ pacientes — Lista de pacientes**
- Busqueda por nombre, apellido, DNI, telefono, whatsapp
- Tabla: nombre, DNI, whatsapp, deuda total
- Boton nuevo paciente (modal)
- Click en fila abre ficha del paciente

**/ pacientes/:id — Ficha del paciente**
- Datos personales: nombre, DNI, fecha de nacimiento, telefono, whatsapp
- Deuda total actual
- Historial de citas (fecha, doctor, servicio, estado, monto, saldo)
- Boton cobrar deuda pendiente
- Boton enviar WhatsApp

**/ deudores — Vista de deudores**
- Listado de pacientes con saldo > 0
- Columnas: paciente, ultima cita, total adeudado, dias sin pagar
- Boton WhatsApp por deudor

**/ caja — Caja diaria**
- Total cobrado hoy por forma de pago (efectivo, QR, transferencia, tarjeta)
- Nuevas deudas generadas hoy
- Cobros de deudas de dias anteriores
- Boton cerrar caja
- Historial de cajas anteriores

**/ catalogo — Servicios y doctores**
- Tabla de servicios: nombre, duracion, precio (con CRUD)
- Cards de doctores: nombre, especialidad, color, horarios (con CRUD)

**/ configuracion — Configuracion (solo ADMIN)**
- Gestion de usuarios: crear, editar rol, activar/desactivar
- Datos del consultorio: nombre, logo (URL), moneda, timezone
- Templates de mensajes WhatsApp (Etapa 3 — no en MVP)

---

## 7. Endpoints de la API

### Implementados (verificados contra el codigo, 2026-06-09)

Prefijo global: `/api/v1`

| Metodo | Ruta | Descripcion |
|---|---|---|
| POST | /auth/register | Registro (publico) |
| POST | /auth/login | Login, devuelve JWT |
| POST | /auth/refresh | Renueva access token |
| GET | /citas?fecha=&doctorId= | Citas del dia |
| POST | /citas | Crear cita (crea cobro PENDIENTE automatico) |
| PUT | /citas/:id/estado | Cambiar estado (maquina de estados) |
| GET | /pacientes?search= | Buscar pacientes |
| GET | /pacientes/:id | Ficha completa con historial (10 citas) |
| POST | /pacientes | Crear paciente |
| PUT | /pacientes/:id | Editar paciente |
| DELETE | /pacientes/:id | Soft delete |
| GET | /cobros/deudores | Lista plana de cobros con saldo (a reescribir, ver plan deudores) |
| GET | /cobros/cita/:citaId | Cobro de una cita |
| POST | /cobros/:id/pagos | Registrar pago parcial o total |
| GET | /caja/hoy | Resumen caja del dia |
| POST | /caja/cerrar | Cerrar caja |
| GET | /caja/historial?desde=&hasta= | Cajas de dias anteriores |
| GET | /servicios | Listar servicios activos |
| POST | /servicios | Crear servicio |
| PUT | /servicios/:id | Editar servicio (sin campo activo, ver fixes) |
| DELETE | /servicios/:id | Soft delete (activo: false) |
| GET | /doctores | Listar doctores activos |
| POST | /doctores | Crear doctor |
| POST | /doctores/:id/horarios | Agregar horario de atencion |
| GET | /doctores/:id/disponibilidad?fecha= | Slots disponibles |
| GET | /usuarios | Listar usuarios (ADMIN, solo activos — a ajustar) |
| GET | /consultorio | Datos del consultorio autenticado |
| PUT | /consultorio | Actualizar nombre, logoUrl, moneda, timezone (ADMIN) |

### Completados en v0.1.0-mvp (eran los pendientes de Etapa 1)

| Metodo | Ruta | Estado |
|---|---|---|
| PUT | /doctores/:id | Implementado |
| GET | /cobros/deudores | Reescrito: agrupado por paciente, solo deuda real, ultimoPago |
| GET | /cobros/deudores/resumen | Implementado |
| POST / PUT | /usuarios | Implementados (argon2, activo visible) |
| GET / PUT | /atenciones/cita/:citaId | Implementados (modulo nuevo) |
| GET | /caja/hoy | Enriquecido con `pagosDeudaAnterior` y `nuevasDeudas` |
| GET | /health | Healthcheck publico con verificacion de DB |
| GET ?todos=true | /servicios y /doctores | Listados con inactivos para el catalogo |

### Pendientes Etapa 2+

| Modulo | Rutas |
|---|---|
| Atenciones | POST /atenciones, GET /atenciones/:citaId |
| Recetas | POST /recetas, GET /recetas/:id (PDF) |
| Reportes | GET /reportes/mensual, GET /reportes/por-doctor |
| Horarios | GET/POST/PUT/DELETE /doctores/:id/horarios |
| Configuracion WhatsApp | GET/PUT /configuracion/whatsapp-templates |

---

## 7b. Issues conocidos — TODOS RESUELTOS en v0.1.0-mvp

Los 4 detectados en la auditoria pre-ejecucion (DTOs sin validators, deudaTotal sin incremento, deudores con citas futuras, timezone del modal) fueron corregidos. Los gates runtime encontraron y se corrigieron ademas:

5. **@pos/types era TS crudo** — el API compilado crasheaba al arrancar. El paquete ahora buildea a `dist/` (CJS + d.ts); correr `pnpm build` en packages/types tras cambiar tipos.
6. **ClassSerializerInterceptor rompia los Decimal** — todos los montos llegaban como `{s,e,d}`. Eliminado (no habia @Exclude en ningun lado).
7. **UpdatePacienteDto rechazaba PUT parcial** — ahora usa PartialType.
8. **Dia de caja y dia de agenda usaban fecha UTC** — despues de las 20:00 GMT-4 los cobros caian al dia siguiente y las citas nocturnas desaparecian. Ambos usan ahora el dia LOCAL del negocio (`diaCajaLocal()`); el server DEBE correr con TZ del consultorio (var `TZ`, ver docs/DEPLOY.md).

### Gaps vs MVP.pdf (documentados, decididos)

| Item del MVP | Estado | Decision |
|---|---|---|
| Descuento en cobros | No implementado (sin campo en schema) | Backlog Etapa 1.5 — el flujo de pago parcial cubre el caso de cobrar menos |
| "Ultimo pago" en vista deudores | Incorporado | Columna agregada al spec/plan de deudores |
| Logo del consultorio en config | Incorporado | Campo URL en ConfiguracionPage (upload de archivo: etapa posterior) |
| Horarios de atencion en config | Parcial | API por-doctor existe (`POST /doctores/:id/horarios`); UI se difiere a Etapa 2 |
| Ingresos mensuales + pacientes atendidos (reportes) | Incorporado | Agregados al dashboard (via `/caja/historial` y conteo de citas) |
| Rol CAJA | Extra sobre el MVP | El MVP define ADMIN/SECRETARIA/DOCTOR; CAJA se mantiene como superset |

---

## 8. Reglas de negocio criticas

- Un doctor no puede tener dos citas solapadas (la API valida disponibilidad al crear)
- Los estados de cita siguen transiciones definidas (no se puede pasar de COBRADO a PENDIENTE)
- Al crear una cita se crea automaticamente un cobro en estado PENDIENTE
- Si el pago es menor al total, la cita queda en estado CON_DEUDA
- Al registrar un pago se actualiza la caja diaria del dia (por forma de pago)
- **Las deudas ALERTAN pero NO BLOQUEAN**: un paciente deudor puede seguir agendando; el sistema muestra el saldo, no impide operar
- **Pagos divididos**: un cobro acepta multiples pagos (registros Pago) — distintos montos y formas de pago hasta cubrir el total
- **Los pagos nunca se borran ni editan**: un pago mal registrado se corrige con un asiento de reversa (Etapa 2); el original queda auditado
- Toda eliminacion es soft-delete (campo deletedAt) — nunca se borra fisicamente
- Toda accion critica (cambio de estado, pago, cancelacion) genera un registro en logs

---

## 8b. Buenas practicas y seguridad (checklist transversal)

Aplica a TODO codigo nuevo de los planes. Corto y obligatorio; los planes ya lo reflejan en su codigo.

### Seguridad (backend)
- **Multi-tenant:** `consultorioId` SIEMPRE sale del JWT (`@CurrentUser()`), nunca del body ni de params. Todo `findFirst/findMany/update` filtra por el.
- **Validacion:** todo body entra por un DTO con decoradores class-validator (whitelist global ya activo). Nada de `@Body() body: any`.
- **Autorizacion:** las rutas son privadas por defecto (guard global); `@Public()` solo en auth. Mutaciones administrativas llevan `@Roles(Rol.ADMIN)` — el guard de UI (AdminRoute) es UX, la seguridad real es el backend.
- **Passwords:** solo argon2. `passwordHash` jamas viaja en una respuesta — usar `select` explicito en todas las queries de usuarios.
- **Secrets:** por variables de entorno; `.env` no se commitea. El fallback de `JWT_SECRET` en jwt.strategy es solo para dev — en produccion debe fallar si falta.
- **Dinero:** siempre `Decimal` de Prisma (ya es asi). Nunca float para montos; en el frontend convertir con `Number()` solo para mostrar.
- **Integridad:** operaciones multi-tabla (pago, cambio de estado) en `prisma.$transaction`. Acciones criticas registran en `logs`. Borrado siempre soft (`deletedAt` / `activo: false`).
- **Errores:** mensajes genericos al cliente en 500; los detalles van al log del server (HttpExceptionFilter existente).

### Buenas practicas (codigo)
- Tipos y enums compartidos en `@pos/types`; no duplicar interfaces entre web y api.
- TanStack Query: queryKeys jerarquicas (`['servicios']`, `['servicios','todos']`) e invalidacion por prefijo tras cada mutacion.
- Componentes: estados de loading/empty/error explicitos en cada pantalla; modales controlados por estado local del padre.
- Fechas: en services del API usar rangos UTC (`${fecha}T00:00:00Z`); el frontend envia ISO con `toISOString()`.
- Commits convencionales (`feat(modulo): ...`, `fix(modulo): ...`) y `npx tsc --noEmit` en ambos apps antes de cada commit (ya en cada plan).

### Recomendado (no bloqueante, backlog)
- Rate limiting en `/auth/login` (`@nestjs/throttler`).
- Helmet + CORS estricto por dominio en produccion.
- Indice/constraint para evitar doble cobro concurrente (hoy mitigado por transaccion).

---

## 9. Requerimientos no funcionales

- **Performance:** busquedas de pacientes y citas en menos de 200ms (indices por fecha, doctor, estado, apellido)
- **Seguridad:** passwords con argon2, JWT con expiracion, roles validados en cada endpoint, consultorioId obligatorio en queries
- **Auditoria:** tabla logs para cambios de estado, eliminaciones y pagos
- **Responsividad:** desktop-first, compatible con tablet y celulares; la agenda debe funcionar en pantalla tactil
- **Multi-tenant:** aislamiento total por consultorioId — un usuario nunca puede ver datos de otro consultorio
- **Backups:** automaticos en la infraestructura de hosting

---

## 10. Roadmap completo

### Etapa 1 — MVP Operativo — ✔ COMPLETADA (tag `v0.1.0-mvp`, 2026-06-10)

Ejecutada via `2026-06-09-etapa1-master-plan.md`: 5 hitos M0-M4 con gates runtime verdes, smoke E2E de UI con Playwright (5/5, `apps/web/e2e/smoke.spec.ts`), hardening pre-deploy (helmet, throttler, fail-hard de secrets, /health, REGISTRO_ABIERTO). Regresion: `scripts/gate-*.ps1`.

**Pendiente operativo (no de codigo):** deploy en Railway segun `docs/DEPLOY.md` (lo ejecuta el owner) + consultorio piloto.

---

### Etapa 2 — Valor Clinico + Solidez Operativa

**Trigger:** al menos 1 consultorio activo usando Etapa 1 a diario durante 2 semanas.
**Plan maestro:** `docs/superpowers/plans/2026-06-10-etapa2-master-plan.md` — 6 hitos ordenados (reversal de pagos → arqueo ciego → actividad → historia clinica → recetas PDF → decision Visitas) con mini-specs y decisiones fijadas.

- Historia clinica completa sobre la atencion basica de Etapa 1: linea de tiempo cronologica, adjuntos (fotos, estudios), guard duro por rol en endpoints de atenciones y agenda DOCTOR
- Evaluar entidad `Visitas` de modelo.jpeg (asistencia con cita opcional — habilita walk-ins)
- Historia clinica cronologica en la ficha del paciente
- **Anulacion de pagos con asiento de reversa**: campos `anuladoAt/anuladoPor/motivo` + pago espejo negativo; nunca se borra el original (patron probado en produccion en otro proyecto del usuario)
- **Arqueo de caja ciego**: al cerrar, la secretaria declara el efectivo contado SIN ver el esperado; el sistema calcula la diferencia y notifica al admin si no es cero (campos `montoDeclarado`, `montoEsperado`, `diferencia`, revision admin)
- **Vista de actividad reciente** (`/actividad`, solo ADMIN): feed paginado leyendo la tabla `logs` que ya se alimenta hoy
- Generacion de recetas simples en PDF
- Adjuntos por atencion (fotos, estudios)
- Flujo del doctor: agenda → registrar atencion → receta, en un solo flow sin salir de la pantalla

---

### Etapa 3 — Automatizacion

**Trigger:** feedback que confirma que el recordatorio manual es el cuello de botella.

**Paso intermedio (sin API de WhatsApp, patron probado en produccion):**
- **Cola de mensajes pendientes**: un cron genera los mensajes del dia (recordatorios, avisos de deuda) ya redactados; la secretaria los ve en un panel, copia y envia por wa.me, y los marca como enviados/omitidos (expiran a los 3 dias)
- **Templates editables** desde configuracion (solo ADMIN) con variables `{paciente}`, `{fecha}`, `{monto}`
- **Contador de no-shows**: NO_ASISTIO incrementa `noShowCount` del paciente; con 3+ se activa `requierePrepago` (se resetea cuando asiste)
- **NO-SHOW automatico**: cron marca NO_ASISTIO las citas PENDIENTE/CONFIRMADA de 2+ dias atras

**Automatizacion completa:**
- Integracion con WhatsApp Business API
- Recordatorio automatico 24h antes de la cita (con estado PENDIENTE o CONFIRMADA)
- Respuesta del paciente cambia estado a CONFIRMADA automaticamente
- Aviso automatico de deuda pendiente
- Mensaje de cumpleanos automatico
- Campana de reactivacion para pacientes sin cita en 90+ dias

---

### Etapa 4 — Finanzas Avanzadas

- Facturacion electronica (segun normativa del pais)
- Comisiones por doctor: porcentaje o monto fijo configurado por servicio
- Reporte de liquidacion por doctor (mensual)
- Paquetes de sesiones prepagos con descuento automatico por sesion
- Descuento de insumos del inventario al marcar una cita como ATENDIDA
- Adoptar modelo POS de modelo.jpeg: `Servicios-Productos` con tipo y stock (`stock_actual`, `controla_stock`), `DetalleCuenta` multi-linea (cantidad, precio_unit, costo, pago, debe) y tabla `Cuentas` reemplazando el enum FormaPago

---

### Etapa 5 — Multi-sucursal

- Un admin puede gestionar multiples consultorios (sucursales)
- Cajas independientes por sucursal
- Reportes consolidados entre sucursales
- Roles avanzados: gerente regional

---

### Etapa 6 — Ecosistema del Paciente

- Portal del paciente: historial propio, proximas citas
- Reserva online 24/7 via link en Instagram/WhatsApp
- Citas en estado PENDIENTE al entrar al sistema
- Pagos en linea al reservar

---

### Etapa 7 — Verticales Especializadas

- **Odontologia:** odontograma interactivo, fichas dentales por pieza
- **Estetica:** consentimientos digitales firmados en tablet, galeria fotos antes/despues
- **Psicologia:** notas de sesion privadas (solo visible para el doctor)
- **Fisioterapia:** paquetes de sesiones, seguimiento de progreso

---

## 11. Estado actual del repositorio (2026-06-10)

```
Tag: v0.1.0-mvp — Etapa 1 completa, working tree limpio, 15 commits.

Migraciones: init, paciente_sexo_direccion, consultorio_telefono_direccion,
             atencion_tratamiento

Testing:
  - apps/web/e2e/smoke.spec.ts   Playwright, 5 specs E2E en Chromium (5/5)
  - scripts/gate-m2/m3/m4/agenda-nocturna/hardening.ps1   regresion de API

Para desarrollar:
  - PostgreSQL local + apps/api/.env (ver .env.example)
  - cd apps/api && pnpm start:dev   (o pnpm build && pnpm start)
  - cd apps/web && pnpm dev
  - Tras cambiar packages/types: pnpm build dentro de packages/types
```
