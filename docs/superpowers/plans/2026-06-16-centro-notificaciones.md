# Centro de Notificaciones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir un centro de notificaciones in-app (campana + badge de no leídas + panel) que avise al personal de eventos de citas, con polling, persistencia con purga de leídas >7 días, bandeja admin compartida y fila propia del doctor.

**Architecture:** Tabla `Notificacion` (una fila por evento; `destinoUsuarioId = null` → bandeja admin compartida, seteado → doctor). `CitasService` emite fire-and-forget en los 4 puntos de evento existentes vía `NotificacionesService`. El frontend hace polling del conteo (~30s) y abre un panel (dropdown desktop / bottom sheet móvil) que marca leídas y hace deep-link a la cita en la agenda.

**Tech Stack:** NestJS + Prisma + PostgreSQL (API), React 19 + TanStack Query v5 + React Router v7 + Tailwind (web), `@pos/types` (enum compartido), `@nestjs/schedule` (cron), PowerShell gate (test de integración).

**Spec:** `docs/superpowers/specs/2026-06-16-centro-notificaciones-design.md`

**Convenciones del repo a respetar:**
- `consultorioId` SIEMPRE del JWT (`@CurrentUser()`), nunca del body/params.
- DTOs con class-validator (acá no hay body en los endpoints, así que no aplica).
- Copy visible al usuario en español CON tildes; identificadores de código sin tildes.
- Verificación antes de cada commit: `cd apps/api && npx tsc --noEmit` y `cd apps/web && npx tsc --noEmit`.
- Rutas literales antes que las parametrizadas en el controller.
- El `Rol` enum real es `ADMIN | SECRETARIA | DOCTOR | CAJA` (NO existe `RECEPCION`; en el spec "RECEPCIÓN" = `SECRETARIA`). Regla de visibilidad efectiva: **rol === DOCTOR → ve solo las suyas; cualquier otro rol → bandeja admin compartida.**

---

## Task 1: Crear rama de trabajo

**Files:** ninguno (operación git).

- [ ] **Step 1: Crear y cambiar a la rama**

Estamos en `master` (rama default). Aislar el trabajo en una rama.

Run:
```bash
git checkout -b feat/centro-notificaciones
```
Expected: `Switched to a new branch 'feat/centro-notificaciones'`

---

## Task 2: Enum `TipoNotificacion` en `@pos/types`

**Files:**
- Modify: `packages/types/src/enums/index.ts`

- [ ] **Step 1: Agregar el enum**

Agregar al final de la sección de enums (después de `EstadoMensaje`, antes de `AccionLog` o al final; el orden no importa):

```ts
// Centro de notificaciones: tipo de evento que generó la notificación.
export enum TipoNotificacion {
  NUEVA_CITA = 'NUEVA_CITA',
  CITA_CANCELADA = 'CITA_CANCELADA',
  CITA_REPROGRAMADA = 'CITA_REPROGRAMADA',
  PACIENTE_EN_ESPERA = 'PACIENTE_EN_ESPERA',
}
```

- [ ] **Step 2: Build del paquete de tipos**

`@pos/types` se consume compilado por la web; recompilar.

Run:
```bash
cd packages/types && pnpm build
```
Expected: build OK, sin errores. Aparece `TipoNotificacion` en `packages/types/dist/enums/index.d.ts`.

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/enums/index.ts packages/types/dist
git commit -m "feat(types): enum TipoNotificacion compartido

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Modelo `Notificacion` + migración

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Agregar el enum Prisma y el modelo**

Agregar al final de `apps/api/prisma/schema.prisma`:

```prisma
enum TipoNotificacion {
  NUEVA_CITA
  CITA_CANCELADA
  CITA_REPROGRAMADA
  PACIENTE_EN_ESPERA
}

// Centro de notificaciones (in-app). Una fila por evento:
// destinoUsuarioId = null  -> bandeja admin compartida (estado leído global)
// destinoUsuarioId seteado -> fila propia de ese doctor (su Usuario.id)
// Efímeras: borrado real (sin deletedAt); el cron purga las leídas > 7 días.
model Notificacion {
  id               Int       @id @default(autoincrement())
  consultorioId    Int
  consultorio      Consultorio @relation(fields: [consultorioId], references: [id])
  tipo             TipoNotificacion
  titulo           String
  mensaje          String
  citaId           Int?
  cita             Cita?     @relation(fields: [citaId], references: [id])
  destinoUsuarioId Int?
  destinoUsuario   Usuario?  @relation(fields: [destinoUsuarioId], references: [id])
  leidaAt          DateTime?
  createdAt        DateTime  @default(now())

  @@index([consultorioId, destinoUsuarioId, leidaAt])
  @@index([consultorioId, createdAt])
  @@map("notificaciones")
}
```

- [ ] **Step 2: Agregar las back-relations (Prisma las exige)**

En `model Consultorio` (junto a las otras listas de relaciones, p.ej. después de `logs       Log[]`):
```prisma
  notificaciones Notificacion[]
```

En `model Usuario` (después de `mensajesResueltos MensajePendiente[] @relation("MensajeResueltoPor")`):
```prisma
  notificaciones Notificacion[]
```

En `model Cita` (después de `cobro    Cobro?`):
```prisma
  notificaciones Notificacion[]
```

- [ ] **Step 3: Crear la migración (solo dev/local)**

Run:
```bash
cd apps/api && npx prisma migrate dev --name notificaciones
```
Expected: crea `apps/api/prisma/migrations/<timestamp>_notificaciones/migration.sql` con `CREATE TABLE "notificaciones"` + `CREATE TYPE "TipoNotificacion"`, y regenera el client. Sin errores.

- [ ] **Step 4: Verificar que el client expone el tipo**

Run:
```bash
cd apps/api && npx tsc --noEmit
```
Expected: PASS (0 errores). El modelo nuevo no rompe nada existente.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(notificaciones): tabla Notificacion + enum (migracion)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `NotificacionesService`

