# Fixes Previos — Plan de Implementacion

> **Para agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Practicas:** aplicar el checklist "Buenas practicas y seguridad" de `PLAN.md` (seccion 8b) en todo el codigo de este plan.

**Goal:** Corregir 3 bugs bloqueantes detectados en la auditoria del codigo. **Este plan se ejecuta ANTES que los otros 5 planes** — sin estos fixes, los POST/PUT de la API fallan en runtime y los datos de deuda son incorrectos.

**Architecture:** Sin cambios de arquitectura. Fix 1: decoradores class-validator en DTOs de modulos. Fix 2: mantenimiento del campo desnormalizado `Paciente.deudaTotal`. Fix 3: timezone en la creacion de citas.

**Tech Stack:** NestJS, class-validator, Prisma, React

---

### Task 1: Agregar decoradores class-validator a los DTOs de modulos

**Contexto del bug:** `main.ts` configura `ValidationPipe` con `whitelist: true, forbidNonWhitelisted: true`. Solo los DTOs de `auth/dto/` tienen decoradores. Los DTOs de citas, pacientes, servicios, doctores y cobros NO tienen ninguno — con whitelist activo, **toda propiedad sin decorador se considera no permitida y el request devuelve 400** ("property X should not exist"). Esto rompe TODOS los POST/PUT de la API excepto auth.

**Files:**
- Modify: `apps/api/src/modules/citas/citas.service.ts` (CreateCitaDto, CambiarEstadoDto)
- Modify: `apps/api/src/modules/pacientes/pacientes.service.ts` (CreatePacienteDto)
- Modify: `apps/api/src/modules/servicios/servicios.service.ts` (CreateServicioDto)
- Modify: `apps/api/src/modules/doctores/doctores.service.ts` (CreateDoctorDto, CreateHorarioDto)
- Modify: `apps/api/src/modules/cobros/cobros.service.ts` (RegistrarPagoDto)

- [ ] **Step 1: CreateCitaDto y CambiarEstadoDto**

```typescript
// apps/api/src/modules/citas/citas.service.ts
import { IsString, IsNotEmpty, IsOptional, IsISO8601, IsEnum } from 'class-validator'

export class CreateCitaDto {
  @IsString() @IsNotEmpty()
  pacienteId: string

  @IsString() @IsNotEmpty()
  doctorId: string

  @IsString() @IsNotEmpty()
  servicioId: string

  @IsISO8601()
  fechaHora: string

  @IsString() @IsOptional()
  notasSecretaria?: string
}

export class CambiarEstadoDto {
  @IsEnum(EstadoCita)
  estado: EstadoCita

  @IsString() @IsOptional()
  motivo?: string
}
```

- [ ] **Step 2: CreatePacienteDto**

```typescript
// apps/api/src/modules/pacientes/pacientes.service.ts
import { IsString, IsNotEmpty, IsOptional, IsEmail, IsISO8601 } from 'class-validator'

export class CreatePacienteDto {
  @IsString() @IsNotEmpty()
  nombre: string

  @IsString() @IsNotEmpty()
  apellido: string

  @IsString() @IsOptional()
  dni?: string

  @IsString() @IsOptional()
  telefono?: string

  @IsString() @IsOptional()
  whatsapp?: string

  @IsEmail() @IsOptional()
  email?: string

  @IsISO8601() @IsOptional()
  fechaNacimiento?: string

  @IsString() @IsOptional()
  notas?: string
}
```

> Nota: el frontend debe enviar `undefined` (no `''`) en los campos opcionales vacios, o `@IsEmail`/`@IsISO8601` rechazaran el string vacio. Los modales de los otros planes ya contemplan esto.

- [ ] **Step 3: CreateServicioDto + UpdateServicioDto con activo**

```typescript
// apps/api/src/modules/servicios/servicios.service.ts
import { IsString, IsNotEmpty, IsOptional, IsInt, Min, IsNumber, IsBoolean } from 'class-validator'
import { PartialType } from '@nestjs/swagger'

export class CreateServicioDto {
  @IsString() @IsNotEmpty()
  nombre: string

  @IsString() @IsOptional()
  descripcion?: string

  @IsInt() @Min(5)
  duracionMin: number

  @IsNumber() @Min(0)
  precioBase: number
}

export class UpdateServicioDto extends PartialType(CreateServicioDto) {
  @IsBoolean() @IsOptional()
  activo?: boolean
}
```

Actualizar la firma de `update` para usar `UpdateServicioDto` (y el controller que hoy usa `Partial<CreateServicioDto>`).

- [ ] **Step 4: CreateDoctorDto + UpdateDoctorDto + CreateHorarioDto**

