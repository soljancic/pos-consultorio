# Link de auto-reprogramacion, bip de notificacion y vista restringida del doctor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que el paciente reprograme su propia cita desde un link (token opaco), copiar ese link, sonar un bip al llegar una notificacion (con silenciar), y restringir la vista del rol DOCTOR.

**Architecture:** Backend NestJS + Prisma agrega `Cita.portalToken` y endpoints publicos de reprogramacion que mueven la MISMA cita a estado SOLICITADA. Frontend React reusa el patron de link/copiar de NuevaCitaModal, agrega modo reprogramacion al portal publico, un bip Web Audio en la campana, y filtros de rol en menu/rutas/horarios.

**Tech Stack:** NestJS, Prisma, PostgreSQL, class-validator; React 19, Vite, TanStack Query v5, React Router v7, Tailwind, lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-16-link-reprogramacion-bip-rol-doctor-design.md`

**Verificacion en cada commit (el agente no puede bootear el server; usa tsc):**
```
cd apps/api && npx tsc --noEmit
cd apps/web && npx tsc --noEmit
```
La migracion Prisma y los gates de runtime los corre el owner (ver memoria del proyecto).

---

## Feature A — Link de auto-reprogramacion + copiar link

### Task A1: Migracion — `Cita.portalToken`

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `Cita`, alrededor de la linea 302, junto a `deletedAt`)

- [ ] **Step 1: Agregar la columna al modelo `Cita`**

En `model Cita`, despues de `deletedAt DateTime?` agregar:

```prisma
  // Token opaco para el link de auto-reprogramacion del paciente
  // (capability URL: /reservar/:slug?reprogramar=token). Aleatorio e
  // impredecible, se genera la primera vez que se pide el link.
  portalToken     String?     @unique
```

- [ ] **Step 2: Generar la migracion (la corre el owner en dev)**

Comando (owner): `cd apps/api && npx prisma migrate dev --name cita_portal_token`
El agente solo deja el schema listo y regenera el client:
Run: `cd apps/api && npx prisma generate`
Expected: "Generated Prisma Client"

- [ ] **Step 3: Verificar tsc**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma
git commit -m "feat(citas): columna portalToken para link de reprogramacion"
```

---

### Task A2: `CitasService.tokenReprogramacion` + endpoint con auth

**Files:**
- Modify: `apps/api/src/modules/citas/citas.service.ts` (agregar `import { randomBytes }`; nuevo metodo)
- Modify: `apps/api/src/modules/citas/citas.controller.ts` (nuevo GET, declarado ANTES de `@Put(':id')`)

- [ ] **Step 1: Importar `randomBytes`**

En la cabecera de `citas.service.ts` agregar como primera linea:

```typescript
import { randomBytes } from 'crypto'
```

- [ ] **Step 2: Agregar el metodo `tokenReprogramacion`**

Despues del metodo `reprogramar(...)` (cierra alrededor de la linea 530), agregar:

```typescript
  // Token opaco para el link de auto-reprogramacion (espejo de
  // pacientes.portalToken): perezoso e idempotente. Solo para citas que se
  // pueden mover; una cita atendida/cancelada no genera link.
  async tokenReprogramacion(consultorioId: number, citaId: number) {
    const cita = await this.prisma.cita.findFirst({
      where: { id: citaId, consultorioId, deletedAt: null },
      select: { id: true, estado: true, portalToken: true },
    })
    if (!cita) throw new NotFoundException('Cita no encontrada')
    if (!ESTADOS_REPROGRAMABLES.includes(cita.estado)) {
      throw new BadRequestException(
        `No se puede reprogramar una cita en estado ${cita.estado}`,
      )
    }
    if (cita.portalToken) return { token: cita.portalToken }

    const actualizada = await this.prisma.cita.update({
      where: { id: citaId },
      data: { portalToken: randomBytes(18).toString('base64url') },
      select: { portalToken: true },
    })
    return { token: actualizada.portalToken }
  }
```

- [ ] **Step 3: Agregar el endpoint (ANTES de `@Put(':id')`)**

En `citas.controller.ts`, antes del bloque `@Put(':id')` (linea 55), agregar:

```typescript
  @Get(':id/token-reprogramacion')
  @ApiOperation({ summary: 'Token para el link de auto-reprogramacion (lo crea si no existe)' })
  tokenReprogramacion(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.tokenReprogramacion(user.consultorioId, id)
  }
```