**Files:**
- Create: `apps/api/src/modules/notificaciones/notificaciones.service.ts`

- [ ] **Step 1: Escribir el service completo**

Crear `apps/api/src/modules/notificaciones/notificaciones.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { TipoNotificacion, Prisma } from '@prisma/client'
import { JwtPayload } from '../../common/decorators/current-user.decorator'

// Destinos de un evento de cita: la bandeja admin (compartida) y/o el doctor.
interface DestinosEvento {
  admin: boolean
  doctor: boolean
}

@Injectable()
export class NotificacionesService {
  constructor(private prisma: PrismaService) {}

  // Filtro de visibilidad por rol. DOCTOR ve solo las suyas (destinoUsuarioId =
  // su Usuario.id); cualquier otro rol ve la bandeja admin compartida (null).
  private whereVisible(user: JwtPayload): Prisma.NotificacionWhereInput {
    if (user.rol === 'DOCTOR') {
      return { consultorioId: user.consultorioId, destinoUsuarioId: user.sub }
    }
    return { consultorioId: user.consultorioId, destinoUsuarioId: null }
  }

  private fmtFecha(d: Date): string {
    return d.toLocaleDateString('es-BO')
  }

  private fmtHora(d: Date): string {
    return d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  // Día calendario LOCAL de la cita (para el deep-link a la agenda, que carga
  // por día local). No usar UTC: mantiene la cita en su día visible.
  private ymd(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  private textoEvento(
    tipo: TipoNotificacion,
    cita: { paciente: { nombre: string; apellido: string }; servicio: { nombre: string }; fechaHora: Date },
  ): { titulo: string; mensaje: string } {
    const quien = `${cita.paciente.nombre} ${cita.paciente.apellido}`
    const servicio = cita.servicio.nombre
    const cuando = `${this.fmtFecha(cita.fechaHora)} ${this.fmtHora(cita.fechaHora)}`
    switch (tipo) {
      case TipoNotificacion.NUEVA_CITA:
        return { titulo: 'Nueva solicitud de cita', mensaje: `${quien} solicitó ${servicio} para el ${cuando}` }
      case TipoNotificacion.CITA_CANCELADA:
        return { titulo: 'Cita cancelada', mensaje: `${quien} · ${servicio} del ${cuando}` }
      case TipoNotificacion.CITA_REPROGRAMADA:
        return { titulo: 'Cita reprogramada', mensaje: `${quien} · ${servicio} → ${cuando}` }
      case TipoNotificacion.PACIENTE_EN_ESPERA:
        return { titulo: 'Paciente en espera', mensaje: `${quien} llegó para ${servicio} (${this.fmtHora(cita.fechaHora)})` }
    }
  }

  // Emite una notificación de evento de cita. Fire-and-forget: se llama con
  // void desde CitasService y NUNCA debe romper la operación de la cita, por eso
  // todo va dentro de try/catch. Crea hasta 2 filas (admin + doctor).
  async emitirEventoCita(
    consultorioId: number,
    citaId: number,
    tipo: TipoNotificacion,
    destinos: DestinosEvento,
  ): Promise<void> {
    try {
      const cita = await this.prisma.cita.findFirst({
        where: { id: citaId, consultorioId },
        include: {
          paciente: { select: { nombre: true, apellido: true } },
          servicio: { select: { nombre: true } },
          doctor: { select: { usuarioId: true } },
        },
      })
      if (!cita) return
      const { titulo, mensaje } = this.textoEvento(tipo, cita)

      const filas: Prisma.NotificacionCreateManyInput[] = []
      if (destinos.admin) {
        filas.push({ consultorioId, tipo, titulo, mensaje, citaId, destinoUsuarioId: null })
      }
      // Solo si el doctor tiene Usuario vinculado: si no, no hay destinatario.
      if (destinos.doctor && cita.doctor.usuarioId) {
        filas.push({ consultorioId, tipo, titulo, mensaje, citaId, destinoUsuarioId: cita.doctor.usuarioId })
      }
      if (filas.length > 0) {
        await this.prisma.notificacion.createMany({ data: filas })
      }
    } catch {
      // Best-effort: un fallo de notificación no afecta la operación de negocio.
    }
  }

  async findAll(user: JwtPayload) {
    const items = await this.prisma.notificacion.findMany({
      where: this.whereVisible(user),
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { cita: { select: { fechaHora: true } } },
    })
    return items.map((n) => ({
      id: n.id,
      tipo: n.tipo,
      titulo: n.titulo,
      mensaje: n.mensaje,
      citaId: n.citaId,
      citaFecha: n.cita ? this.ymd(n.cita.fechaHora) : null,
      leida: n.leidaAt !== null,
      createdAt: n.createdAt,
    }))
  }

  async noLeidasCount(user: JwtPayload): Promise<number> {
    return this.prisma.notificacion.count({
      where: { ...this.whereVisible(user), leidaAt: null },
    })
  }

  async marcarLeida(user: JwtPayload, id: number): Promise<{ ok: true }> {
    // updateMany con el where de visibilidad: una notificación de otra audiencia
    // u otro consultorio no entra en el filtro. Si no se actualizó nada y además
    // no existe para este usuario, es 404 (ajena/inexistente). Si existe pero ya
    // estaba leída, es idempotente (ok).
    const res = await this.prisma.notificacion.updateMany({
      where: { ...this.whereVisible(user), id, leidaAt: null },
      data: { leidaAt: new Date() },
    })
    if (res.count === 0) {
      const existe = await this.prisma.notificacion.count({
        where: { ...this.whereVisible(user), id },
      })
      if (existe === 0) throw new NotFoundException('Notificación no encontrada')
    }
    return { ok: true }
  }

  async marcarTodasLeidas(user: JwtPayload): Promise<{ marcadas: number }> {
    const res = await this.prisma.notificacion.updateMany({
      where: { ...this.whereVisible(user), leidaAt: null },
      data: { leidaAt: new Date() },
    })
    return { marcadas: res.count }
  }

  // Cron diario: borra (DELETE real) las leídas con más de 7 días. Las no leídas
  // nunca se purgan automáticamente.
  async purgarViejas(): Promise<number> {
    const limite = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const res = await this.prisma.notificacion.deleteMany({
      where: { leidaAt: { not: null, lt: limite } },
    })
    return res.count
  }
}
```