```typescript
// apps/api/src/modules/doctores/doctores.service.ts
import { IsString, IsNotEmpty, IsOptional, IsInt, Min, Max, IsBoolean, Matches } from 'class-validator'
import { PartialType } from '@nestjs/swagger'

export class CreateDoctorDto {
  @IsString() @IsNotEmpty()
  nombre: string

  @IsString() @IsOptional()
  especialidad?: string

  @IsString() @IsOptional()
  colorAgenda?: string

  @IsString() @IsOptional()
  usuarioId?: string
}

export class UpdateDoctorDto extends PartialType(CreateDoctorDto) {
  @IsBoolean() @IsOptional()
  activo?: boolean
}

export class CreateHorarioDto {
  @IsInt() @Min(0) @Max(6)
  diaSemana: number

  @Matches(/^\d{2}:\d{2}$/)
  horaInicio: string

  @Matches(/^\d{2}:\d{2}$/)
  horaFin: string
}
```

- [ ] **Step 5: RegistrarPagoDto**

```typescript
// apps/api/src/modules/cobros/cobros.service.ts
import { IsNumber, Min, IsEnum, IsString, IsOptional } from 'class-validator'

export class RegistrarPagoDto {
  @IsNumber() @Min(0.01)
  monto: number

  @IsEnum(FormaPago)
  formaPago: FormaPago

  @IsString() @IsOptional()
  referencia?: string
}
```

> `@IsEnum` requiere un enum runtime. `FormaPago` y `EstadoCita` de `@pos/types` son objetos const — verificar que `Object.values()` funcione con `@IsEnum`; si no, usar `@IsIn(Object.values(FormaPago))`.

- [ ] **Step 6: Smoke test runtime**

```bash
cd apps/api && npx tsc --noEmit
```

Luego levantar la API y probar con curl/Swagger un `POST /api/v1/citas` y un `POST /api/v1/pacientes` reales — deben devolver 201, no 400.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/
git commit -m "fix(api): add class-validator decorators to module DTOs (whitelist was rejecting all bodies)"
```

---

### Task 2: Mantener `Paciente.deudaTotal` al marcar la cita como ATENDIDA

**Contexto del bug:** `registrarPago` hace `deudaTotal: { decrement: monto }` pero **nada lo incrementa nunca** — el campo queda en 0 o negativo. Semantica correcta: la deuda nace cuando la cita pasa a ATENDIDA (el servicio fue prestado y hay saldo por cobrar). Las citas futuras o canceladas no son deuda aunque su cobro este PENDIENTE.

**Files:**
- Modify: `apps/api/src/modules/citas/citas.service.ts` — `cambiarEstado`

- [ ] **Step 1: Incrementar deudaTotal en la transicion a ATENDIDA**

En `cambiarEstado`, cargar tambien el cobro de la cita y, dentro de la transaccion, si `dto.estado === EstadoCita.ATENDIDA`:

```typescript
// dentro de cambiarEstado, reemplazar el findFirst inicial:
const cita = await this.prisma.cita.findFirst({
  where: { id: citaId, consultorioId, deletedAt: null },
  include: { cobro: { select: { saldoPendiente: true } } },
})

// y dentro de prisma.$transaction (convertir a callback form):
await this.prisma.$transaction(async (tx) => {
  await tx.cita.update({ where: { id: citaId }, data: { estado: dto.estado } })

  if (dto.estado === EstadoCita.ATENDIDA && cita.cobro) {
    await tx.paciente.update({
      where: { id: cita.pacienteId },
      data: { deudaTotal: { increment: cita.cobro.saldoPendiente } },
    })
  }

  await tx.log.create({ /* igual que hoy */ })
})
```

> La maquina de estados garantiza que ATENDIDA se alcanza una sola vez (no hay transicion que vuelva a ella), por lo que no se duplica el incremento.

- [ ] **Step 2: Verificar y commit**

```bash
cd apps/api && npx tsc --noEmit
git add apps/api/src/modules/citas/
git commit -m "fix(citas): increment paciente.deudaTotal when cita becomes ATENDIDA"
```

---

### Task 3: Fix timezone en NuevaCitaModal

**Contexto del bug:** el modal envia `fechaHora: \`${fecha}T${hora}:00\`` sin offset. `new Date()` en el backend lo interpreta en el timezone del servidor — en un server UTC, una cita de las 10:00 en Argentina (UTC-3) se guarda como 10:00 UTC = 07:00 local.

**Files:**
- Modify: `apps/web/src/features/agenda/NuevaCitaModal.tsx`

- [ ] **Step 1: Convertir a ISO UTC en el navegador**

```typescript
// El navegador del usuario esta en el timezone del consultorio.
// new Date('YYYY-MM-DDTHH:mm:00') interpreta hora local; toISOString() la convierte a UTC.
fechaHora: new Date(`${fecha}T${hora}:00`).toISOString(),
```

> Limite conocido: asume que el navegador opera en el timezone del consultorio. La solucion definitiva (usar `consultorio.timezone` del backend) queda para cuando se implemente Configuracion.

- [ ] **Step 2: Verificar y commit**

```bash
cd apps/web && npx tsc --noEmit
git add apps/web/src/features/agenda/NuevaCitaModal.tsx
git commit -m "fix(agenda): send fechaHora as UTC ISO string to avoid timezone drift"
```