- [ ] **Step 4: Verificar tsc**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/citas/
git commit -m "feat(citas): GET /citas/:id/token-reprogramacion"
```

---

### Task A3: `CitasService.reprogramarPorToken` (mover la misma cita a SOLICITADA)

**Files:**
- Modify: `apps/api/src/modules/citas/citas.service.ts`

- [ ] **Step 1: Agregar el metodo `reprogramarPorToken`**

Despues de `tokenReprogramacion`, agregar. Servicio FIJO (no cambia): la
duracion sale de la cita; solo se mueven doctor + fecha/hora. Estado -> SOLICITADA
para reusar el flujo de aceptacion del portal.

```typescript
  // Reprogramacion iniciada por el paciente desde el link publico. El token
  // identifica la cita exacta; servicio queda fijo (misma cita), solo cambia
  // doctor + fecha/hora. Vuelve a SOLICITADA: la secretaria reconfirma.
  // El caller (PortalService) ya valido que el doctor atiende el servicio.
  async reprogramarPorToken(
    consultorioId: number,
    token: string,
    dto: { doctorId: number; fecha: string; hora: string },
  ) {
    const cita = await this.prisma.cita.findFirst({
      where: { consultorioId, portalToken: token, deletedAt: null },
      include: { doctor: true, servicio: true },
    })
    if (!cita) throw new NotFoundException('Link no disponible')
    if (!ESTADOS_REPROGRAMABLES.includes(cita.estado)) {
      throw new ConflictException('Esta cita ya no se puede reprogramar')
    }

    const fechaHora = new Date(`${dto.fecha.slice(0, 10)}T${dto.hora}:00`)
    const fechaFin = new Date(fechaHora.getTime() + cita.duracionMin * 60 * 1000)
    await this.verificarDisponibilidad(consultorioId, dto.doctorId, fechaHora, fechaFin, cita.id)
    await this.verificarHorarioAtencion(consultorioId, dto.doctorId, fechaHora, fechaFin)

    const reprogramada = await this.prisma.$transaction(async (tx) => {
      const actualizada = await tx.cita.update({
        where: { id: cita.id },
        data: {
          fechaHora,
          doctorId: dto.doctorId,
          // pedido del paciente: vuelve a SOLICITADA para que la secretaria lo acepte
          estado: EstadoCita.SOLICITADA,
        },
        include: { doctor: true, servicio: true },
      })

      await tx.log.create({
        data: {
          consultorioId,
          usuarioId: cita.createdById,
          entidad: 'Cita',
          entidadId: cita.id,
          accion: 'UPDATE',
          payloadAntes: {
            fechaHora: cita.fechaHora.toISOString(),
            doctorId: cita.doctorId,
            estado: cita.estado,
          },
          payloadDespues: {
            fechaHora: fechaHora.toISOString(),
            doctorId: dto.doctorId,
            estado: EstadoCita.SOLICITADA,
            motivo: 'reprogramacion-portal',
          },
        },
      })

      return actualizada
    })

    // Avisa a admin + doctor que el paciente pidio reprogramar
    void this.notificaciones.emitirEventoCita(
      consultorioId,
      cita.id,
      TipoNotificacion.CITA_REPROGRAMADA,
      { admin: true, doctor: true },
    )

    return {
      fecha: dto.fecha.slice(0, 10),
      hora: dto.hora,
      doctor: reprogramada.doctor?.nombre,
      servicio: reprogramada.servicio?.nombre,
    }
  }
```

- [ ] **Step 2: Verificar tsc**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/citas/citas.service.ts
git commit -m "feat(citas): reprogramarPorToken mueve la cita a SOLICITADA"
```

---

### Task A4: PortalService — contexto + delegacion, con DTO

**Files:**
- Modify: `apps/api/src/modules/portal/portal.service.ts`

- [ ] **Step 1: Agregar el DTO de reprogramacion publica**

Despues de `DiasDisponiblesQueryDto` (linea 64) agregar:

```typescript
// Reprogramacion publica: el paciente solo elige doctor + nueva fecha/hora
export class ReprogramarPublicoDto {
  @IsInt()
  doctorId: number

  @IsISO8601()
  fecha: string

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'hora debe ser HH:mm' })
  hora: string
}
```

- [ ] **Step 2: Agregar `contextoReprogramacion` y `reprogramarPorToken` al PortalService**

Al final de la clase `PortalService` (antes del cierre `}`) agregar:

```typescript
  // Contexto del link de reprogramacion: cita actual + servicio fijo + los
  // doctores que atienden ese servicio (para el selector). Sin datos sensibles.
  async contextoReprogramacion(slug: string, token: string) {
    const c = await this.consultorioPorSlug(slug)
    const cita = await this.prisma.cita.findFirst({
      where: { consultorioId: c.id, portalToken: token, deletedAt: null },
      include: { doctor: true, servicio: true, paciente: true },
    })
    if (!cita || cita.deletedAt) throw new NotFoundException('Link no disponible')
    if (!['PENDIENTE', 'CONFIRMADA', 'SOLICITADA'].includes(cita.estado)) {
      throw new NotFoundException('Esta cita ya no se puede reprogramar')
    }

    // Doctores que atienden el servicio (lista de servicios vacia = atiende todos)
    const doctores = await this.prisma.doctor.findMany({
      where: { consultorioId: c.id, activo: true },
      select: {
        id: true, nombre: true, especialidad: true, colorAgenda: true,
        servicios: { select: { id: true } },
      },
      orderBy: { nombre: 'asc' },
    })
    const habilitados = doctores
      .filter((d) => d.servicios.length === 0 || d.servicios.some((s) => s.id === cita.servicioId))
      .map(({ servicios, ...d }) => d)

    return {
      consultorio: { nombre: c.nombre, logoUrl: c.logoUrl },
      cita: {
        fechaHoraActual: cita.fechaHora.toISOString(),
        doctorActual: { id: cita.doctorId, nombre: cita.doctor?.nombre },
      },
      servicio: {
        id: cita.servicioId,
        nombre: cita.servicio?.nombre,
        duracionMin: cita.servicio?.duracionMin,
      },
      doctores: habilitados,
      paciente: { nombre: cita.paciente?.nombre },
    }
  }

  async reprogramarPorToken(slug: string, token: string, dto: ReprogramarPublicoDto) {
    const c = await this.consultorioPorSlug(slug)
    // El servicio queda fijo: lo tomamos de la cita del token para guardar que
    // el doctor elegido efectivamente lo atiende (mismo guard que reservar()).
    const cita = await this.prisma.cita.findFirst({
      where: { consultorioId: c.id, portalToken: token, deletedAt: null },
      select: { servicioId: true },
    })
    if (!cita) throw new NotFoundException('Link no disponible')
    if (!(await this.doctores.atiendeServicio(dto.doctorId, cita.servicioId))) {
      throw new ConflictException('Ese profesional no atiende el servicio de la cita')
    }
    // El slot debe seguir libre y futuro (CitasService revalida solape/horario)
    const servicio = await this.prisma.servicio.findFirst({
      where: { id: cita.servicioId, consultorioId: c.id, activo: true },
    })
    if (!servicio) throw new NotFoundException('Servicio no encontrado')
    const disp = await this.doctores.getDisponibilidad(c.id, dto.doctorId, dto.fecha, servicio.duracionMin)
    if (!this.filtrarSlotsPasados(dto.fecha, disp.slots).includes(dto.hora)) {
      throw new ConflictException('Ese horario ya no esta disponible')
    }
    return this.citas.reprogramarPorToken(c.id, token, {
      doctorId: dto.doctorId,
      fecha: dto.fecha,
      hora: dto.hora,
    })
  }
```