- [ ] **Step 2: Verificar compilación**

Run:
```bash
cd apps/api && npx tsc --noEmit
```
Expected: el service compila. (El controller/módulo aún no existen; eso es esperado y no genera error de tsc porque nada los importa todavía.)

---

## Task 5: `NotificacionesController`, `NotificacionesCron` y `NotificacionesModule`

**Files:**
- Create: `apps/api/src/modules/notificaciones/notificaciones.controller.ts`
- Create: `apps/api/src/modules/notificaciones/notificaciones.cron.ts`
- Create: `apps/api/src/modules/notificaciones/notificaciones.module.ts`

- [ ] **Step 1: Controller**

Crear `apps/api/src/modules/notificaciones/notificaciones.controller.ts`. Rutas literales (`leidas`, `no-leidas/count`) ANTES que la parametrizada (`:id/leida`):

```ts
import { Controller, Get, Patch, Param, ParseIntPipe } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator'
import { NotificacionesService } from './notificaciones.service'

@ApiTags('Notificaciones')
@ApiBearerAuth()
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private service: NotificacionesService) {}

  @Get()
  @ApiOperation({ summary: 'Últimas notificaciones del usuario (según rol)' })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.service.findAll(user)
  }

  @Get('no-leidas/count')
  @ApiOperation({ summary: 'Cantidad de no leídas (badge de la campana)' })
  async count(@CurrentUser() user: JwtPayload) {
    return { count: await this.service.noLeidasCount(user) }
  }

  @Patch('leidas')
  @ApiOperation({ summary: 'Marcar todas como leídas' })
  marcarTodas(@CurrentUser() user: JwtPayload) {
    return this.service.marcarTodasLeidas(user)
  }

  @Patch(':id/leida')
  @ApiOperation({ summary: 'Marcar una como leída' })
  marcarLeida(@CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.service.marcarLeida(user, id)
  }
}
```

- [ ] **Step 2: Cron de purga**

Crear `apps/api/src/modules/notificaciones/notificaciones.cron.ts` (mismo patrón que `citas.cron.ts`; usa el `ScheduleModule` global ya configurado en `app.module.ts`):

```ts
import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { NotificacionesService } from './notificaciones.service'

// Purga diaria de notificaciones leídas > 7 días (borrado real). Apagable con
// NOTIF_PURGE_CRON=off.
@Injectable()
export class NotificacionesCron {
  private readonly logger = new Logger(NotificacionesCron.name)

  constructor(private notificaciones: NotificacionesService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgar() {
    if (process.env.NOTIF_PURGE_CRON === 'off') return
    const borradas = await this.notificaciones.purgarViejas()
    if (borradas > 0) this.logger.log(`Notificaciones purgadas: ${borradas}`)
  }
}
```

- [ ] **Step 3: Módulo**

Crear `apps/api/src/modules/notificaciones/notificaciones.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { NotificacionesService } from './notificaciones.service'
import { NotificacionesController } from './notificaciones.controller'
import { NotificacionesCron } from './notificaciones.cron'

@Module({
  controllers: [NotificacionesController],
  providers: [NotificacionesService, NotificacionesCron],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
```

- [ ] **Step 4: Registrar el módulo en app.module**

Modificar `apps/api/src/app.module.ts`:

1. Agregar el import (junto a los otros, después de `import { MensajesModule } ...`):
```ts
import { NotificacionesModule } from './modules/notificaciones/notificaciones.module'
```
2. Agregar `NotificacionesModule` al array `imports` (después de `MensajesModule,`).

- [ ] **Step 5: Verificar compilación**

Run:
```bash
cd apps/api && npx tsc --noEmit
```
Expected: PASS (0 errores).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/notificaciones apps/api/src/app.module.ts
git commit -m "feat(notificaciones): modulo API (service, controller, cron, endpoints)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Emitir notificaciones desde `CitasService`

**Files:**
- Modify: `apps/api/src/modules/citas/citas.module.ts`
- Modify: `apps/api/src/modules/citas/citas.service.ts`

- [ ] **Step 1: Importar NotificacionesModule en CitasModule**

Reemplazar el contenido de `apps/api/src/modules/citas/citas.module.ts` por:

```ts
import { Module } from '@nestjs/common'
import { CitasService } from './citas.service'
import { CitasCron } from './citas.cron'
import { CitasController } from './citas.controller'
import { NotificacionesModule } from '../notificaciones/notificaciones.module'

@Module({
  imports: [NotificacionesModule],
  controllers: [CitasController],
  providers: [CitasService, CitasCron],
  exports: [CitasService],
})
export class CitasModule {}
```

- [ ] **Step 2: Inyectar el service y agregar el import del enum**

En `apps/api/src/modules/citas/citas.service.ts`:

1. En la línea de imports de `@prisma/client`, agregar `TipoNotificacion`:
```ts
import { EstadoCita, EstadoCobro, OrigenCita, TipoDisponibilidad, Prisma, TipoNotificacion } from '@prisma/client'
```
2. Agregar el import del service (después de `import { MailService } from '../mail/mail.service'`):
```ts
import { NotificacionesService } from '../notificaciones/notificaciones.service'
```
3. Agregar el parámetro al constructor:
```ts
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private notificaciones: NotificacionesService,
  ) {}
```

- [ ] **Step 3: Emitir NUEVA_CITA al crear una reserva del portal**

En el método `create(...)`, justo antes de `return cita` (después del bloque que crea el `cobro`), agregar:

```ts
    // Centro de notificaciones: una reserva del portal (SOLICITADA) avisa a la
    // bandeja admin. Fire-and-forget: nunca bloquea la creación de la cita.
    if (origen === OrigenCita.PORTAL) {
      void this.notificaciones.emitirEventoCita(
        consultorioId,
        cita.id,
        TipoNotificacion.NUEVA_CITA,
        { admin: true, doctor: false },
      )
    }
```

- [ ] **Step 4: Emitir en cambiarEstado (CANCELADA y LLEGO)**

En `cambiarEstado(...)`, después de `const citaActualizada = await this.prisma.$transaction(...)` y antes del bloque existente `if (cita.estado === EstadoCita.SOLICITADA && ...)`, agregar:

```ts
    // Centro de notificaciones (fire-and-forget): cancelación avisa a admin +
    // doctor de la cita; "llegó" avisa solo al doctor (paciente en espera).
    if (dto.estado === EstadoCita.CANCELADA) {
      void this.notificaciones.emitirEventoCita(
        consultorioId,
        citaId,
        TipoNotificacion.CITA_CANCELADA,
        { admin: true, doctor: true },
      )
    } else if (dto.estado === EstadoCita.LLEGO) {
      void this.notificaciones.emitirEventoCita(
        consultorioId,
        citaId,
        TipoNotificacion.PACIENTE_EN_ESPERA,
        { admin: false, doctor: true },
      )
    }
```

- [ ] **Step 5: Emitir CITA_REPROGRAMADA en reprogramar**

En `reprogramar(...)`, el método hoy termina con `return this.prisma.$transaction(async (tx) => { ... })`. Cambiarlo para capturar el resultado, emitir y luego retornar. Reemplazar la línea:

```ts
    return this.prisma.$transaction(async (tx) => {
```
por:
```ts
    const reprogramada = await this.prisma.$transaction(async (tx) => {
```

Y al cierre del método (la línea final `})` que cierra el `$transaction`), agregar a continuación:

```ts

    // Centro de notificaciones (fire-and-forget): reprogramación avisa a admin +
    // doctor de la cita.
    void this.notificaciones.emitirEventoCita(
      consultorioId,
      citaId,
      TipoNotificacion.CITA_REPROGRAMADA,
      { admin: true, doctor: true },
    )

    return reprogramada
```

> Nota: el `await tx.log.create(...)` dentro de la transacción ya devuelve `actualizada`; ese `return actualizada` interno (del callback) se mantiene igual. Solo se renombra el resultado externo y se agrega el `return reprogramada` final.

- [ ] **Step 6: Verificar compilación**

Run:
```bash
cd apps/api && npx tsc --noEmit
```
Expected: PASS (0 errores).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/citas
git commit -m "feat(notificaciones): emitir eventos de cita (nueva/cancel/reprog/en espera)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Gate de API `gate-notificaciones.ps1`

**Files:**
- Create: `scripts/gate-notificaciones.ps1`

> Este gate es el test de integración del backend. Requiere la API corriendo
> (`cd apps/api && pnpm start:dev`). Crea su propio tenant. La emisión es
> fire-and-forget, por eso hay `Start-Sleep` cortos antes de leer.

- [ ] **Step 1: Escribir el gate**

Crear `scripts/gate-notificaciones.ps1`:

```powershell
# Gate Centro de Notificaciones (API :3000). Crea su propio tenant.
$ErrorActionPreference = 'Stop'
$base = "http://localhost:3000/api/v1"
$ts = Get-Date -Format "HHmmssff"
$email = "ntf$ts@test.com"
$slug = "ntf$ts"
$man = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")  # mañana (slots de hoy se filtran)

function Esperar-Error($accion, $codigoEsperado, $etiqueta) {
  try {
    & $accion | Out-Null
    Write-Output "$etiqueta : FALLO (no dio error, esperado $codigoEsperado)"
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status -eq $codigoEsperado) { Write-Output "$etiqueta : OK ($status)" }
    else { Write-Output "$etiqueta : FALLO (dio $status, esperado $codigoEsperado)" }
  }
}
function Tipo-Count($lista, $tipo) { return @($lista | Where-Object { $_.tipo -eq $tipo }).Count }

# Setup: tenant admin + servicio + doctor + usuario DOCTOR vinculado + paciente
Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType "application/json" -Body (@{ consultorioNombre = "NTF $ts"; adminNombre = "Admin"; email = $email; password = "Password123!" } | ConvertTo-Json) | Out-Null
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $email; password = "Password123!" } | ConvertTo-Json)
$h = @{ Authorization = "Bearer $($login.accessToken)" }

$srv = Invoke-RestMethod -Uri "$base/servicios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Consulta"; duracionMin = 30; precioBase = 1000 } | ConvertTo-Json)
$doc = Invoke-RestMethod -Uri "$base/doctores" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dr. Notif" } | ConvertTo-Json)
$docEmail = "drn$ts@test.com"
Invoke-RestMethod -Uri "$base/usuarios" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Dra Notif"; email = $docEmail; password = "Password123!"; rol = "DOCTOR"; doctorId = $doc.id } | ConvertTo-Json) | Out-Null
$loginDoc = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ email = $docEmail; password = "Password123!" } | ConvertTo-Json)
$hDoc = @{ Authorization = "Bearer $($loginDoc.accessToken)" }
$pac = Invoke-RestMethod -Uri "$base/pacientes" -Method Post -Headers $h -ContentType "application/json" -Body (@{ nombre = "Pia"; apellido = "Notif"; telefono = "+59170000001" } | ConvertTo-Json)

# Disponibilidad amplia mañana (para portal + citas internas) y portal activo
Invoke-RestMethod -Uri "$base/disponibilidades" -Method Post -Headers $h -ContentType "application/json" -Body (@{ doctorId = $doc.id; fecha = $man; horaInicio = "07:00"; horaFin = "21:00" } | ConvertTo-Json) | Out-Null
Invoke-RestMethod -Uri "$base/consultorio" -Method Put -Headers $h -ContentType "application/json" -Body (@{ slug = $slug; portalActivo = $true } | ConvertTo-Json) | Out-Null

function Nueva-Cita($hora) {
  $fh = ([datetime]::ParseExact("$man $hora", "yyyy-MM-dd HH:mm", $null)).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  return Invoke-RestMethod -Uri "$base/citas" -Method Post -Headers $h -ContentType "application/json" -Body (@{ pacienteId = $pac.id; doctorId = $doc.id; servicioId = $srv.id; fechaHora = $fh } | ConvertTo-Json)
}
function Estado($citaId, $estado) {
  Invoke-RestMethod -Uri "$base/citas/$citaId/estado" -Method Put -Headers $h -ContentType "application/json" -Body (@{ estado = $estado } | ConvertTo-Json) | Out-Null
}

# 1) NUEVA_CITA: reserva del portal -> SOLICITADA origen PORTAL (avisa admin)
Invoke-RestMethod -Uri "$base/public/$slug/reservas" -Method Post -ContentType "application/json" -Body (@{ doctorId = $doc.id; servicioId = $srv.id; fecha = $man; hora = "09:00"; nombre = "Pia"; apellido = "Notif"; telefono = "+59170000001"; email = "pia@notif.bo" } | ConvertTo-Json) | Out-Null

# 2) PACIENTE_EN_ESPERA: cita interna -> CONFIRMADA -> LLEGO (avisa doctor)
$cLlego = Nueva-Cita "10:00"
Estado $cLlego.id "CONFIRMADA"
Estado $cLlego.id "LLEGO"

# 3) CITA_CANCELADA: cita interna -> CANCELADA (avisa admin + doctor)
$cCancel = Nueva-Cita "11:00"
Estado $cCancel.id "CANCELADA"

# 4) CITA_REPROGRAMADA: cita interna -> reprogramar a 13:00 (avisa admin + doctor)
$cReprog = Nueva-Cita "12:00"
$fhNueva = ([datetime]::ParseExact("$man 13:00", "yyyy-MM-dd HH:mm", $null)).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
# reprogramar = PUT /citas/:id (editar fecha en el lugar), no una ruta aparte
Invoke-RestMethod -Uri "$base/citas/$($cReprog.id)" -Method Put -Headers $h -ContentType "application/json" -Body (@{ fechaHora = $fhNueva } | ConvertTo-Json) | Out-Null

Start-Sleep -Milliseconds 600  # la emisión es fire-and-forget

# 5) Bandeja admin: NUEVA(1) CANCELADA(1) REPROG(1) EN_ESPERA(0)
$adm = Invoke-RestMethod -Uri "$base/notificaciones" -Headers $h
Write-Output "5 ADMIN: nueva=$(Tipo-Count $adm 'NUEVA_CITA') (esp 1) cancel=$(Tipo-Count $adm 'CITA_CANCELADA') (esp 1) reprog=$(Tipo-Count $adm 'CITA_REPROGRAMADA') (esp 1) espera=$(Tipo-Count $adm 'PACIENTE_EN_ESPERA') (esp 0)"

# 6) Bandeja doctor: EN_ESPERA(1) CANCELADA(1) REPROG(1) NUEVA(0)
$drn = Invoke-RestMethod -Uri "$base/notificaciones" -Headers $hDoc
Write-Output "6 DOCTOR: espera=$(Tipo-Count $drn 'PACIENTE_EN_ESPERA') (esp 1) cancel=$(Tipo-Count $drn 'CITA_CANCELADA') (esp 1) reprog=$(Tipo-Count $drn 'CITA_REPROGRAMADA') (esp 1) nueva=$(Tipo-Count $drn 'NUEVA_CITA') (esp 0)"

# 7) citaFecha presente para deep-link
$nuevaItem = @($adm | Where-Object { $_.tipo -eq 'NUEVA_CITA' })[0]
Write-Output "7 DEEPLINK: citaFecha=$($nuevaItem.citaFecha) (esp $man) citaId=$([bool]$nuevaItem.citaId) (esp True)"

# 8) Conteo no leídas: admin=3, doctor=3
$cAdm = Invoke-RestMethod -Uri "$base/notificaciones/no-leidas/count" -Headers $h
$cDrn = Invoke-RestMethod -Uri "$base/notificaciones/no-leidas/count" -Headers $hDoc
Write-Output "8 COUNT: admin=$($cAdm.count) (esp 3) doctor=$($cDrn.count) (esp 3)"

# 9) Marcar una leída baja el conteo admin a 2
Invoke-RestMethod -Uri "$base/notificaciones/$($nuevaItem.id)/leida" -Method Patch -Headers $h | Out-Null
$cAdm2 = Invoke-RestMethod -Uri "$base/notificaciones/no-leidas/count" -Headers $h
Write-Output "9 LEIDA UNA: admin=$($cAdm2.count) (esp 2)"

# 10) Marcar todas (admin) deja el conteo en 0; el doctor sigue en 3
Invoke-RestMethod -Uri "$base/notificaciones/leidas" -Method Patch -Headers $h | Out-Null
$cAdm3 = Invoke-RestMethod -Uri "$base/notificaciones/no-leidas/count" -Headers $h
$cDrn2 = Invoke-RestMethod -Uri "$base/notificaciones/no-leidas/count" -Headers $hDoc
Write-Output "10 MARCAR TODAS: admin=$($cAdm3.count) (esp 0) doctor=$($cDrn2.count) (esp 3, intacto)"

# 11) Seguridad: el doctor no puede marcar una notif de la bandeja admin -> 404
Esperar-Error { Invoke-RestMethod -Uri "$base/notificaciones/$($nuevaItem.id)/leida" -Method Patch -Headers $hDoc } 404 "11 DOCTOR MARCA ADMIN"

# 12) Seguridad: id inexistente -> 404
Esperar-Error { Invoke-RestMethod -Uri "$base/notificaciones/999999/leida" -Method Patch -Headers $h } 404 "12 ID INEXISTENTE"
```