- [ ] **Step 3: Verificar tsc**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/portal/portal.service.ts
git commit -m "feat(portal): contexto y submit de reprogramacion por token"
```

---

### Task A5: PortalController — endpoints publicos de reprogramacion

**Files:**
- Modify: `apps/api/src/modules/portal/portal.controller.ts`

- [ ] **Step 1: Importar el DTO nuevo**

En el import de `./portal.service` agregar `ReprogramarPublicoDto`:

```typescript
import { PortalService, ReservaPortalDto, DiasDisponiblesQueryDto, ReprogramarPublicoDto } from './portal.service'
```

- [ ] **Step 2: Agregar los dos endpoints (antes del cierre de la clase)**

Despues del metodo `reservar(...)` agregar:

```typescript
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Get(':slug/reprogramar/:token')
  @ApiOperation({ summary: 'Contexto del link de reprogramacion (cita, servicio fijo, doctores)' })
  contextoReprogramacion(@Param('slug') slug: string, @Param('token') token: string) {
    return this.service.contextoReprogramacion(slug, token)
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post(':slug/reprogramar/:token')
  @ApiOperation({ summary: 'Reprogramar (mover) la cita del token a una nueva fecha/hora' })
  reprogramarPorToken(
    @Param('slug') slug: string,
    @Param('token') token: string,
    @Body() dto: ReprogramarPublicoDto,
  ) {
    return this.service.reprogramarPorToken(slug, token, dto)
  }
```

- [ ] **Step 3: Verificar tsc**

Run: `cd apps/api && npx tsc --noEmit`
Expected: sin errores

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/portal/portal.controller.ts
git commit -m "feat(portal): endpoints publicos GET/POST /public/:slug/reprogramar/:token"
```

---

### Task A6: ReprogramarCitaModal — el WhatsApp manda el link + boton copiar

**Files:**
- Modify: `apps/web/src/features/agenda/ReprogramarCitaModal.tsx`

- [ ] **Step 1: Ajustar imports**

Reemplazar la linea de import de lucide y la de utils:

```typescript
import { AlertCircle, CalendarClock, Calendar, Clock, UserRound, Stethoscope, MessageCircle, Copy, Check } from 'lucide-react'
import { api } from '../../lib/api-client'
import { formatHora, abrirWhatsApp, publicBaseUrl, cn } from '../../lib/utils'
```

- [ ] **Step 2: Agregar queries de consultorio + token y estado de copiado**

Dentro del componente, despues de `const { consultorioNombre } = usePlantillasWhatsApp()` (linea 29), agregar:

```typescript
  const [copiado, setCopiado] = useState(false)

  // Portal: el link de reprogramacion solo aplica con el portal activo
  const { data: consultorio } = useQuery<{ slug: string | null; portalActivo: boolean }>({
    queryKey: ['consultorio'],
    queryFn: () => api.get('/consultorio').then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })
  const portalListo = !!(consultorio?.slug && consultorio.portalActivo)

  // Token opaco de la cita (lo crea el backend si no existe): deja el click sincrono
  const { data: tokenReprog } = useQuery<{ token: string }>({
    queryKey: ['cita-token-reprogramacion', cita.id],
    queryFn: () => api.get(`/citas/${cita.id}/token-reprogramacion`).then((r) => r.data),
    enabled: portalListo,
    staleTime: 5 * 60 * 1000,
  })

  function buildLinkReprogramar() {
    return `${publicBaseUrl()}/reservar/${consultorio!.slug}?reprogramar=${tokenReprog!.token}`
  }
```

- [ ] **Step 3: Reemplazar `handleWhatsApp` para que mande el link**

Reemplazar la funcion `handleWhatsApp` (lineas 65-70) por:

```typescript
  // Enviar al paciente el link para que reprograme el mismo su cita
  function handleWhatsApp() {
    const tel = cita.paciente?.telefono
    if (!tel || !tokenReprog?.token) return
    const msg = `Hola ${cita.paciente?.nombre ?? ''}, para reprogramar tu cita en ${consultorioNombre} elegi tu nueva fecha y horario desde este link: ${buildLinkReprogramar()}`
    abrirWhatsApp(tel, msg, cita.paciente?.pais)
  }

  async function copiarLink() {
    if (!tokenReprog?.token) return
    try {
      await navigator.clipboard.writeText(buildLinkReprogramar())
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      setError('No se pudo copiar el link')
    }
  }
```

- [ ] **Step 4: Reemplazar el boton de WhatsApp por la fila link + copiar**

Reemplazar el bloque `{cita.paciente?.telefono && (...)}` (lineas 141-150) por:

```tsx
          {portalListo && tokenReprog?.token && (
            <div>
              <div className="flex gap-2">
                {cita.paciente?.telefono && (
                  <button
                    type="button"
                    onClick={handleWhatsApp}
                    className={cn(btnOutlineUI, 'flex-1 text-accent hover:bg-accent/10')}
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    Enviar link por WhatsApp
                  </button>
                )}
                <button
                  type="button"
                  onClick={copiarLink}
                  aria-label="Copiar link de reprogramacion"
                  className={cn(btnOutlineUI, 'px-3 shrink-0')}
                >
                  {copiado ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" aria-hidden="true" />
                      Copiar
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                El paciente abre el link y elige el mismo su nueva fecha y horario.
              </p>
            </div>
          )}
```

- [ ] **Step 5: Verificar tsc**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/agenda/ReprogramarCitaModal.tsx
git commit -m "feat(agenda): enviar/copiar link de auto-reprogramacion en el modal"
```

---

### Task A7: ReservarPage — modo reprogramacion (`?reprogramar=token`)

**Files:**
- Modify: `apps/web/src/features/portal/ReservarPage.tsx`

> El modo reprogramacion reusa el calendario y los slots existentes. Servicio
> fijo (de la cita); doctor con selector; sin datos personales; submit a
> `POST /public/:slug/reprogramar/:token`.

- [ ] **Step 1: Leer el param `reprogramar` y el contexto**

Despues de `const tokenPaciente = params.get('p')` (linea 31) agregar:

```typescript
  const tokenReprog = params.get('reprogramar')
  const esReprogramacion = !!tokenReprog
```

Despues de la query `info` (linea 55) agregar la query de contexto:

```typescript
  type CtxReprog = {
    cita: { fechaHoraActual: string; doctorActual: { id: number; nombre?: string } }
    servicio: { id: number; nombre?: string; duracionMin?: number }
    doctores: Array<{ id: number; nombre: string; especialidad: string | null; colorAgenda: string }>
    paciente: { nombre?: string }
  }
  const { data: ctxReprog, isError: errReprog } = useQuery<CtxReprog>({
    queryKey: ['portal-reprog', slug, tokenReprog],
    queryFn: () => api.get(`/public/${slug}/reprogramar/${tokenReprog}`).then((r) => r.data),
    enabled: esReprogramacion,
    retry: false,
  })
```

- [ ] **Step 2: Fijar servicio/doctor desde el contexto**

Despues del `useEffect` que aplica `prefill` (linea 79) agregar:

```typescript
  // En reprogramacion el servicio es fijo (de la cita); el doctor arranca en el actual
  useEffect(() => {
    if (!ctxReprog) return
    setServicioId(String(ctxReprog.servicio.id))
    setDoctorId(String(ctxReprog.cita.doctorActual.id))
  }, [ctxReprog])
```

- [ ] **Step 3: Mutation de reprogramacion**

Despues de la mutation `reservar` (linea 141) agregar:

```typescript
  const reprogramar = useMutation({
    mutationFn: () =>
      api.post(`/public/${slug}/reprogramar/${tokenReprog}`, {
        doctorId: Number(doctorId),
        fecha,
        hora,
      }),
    onSuccess: (res) => setConfirmacion(res.data),
    onError: (err: any) => {
      const msg = err.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : msg ?? 'No se pudo reprogramar, intente de nuevo')
      setHora('')
    },
  })