- [ ] **Step 2: Correr el gate (con la API levantada)**

En una terminal: `cd apps/api && pnpm start:dev`. En otra:
```bash
pwsh scripts/gate-notificaciones.ps1
```
Expected (todas las líneas con los valores esperados):
```
5 ADMIN: nueva=1 (esp 1) cancel=1 (esp 1) reprog=1 (esp 1) espera=0 (esp 0)
6 DOCTOR: espera=1 (esp 1) cancel=1 (esp 1) reprog=1 (esp 1) nueva=0 (esp 0)
7 DEEPLINK: citaFecha=<mañana> (esp <mañana>) citaId=True (esp True)
8 COUNT: admin=3 (esp 3) doctor=3 (esp 3)
9 LEIDA UNA: admin=2 (esp 2)
10 MARCAR TODAS: admin=0 (esp 0) doctor=3 (esp 3, intacto)
11 DOCTOR MARCA ADMIN : OK (404)
12 ID INEXISTENTE : OK (404)
```
Si alguna línea no coincide, corregir antes de continuar (debug con superpowers:systematic-debugging).

- [ ] **Step 3: Commit**

```bash
git add scripts/gate-notificaciones.ps1
git commit -m "test(notificaciones): gate de API (emision, visibilidad, marcar leidas)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Tipos y metadata del frontend

**Files:**
- Create: `apps/web/src/features/notificaciones/types.ts`

- [ ] **Step 1: Escribir tipos + metadata por tipo**

Crear `apps/web/src/features/notificaciones/types.ts`:

```ts
import { CalendarPlus, CalendarX2, CalendarClock, UserCheck, type LucideIcon } from 'lucide-react'
import { TipoNotificacion } from '@pos/types'

export interface Notificacion {
  id: number
  tipo: TipoNotificacion
  titulo: string
  mensaje: string
  citaId: number | null
  citaFecha: string | null // YYYY-MM-DD (día local de la cita) para el deep-link
  leida: boolean
  createdAt: string
}

// Ícono + etiqueta + color del acento por tipo de evento (forma + color, no
// solo color, para accesibilidad).
export const TIPO_META: Record<TipoNotificacion, { icon: LucideIcon; label: string; clase: string }> = {
  [TipoNotificacion.NUEVA_CITA]: { icon: CalendarPlus, label: 'Nueva solicitud', clase: 'text-emerald-600 bg-emerald-500/10' },
  [TipoNotificacion.CITA_CANCELADA]: { icon: CalendarX2, label: 'Cancelada', clase: 'text-red-600 bg-red-500/10' },
  [TipoNotificacion.CITA_REPROGRAMADA]: { icon: CalendarClock, label: 'Reprogramada', clase: 'text-amber-600 bg-amber-500/10' },
  [TipoNotificacion.PACIENTE_EN_ESPERA]: { icon: UserCheck, label: 'En espera', clase: 'text-primary bg-primary/10' },
}
```

- [ ] **Step 2: Verificar compilación**

Run:
```bash
cd apps/web && npx tsc --noEmit
```
Expected: PASS. (Requiere que `packages/types` esté buildeado con `TipoNotificacion` — hecho en Task 2.)

---

## Task 9: `NotificacionesPanel` (lista + acciones)

**Files:**
- Create: `apps/web/src/features/notificaciones/NotificacionesPanel.tsx`

- [ ] **Step 1: Escribir el panel**

Crear `apps/web/src/features/notificaciones/NotificacionesPanel.tsx`. Dropdown en desktop (lg+), bottom sheet en móvil. Usa los tokens del design system y los componentes compartidos `EmptyState`/`ErrorState`/`Skeleton`.

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { X, CheckCheck, BellOff } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn, formatFecha, formatHora } from '../../lib/utils'
import { EmptyState } from '../../components/shared/EmptyState'
import { ErrorState } from '../../components/shared/ErrorState'
import { CardListSkeleton } from '../../components/shared/Skeleton'
import { TIPO_META, type Notificacion } from './types'

export function NotificacionesPanel({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: items = [], isLoading, isError, refetch } = useQuery<Notificacion[]>({
    queryKey: ['notificaciones', 'lista'],
    queryFn: () => api.get('/notificaciones').then((r) => r.data),
  })

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['notificaciones'] })
  }

  const marcarLeida = useMutation({
    mutationFn: (id: number) => api.patch(`/notificaciones/${id}/leida`),
    onSuccess: invalidar,
  })
  const marcarTodas = useMutation({
    mutationFn: () => api.patch('/notificaciones/leidas'),
    onSuccess: invalidar,
  })

  function abrir(n: Notificacion) {
    if (!n.leida) marcarLeida.mutate(n.id)
    if (n.citaId && n.citaFecha) {
      navigate(`/agenda?fecha=${n.citaFecha}&citaId=${n.citaId}`)
    }
    onClose()
  }

  const hayNoLeidas = items.some((n) => !n.leida)

  return (
    <>
      {/* Backdrop: en móvil oscurece; en desktop sólo captura el click-afuera */}
      <div
        className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:bg-transparent lg:backdrop-blur-none"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-label="Notificaciones"
        className={cn(
          'fixed z-50 flex flex-col bg-card text-foreground shadow-xl modal-fade',
          // Móvil: bottom sheet
          'inset-x-0 bottom-0 max-h-[80vh] rounded-t-2xl',
          // Desktop: dropdown anclado arriba-derecha bajo la campana
          'lg:inset-x-auto lg:bottom-auto lg:top-16 lg:right-4 lg:w-96 lg:max-h-[70vh] lg:rounded-xl lg:border',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-sm font-semibold">Notificaciones</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => marcarTodas.mutate()}
              disabled={!hayNoLeidas || marcarTodas.isPending}
              className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-md text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 transition-colors duration-150"
            >
              <CheckCheck className="h-4 w-4" aria-hidden="true" />
              Marcar todas
            </button>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="inline-flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:bg-muted cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 transition-colors duration-150"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-3"><CardListSkeleton /></div>
          ) : isError ? (
            <div className="p-6"><ErrorState onRetry={() => refetch()} /></div>
          ) : items.length === 0 ? (
            <div className="p-8"><EmptyState icon={BellOff} title="Sin notificaciones" description="Cuando haya novedades de citas, aparecerán acá." /></div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => {
                const meta = TIPO_META[n.tipo]
                const Icon = meta.icon
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => abrir(n)}
                      className={cn(
                        'w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset transition-colors duration-150',
                        !n.leida && 'bg-primary/[0.04]',
                      )}
                    >
                      <span className={cn('shrink-0 rounded-lg p-2', meta.clase)}>
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2">
                          <span className={cn('text-sm truncate', n.leida ? 'font-medium' : 'font-semibold')}>
                            {n.titulo}
                          </span>
                          {!n.leida && (
                            <span className="shrink-0 h-2 w-2 rounded-full bg-primary" aria-label="No leída" />
                          )}
                        </span>
                        <span className="block text-sm text-muted-foreground truncate">{n.mensaje}</span>
                        <span className="block text-xs text-muted-foreground/70 tabular-nums mt-0.5">
                          {formatFecha(n.createdAt)} · {formatHora(n.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verificar compilación**

Run:
```bash
cd apps/web && npx tsc --noEmit
```
Expected: PASS. (Firmas confirmadas contra el código: `EmptyState` requiere `icon: LucideIcon` + `title: string` (opcional `description`); `ErrorState` acepta `onRetry?`; `CardListSkeleton` no requiere props; `formatFecha`/`formatHora` aceptan `Date | string`.)

---

## Task 10: `NotificacionesBell` (campana + badge + polling)

**Files:**
- Create: `apps/web/src/features/notificaciones/NotificacionesBell.tsx`

- [ ] **Step 1: Escribir la campana**

Crear `apps/web/src/features/notificaciones/NotificacionesBell.tsx`. Desktop: botón fijo arriba-derecha. Móvil: FAB estilo WhatsApp abajo-derecha. Badge rojo con el conteo. Polling cada 30s.

```tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { api } from '../../lib/api-client'
import { cn } from '../../lib/utils'
import { NotificacionesPanel } from './NotificacionesPanel'

export function NotificacionesBell() {
  const [abierto, setAbierto] = useState(false)

  const { data } = useQuery<{ count: number }>({
    queryKey: ['notificaciones', 'count'],
    queryFn: () => api.get('/notificaciones/no-leidas/count').then((r) => r.data),
    refetchInterval: 30 * 1000,
    staleTime: 15 * 1000,
  })
  const count = data?.count ?? 0

  return (
    <>
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-label={count > 0 ? `Notificaciones (${count} sin leer)` : 'Notificaciones'}
        className={cn(
          'fixed z-30 inline-flex items-center justify-center cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          // Móvil: FAB abajo-derecha
          'bottom-5 right-5 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90',
          // Desktop: campana chica arriba-derecha sobre card
          'lg:bottom-auto lg:right-4 lg:top-3 lg:h-10 lg:w-10 lg:rounded-lg lg:bg-card lg:text-foreground lg:border lg:shadow-sm lg:hover:bg-muted',
        )}
      >
        <Bell className="h-6 w-6 lg:h-5 lg:w-5" aria-hidden="true" />
        {count > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-xs font-bold leading-5 text-center tabular-nums ring-2 ring-card"
            aria-hidden="true"
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {abierto && <NotificacionesPanel onClose={() => setAbierto(false)} />}
    </>
  )
}
```

- [ ] **Step 2: Verificar compilación**

Run:
```bash
cd apps/web && npx tsc --noEmit
```
Expected: PASS.

- [ ] **Step 3: Commit (tipos + panel + campana)**

```bash
git add apps/web/src/features/notificaciones
git commit -m "feat(notificaciones): campana, badge y panel (web)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Montar la campana en `AppShell`

**Files:**
- Modify: `apps/web/src/components/shared/AppShell.tsx`

- [ ] **Step 1: Importar y montar**

1. Agregar el import (junto a los otros de `../../features/...`):
```tsx
import { NotificacionesBell } from '../../features/notificaciones/NotificacionesBell'
```
2. Montar `<NotificacionesBell />` dentro de la columna principal. Está posicionada con `fixed`, así que el lugar en el DOM no afecta el layout; ponerla al inicio del `div` de la columna principal. Reemplazar:
```tsx
      {/* Columna principal */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar movil */}
```
por:
```tsx
      {/* Columna principal */}
      <div className="flex-1 flex flex-col min-w-0">
        <NotificacionesBell />
        {/* Topbar movil */}
```

- [ ] **Step 2: Verificar compilación**

Run:
```bash
cd apps/web && npx tsc --noEmit
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/shared/AppShell.tsx
git commit -m "feat(notificaciones): montar campana en AppShell

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: Deep-link a la cita en la agenda

**Files:**
- Modify: `apps/web/src/features/agenda/AgendaPage.tsx`

- [ ] **Step 1: Importar useSearchParams y useRef**

En `apps/web/src/features/agenda/AgendaPage.tsx`:

1. `useRef` ya se importa de `'react'` (línea 1: `import { useState, useEffect, useRef } from 'react'`). Confirmar que está; si no, agregarlo.
2. Agregar `useSearchParams` al import de react-router-dom. Buscar la línea que importa de `'react-router-dom'`. Si no existe (el archivo hoy no lo importa), agregar:
```tsx
import { useSearchParams } from 'react-router-dom'
```

- [ ] **Step 2: Leer los params y abrir la cita**

Justo después de la línea `const queryClient = useQueryClient()` (≈ línea 95), agregar:

```tsx
  // Deep-link del centro de notificaciones: /agenda?fecha=YYYY-MM-DD&citaId=N.
  // Posiciona el día y, cuando llegan las citas, abre el detalle de esa cita.
  const [searchParams, setSearchParams] = useSearchParams()
  const citaIdObjetivo = useRef<number | null>(null)

  useEffect(() => {
    const f = searchParams.get('fecha')
    const cid = searchParams.get('citaId')
    if (f) setFecha(new Date(`${f}T00:00:00`))
    if (cid) citaIdObjetivo.current = Number(cid)
    if (f || cid) setSearchParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
```

- [ ] **Step 3: Abrir el detalle cuando lleguen las citas del día**

El query del día expone `citas` (línea ≈182: `const { data: citas = [], ... } = useQuery<Cita[]>({ queryKey: ['citas', fechaStr, doctorId], ... })`). Después de ese bloque de query (antes de las funciones `navegar`/`abrirCobro`), agregar un efecto que abre el detalle:

```tsx
  // Cuando el deep-link fijó un citaId objetivo y ya cargaron las citas del día,
  // abrir el detalle de esa cita y limpiar el objetivo.
  useEffect(() => {
    if (citaIdObjetivo.current == null) return
    const obj = citas.find((c) => c.id === citaIdObjetivo.current)
    if (obj) {
      setCitaDetalle(obj)
      citaIdObjetivo.current = null
    }
  }, [citas])
```

> `setCitaDetalle` ya existe (línea 86) y `<CitaDetalleModal cita={citaDetalle} ... />` ya está renderizado (línea ≈617): basta setear el estado para abrirlo.

- [ ] **Step 4: Verificar compilación**

Run:
```bash
cd apps/web && npx tsc --noEmit
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/agenda/AgendaPage.tsx
git commit -m "feat(notificaciones): deep-link abre la cita en la agenda

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 13: Pasada de diseño UI (skills obligatorios) y verificación visual

> Regla del proyecto: TODA UI nueva pasa por los skills impeccable + ui-ux-pro-max
> + frontend-design. La campana/badge/panel ya están escritos con los tokens del
> design system; este task es la auditoría/pulido antes de cerrar.

**Files:**
- Posible ajuste: `apps/web/src/features/notificaciones/NotificacionesBell.tsx`, `NotificacionesPanel.tsx`

- [ ] **Step 1: Auditar con los skills**

Invocar (en este orden) los skills `impeccable`, `ui-ux-pro-max` y `frontend-design` sobre los componentes de `apps/web/src/features/notificaciones/`. Checklist mínimo a verificar: touch targets ≥44px (el FAB es 56px, la campana desktop 40px — subir a `h-11 w-11` si el skill lo pide), focus-visible ring presente, contraste del badge rojo en dark mode, animación del bottom sheet 150-300ms, que la campana fija no tape títulos de página en desktop (ajustar `top`/tamaño/opacidad si tapa).

- [ ] **Step 2: Aplicar ajustes sugeridos y re-verificar**

Aplicar los cambios del audit. Luego:
```bash
cd apps/web && npx tsc --noEmit
```
Expected: PASS.

- [ ] **Step 3: Verificación visual manual (build PWA opcional)**

El SW solo corre en build. Para ver la app normal alcanza `pnpm dev`:
```bash
cd apps/web && pnpm dev
```
Verificar manualmente con la API corriendo: la campana aparece (desktop arriba-derecha, móvil FAB), el badge muestra el conteo, al abrir el panel se ven las notificaciones, "Marcar todas" baja el badge, y al tocar una notificación con cita navega a la agenda y abre el detalle.

- [ ] **Step 4: Commit (si hubo ajustes)**

```bash
git add apps/web/src/features/notificaciones
git commit -m "style(notificaciones): pulido UI tras audit (impeccable/ui-ux-pro-max)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 14: Verificación final

- [ ] **Step 1: tsc en ambos paquetes**

Run:
```bash
cd apps/api && npx tsc --noEmit
cd apps/web && npx tsc --noEmit
```
Expected: ambos PASS (0 errores).

- [ ] **Step 2: Gate de API (con la API corriendo)**

Run:
```bash
pwsh scripts/gate-notificaciones.ps1
```
Expected: todas las líneas con los valores esperados (ver Task 7 Step 2).

- [ ] **Step 3: Regresión de gates de citas (no romper lo existente)**

Como tocamos `CitasService`, correr los gates de citas:
```bash
pwsh scripts/gate-e25b.ps1
pwsh scripts/gate-e2m7.ps1
pwsh scripts/gate-e3-noshow.ps1
```
Expected: sin líneas "FALLO".

- [ ] **Step 4: Avisar que queda listo para deploy**

NO deployar ni preguntar si deployar (regla del proyecto). Solo avisar al owner que el centro de notificaciones quedó implementado y verificado, listo para que él decida el deploy. Mencionar que hay una migración nueva (`notificaciones`) que se aplicará en producción al deployar.

---

## Notas de implementación

- **Timezone:** los mensajes y `citaFecha` usan hora/día LOCAL del server (igual que el resto del MVP: `toLocaleDateString('es-BO')` y `getFullYear/Month/Date`). No usar `setHours()` ni rangos UTC acá.
- **Fire-and-forget:** las 4 emisiones se llaman con `void` y el service traga errores; si la notificación falla, la cita/estado igual se guarda. Ese es el comportamiento deseado.
- **Polling vs realtime:** v1 es polling (30s). El modelo (tabla + endpoints) no cambia si más adelante se suma Web Push/WebSocket; solo se agregaría un emisor adicional.
- **CAJA:** el rol `CAJA` cae en "bandeja admin" por la regla `rol !== DOCTOR`. Si el owner quisiera excluirlo, sería un cambio puntual en `whereVisible`.
- **Fuera de v1 (no implementar):** eliminar/descartar notificación, WebSocket/Web Push, agrupación, notificaciones de otros módulos, preferencias por usuario.
```