```

- [ ] **Step 4: Link invalido de reprogramacion -> mismo estado de error**

Cambiar la guarda de error (linea 146) de:

```tsx
  if (isError || !info) {
```
a:
```tsx
  if (isError || !info || (esReprogramacion && errReprog)) {
```

- [ ] **Step 5: Banner de reprogramacion arriba del form**

Dentro del `<form ...>` de reserva, como primer hijo (antes del `<FloatingSelect id="res-servicio" ...>`, linea 210), agregar:

```tsx
            {esReprogramacion && ctxReprog && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                <p className="text-sm font-medium text-foreground">
                  Reprogramando tu cita de {ctxReprog.servicio.nombre}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Actual: {formatDia(ctxReprog.cita.fechaHoraActual, "EEEE d 'de' MMMM")} con{' '}
                  {ctxReprog.cita.doctorActual.nombre}. Elegi tu nuevo dia y horario.
                </p>
              </div>
            )}
```

- [ ] **Step 6: Ocultar el selector de servicio en reprogramacion (queda fijo)**

Envolver el `<FloatingSelect id="res-servicio" ...>` (lineas 210-228) en `{!esReprogramacion && (...)}`. El servicio ya quedo seteado por el efecto del Step 2, asi que el calendario funciona igual.

- [ ] **Step 7: En reprogramacion, saltar el bloque de datos personales y enviar la mutation correcta**

7a. Cambiar el `onSubmit` del form (linea 207) para elegir la mutation:

```tsx
            onSubmit={(e) => { e.preventDefault(); setError(''); (esReprogramacion ? reprogramar : reservar).mutate() }}
```

7b. El bloque de datos personales `{mostrarForm && hora && (...)}` (lineas 372-456): envolver su condicion para que NO aparezca en reprogramacion -> `{!esReprogramacion && mostrarForm && hora && (...)}`.

7c. El boton submit `{mostrarForm && hora && (...)}` (lineas 465-474): en reprogramacion debe poder enviarse apenas hay hora elegida (sin "mostrarForm"). Reemplazar su condicion y label:

```tsx
            {((esReprogramacion && hora) || (mostrarForm && hora)) && (
              <button
                type="submit"
                disabled={reservar.isPending || reprogramar.isPending}
                className={cn(btnPrimaryUI, 'w-full h-11')}
              >
                <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                {esReprogramacion
                  ? (reprogramar.isPending ? 'Reprogramando...' : `Confirmar ${formatDia(fecha, 'dd/MM')} a las ${hora}`)
                  : (reservar.isPending ? 'Reservando...' : `Reservar ${formatDia(fecha, 'dd/MM')} a las ${hora}`)}
              </button>
            )}
```

7d. El boton "Siguiente" que revela el form (lineas 356-365): ocultarlo en reprogramacion -> condicion `{!esReprogramacion && hora && !mostrarForm && (...)}`.

- [ ] **Step 8: Doctores del selector en reprogramacion**

En el calculo de `doctores` (lineas 160-165), cuando es reprogramacion usar los del contexto. Reemplazar por:

```tsx
  const doctores = esReprogramacion
    ? (ctxReprog?.doctores ?? [])
    : (doctorFijo
        ? info.doctores.filter((d) => String(d.id) === doctorFijo)
        : info.doctores
      ).filter(
        (d) => !servicioId || d.servicioIds.length === 0 || d.servicioIds.includes(Number(servicioId)),
      )
```

(El `<FloatingSelect id="res-doctor">` ya mapea `doctores`; en reprogramacion queda habilitado para cambiar de profesional.)

- [ ] **Step 9: Confirmacion en reprogramacion**

En el bloque de confirmacion (lineas 191-204), el texto del pie cambia segun el modo. Reemplazar el `<p className="text-xs text-muted-foreground">` final por:

```tsx
            <p className="text-xs text-muted-foreground">
              {esReprogramacion
                ? 'El consultorio confirmara tu nueva fecha a la brevedad.'
                : 'El consultorio lo contactará por email para confirmar la cita.'}
            </p>
```

Y el titulo `<h2>` (linea 194) -> condicional:

```tsx
            <h2 className="text-xl font-bold text-foreground">
              {esReprogramacion ? '¡Reprogramación enviada!' : '¡Reserva enviada!'}
            </h2>
```

- [ ] **Step 10: Verificar tsc**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/features/portal/ReservarPage.tsx
git commit -m "feat(portal): modo reprogramacion en ReservarPage (?reprogramar=token)"
```

- [ ] **Step 12: Prueba manual end-to-end (owner, con API + web corriendo)**

1. En Agenda, abrir una cita PENDIENTE/CONFIRMADA -> Reprogramar -> "Copiar".
2. Abrir el link en otra pestana -> ver banner, elegir doctor/dia/hora -> Confirmar.
3. Verificar en Agenda que la MISMA cita se movio y quedo SOLICITADA, y que entro la notificacion.

---

## Feature C — Bip en notificacion nueva + silenciar

### Task C1: Helper de sonido (Web Audio) + preferencia persistida

**Files:**
- Create: `apps/web/src/features/notificaciones/sonido.ts`

- [ ] **Step 1: Crear el helper**

```typescript
// Bip corto de notificacion via Web Audio (sin asset: anda offline en la PWA).
// El AudioContext exige un gesto de usuario previo; se crea perezosamente.
const SONIDO_KEY = 'pos-notif-sonido'

let ctx: AudioContext | null = null

export function sonidoActivado(): boolean {
  return localStorage.getItem(SONIDO_KEY) !== 'off'
}

export function setSonidoActivado(on: boolean) {
  localStorage.setItem(SONIDO_KEY, on ? 'on' : 'off')
}

export function reproducirBip() {
  if (!sonidoActivado()) return
  try {
    const AC = window.AudioContext ?? (window as any).webkitAudioContext
    if (!AC) return
    ctx = ctx ?? new AC()
    if (ctx.state === 'suspended') void ctx.resume()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    const t = ctx.currentTime
    // ataque corto + release suave para evitar el click
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.15, t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.2)
  } catch {
    // sin audio disponible: ignorar
  }
}
```

- [ ] **Step 2: Verificar tsc**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/notificaciones/sonido.ts
git commit -m "feat(notificaciones): helper de bip Web Audio con preferencia persistida"
```

---

### Task C2: Bip al subir el contador en NotificacionesBell

**Files:**
- Modify: `apps/web/src/features/notificaciones/NotificacionesBell.tsx`

- [ ] **Step 1: Importar `useRef`, `useEffect` y el helper**

```typescript
import { useState, useRef, useEffect } from 'react'
```
Y agregar:
```typescript
import { reproducirBip } from './sonido'
```

- [ ] **Step 2: Detectar el aumento del contador y sonar**

Despues de `const count = data?.count ?? 0` (linea 26) agregar:

```typescript
  // Bip solo cuando el contador SUBE (no en la primera carga ni al bajar)
  const countPrevio = useRef<number | null>(null)
  useEffect(() => {
    if (countPrevio.current !== null && count > countPrevio.current) {
      reproducirBip()
    }
    countPrevio.current = count
  }, [count])
```

- [ ] **Step 3: Verificar tsc**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/notificaciones/NotificacionesBell.tsx
git commit -m "feat(notificaciones): bip al llegar una notificacion nueva"
```

---

### Task C3: Toggle silenciar en el header del panel

**Files:**
- Modify: `apps/web/src/features/notificaciones/NotificacionesPanel.tsx`

- [ ] **Step 1: Imports**

Agregar a `useEffect` -> `useState`:
```typescript
import { useEffect, useState } from 'react'
```
En el import de lucide (linea 4) agregar `Volume2, VolumeX`:
```typescript
import { X, CheckCheck, BellOff, Volume2, VolumeX } from 'lucide-react'
```
Y debajo de los imports locales:
```typescript
import { sonidoActivado, setSonidoActivado } from './sonido'
```

- [ ] **Step 2: Estado del toggle**

Dentro del componente, despues de `const navigate = useNavigate()` (linea 14) agregar:

```typescript
  const [sonido, setSonido] = useState(sonidoActivado)
  function toggleSonido() {
    const nuevo = !sonido
    setSonido(nuevo)
    setSonidoActivado(nuevo)
  }
```

- [ ] **Step 3: Boton en el header**

En el `<div className="flex items-center gap-1">` del header (linea 75), antes del boton "Marcar todas", agregar:

```tsx
            <button
              onClick={toggleSonido}
              aria-pressed={sonido}
              aria-label={sonido ? 'Silenciar notificaciones' : 'Activar sonido de notificaciones'}
              title={sonido ? 'Silenciar' : 'Activar sonido'}
              className="inline-flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:bg-muted cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 transition-colors duration-150"
            >
              {sonido ? <Volume2 className="h-4 w-4" aria-hidden="true" /> : <VolumeX className="h-4 w-4" aria-hidden="true" />}
            </button>
```

- [ ] **Step 4: Verificar tsc**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/notificaciones/NotificacionesPanel.tsx
git commit -m "feat(notificaciones): toggle de silenciar el bip en el panel"
```

---

## Feature D — Perfil doctor: vista restringida

### Task D1: Ocultar secciones del menu para DOCTOR

**Files:**
- Modify: `apps/web/src/components/shared/AppShell.tsx`

- [ ] **Step 1: Marcar los items restringidos**

En `NAV_ITEMS` (lineas 33-47), agregar `ocultarDoctor: true` a Deudores, Mensajes, Caja, Gastos y Catalogo:

```typescript
  { to: '/deudores', icon: AlertCircle, label: 'Deudores', ocultarDoctor: true },
  { to: '/mensajes', icon: MessageCircle, label: 'Mensajes', ocultarDoctor: true },
  { to: '/caja', icon: DollarSign, label: 'Caja', ocultarDoctor: true },
  { to: '/gastos', icon: Receipt, label: 'Gastos', ocultarDoctor: true },
  { to: '/catalogo', icon: Settings, label: 'Catálogo', ocultarDoctor: true },
```

- [ ] **Step 2: Calcular `esDoctor` y filtrar el nav**

Despues de `const esAdmin = user?.rol === 'ADMIN'` (linea 87) agregar:

```typescript
  const esDoctor = user?.rol === 'DOCTOR'
```

Cambiar el filtro del nav (linea 183) de:
```tsx
          {NAV_ITEMS.filter((item) => !item.soloAdmin || esAdmin).map(
```
a:
```tsx
          {NAV_ITEMS.filter((item) => (!item.soloAdmin || esAdmin) && !(esDoctor && item.ocultarDoctor)).map(
```

- [ ] **Step 3: No traer el badge de Mensajes para doctores**

En la query `mensajes-pendientes-count` (lineas 90-95) agregar `enabled: !esDoctor`:

```typescript
  const { data: pendientes } = useQuery<{ pendientes: number }>({
    queryKey: ['mensajes-pendientes-count'],
    queryFn: () => api.get('/mensajes/pendientes/count').then((r) => r.data),
    refetchInterval: 2 * 60 * 1000,
    staleTime: 60 * 1000,
    enabled: !esDoctor,
  })
```

- [ ] **Step 4: Ocultar el widget de turno/Caja para doctores**

Envolver el bloque `{turno && (...)}` (lineas 225-262) en `{!esDoctor && turno && (...)}`.

- [ ] **Step 5: Verificar tsc**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/shared/AppShell.tsx
git commit -m "feat(shell): ocultar secciones no permitidas para el rol DOCTOR"
```

---

### Task D2: Guard de ruta `SoloStaff` (ADMIN/SECRETARIA)

**Files:**
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Agregar el guard junto a `AdminRoute`**

Despues de la funcion `AdminRoute` (linea 37-40) agregar:

```tsx
// Rutas no visibles para DOCTOR: si tipea la URL a mano, lo mandamos a Agenda.
function SoloStaff({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  return user?.rol === 'DOCTOR' ? <Navigate to="/agenda" replace /> : <>{children}</>
}
```

(`useAuthStore` ya esta importado para `AdminRoute`.)

- [ ] **Step 2: Envolver las 5 rutas**

Reemplazar las rutas `caja`, `gastos`, `deudores`, `mensajes`, `catalogo` (lineas 65-69) por:

```tsx
        <Route path="caja" element={<SoloStaff><CajaPage /></SoloStaff>} />
        <Route path="gastos" element={<SoloStaff><GastosPage /></SoloStaff>} />
        <Route path="deudores" element={<SoloStaff><DeudoresPage /></SoloStaff>} />
        <Route path="mensajes" element={<SoloStaff><MensajesPage /></SoloStaff>} />
        <Route path="catalogo" element={<SoloStaff><CatalogoPage /></SoloStaff>} />
```

- [ ] **Step 3: Verificar tsc**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat(routing): guard SoloStaff bloquea rutas restringidas al DOCTOR"
```

---

### Task D3: Horarios — el doctor ve solo su propia fila

**Files:**
- Modify: `apps/web/src/features/calendario/CalendarioAtencionPage.tsx`

- [ ] **Step 1: Derivar la lista visible**

Despues de `const puedeEditar = ...` (linea 63) agregar:

```typescript
  // El doctor solo ve su propia fila; admin/secretaria ven a todos
  const doctoresVisibles = esDoctor
    ? (doctorPropio ? [doctorPropio] : [])
    : doctores
```

- [ ] **Step 2: Usar `doctoresVisibles` en los tres `.map` de doctores**

Reemplazar `doctores.map(` por `doctoresVisibles.map(` en:
- el bloque mobile (linea ~150)
- el bloque desktop por fila (linea ~217)

Y cambiar la guarda de empty state (linea 110) de `doctores.length === 0` a `doctoresVisibles.length === 0`, ajustando el copy para el caso doctor sin Doctor vinculado:

```tsx
        ) : doctoresVisibles.length === 0 ? (
          <EmptyState
            icon={UserRound}
            title={esDoctor ? 'No tenés un profesional vinculado' : 'No hay doctores activos'}
            description={esDoctor
              ? 'Pedile al administrador que vincule tu usuario a un profesional para ver tus horarios.'
              : 'Creá un profesional en el Catálogo para configurar sus horarios.'}
            action={esDoctor ? undefined : <Link to="/catalogo" className={cn(btnPrimaryUI, 'h-9')}>Ir al Catálogo</Link>}
          />
        ) : (
```

- [ ] **Step 3: Verificar tsc**

Run: `cd apps/web && npx tsc --noEmit`
Expected: sin errores

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/calendario/CalendarioAtencionPage.tsx
git commit -m "feat(horarios): el rol DOCTOR ve solo su propio calendario"
```

- [ ] **Step 5: Prueba manual (owner)**

Login como usuario DOCTOR: el menu no muestra Deudores/Mensajes/Caja/Gastos/Catalogo;
tipear `/caja` redirige a Agenda; Horarios muestra solo su fila.

---

## Self-Review (cubierto)

- Spec seccion 1 (link reprogramacion): Tasks A1-A7.
- Spec seccion 2 (copiar link): Task A6 step 4.
- Spec seccion 3 (bip + silenciar): Tasks C1-C3.
- Spec seccion 4 (rol doctor: menu/rutas/horarios): Tasks D1-D3.
- Tipos consistentes: `reprogramarPorToken` (mismo nombre en CitasService y PortalService),
  `tokenReprogramacion`, `ReprogramarPublicoDto`, `sonidoActivado/setSonidoActivado/reproducirBip`,
  `esDoctor`, `doctoresVisibles`, `SoloStaff`, `ocultarDoctor`.
- Sin placeholders: cada step trae el codigo real.

## Notas de implementacion
- La migracion es aditiva (columna nullable unica): segura, no destructiva.
- No deployar; al terminar avisar "listo para deploy" (regla del proyecto).
