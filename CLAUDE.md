# CLAUDE.md - POS del Consultorio

> Biblia del proyecto: `PLAN.md` (roadmap, modelo de datos, endpoints, issues conocidos).
> Specs y planes de implementacion: `docs/superpowers/specs/` y `docs/superpowers/plans/`.

---

## Workflow obligatorio

```
1. PLANIFICAR  →  2. CHECKLIST (PLAN.md §8b)  →  3. IMPLEMENTAR  →  4. VERIFICAR
```

1. **Planificar** — si existe plan en `docs/superpowers/plans/`, seguirlo task por task
2. **Checklist** — aplicar "Buenas practicas y seguridad" de PLAN.md seccion 8b
3. **Implementar** — seguir patrones de los archivos de referencia (abajo)
4. **Verificar** — antes de cada commit:

```bash
cd apps/api && npx tsc --noEmit
cd apps/web && npx tsc --noEmit
```

---

## Stack

```
Monorepo pnpm workspaces
apps/api  → NestJS + Prisma + PostgreSQL + JWT/Passport + argon2
apps/web  → React 19 + Vite + TypeScript + Tailwind + TanStack Query v5 + Zustand + React Router v7
packages/types → enums y tipos compartidos (@pos/types, exporta TS crudo sin build)
```

---

## Reglas criticas

```
MULTI-TENANT:
- consultorioId SIEMPRE sale del JWT (@CurrentUser()), NUNCA del body/params
- Todo findFirst/findMany/update filtra por consultorioId

VALIDACION:
- ValidationPipe global con whitelist + forbidNonWhitelisted
- TODO DTO necesita decoradores class-validator o el request da 400
- Frontend envia undefined (no '') en opcionales vacios

ROLES:
- Idioma: @Roles(Rol.ADMIN) con Rol de @pos/types
- RolesGuard ya es global (APP_GUARD en auth.module)
- El guard de UI (AdminRoute) es UX; la seguridad real es el backend

DINERO:
- Decimal de Prisma siempre; Number() solo para mostrar en UI
- Un Cobro acepta multiples Pagos (pagos parciales / divididos)
- Pagos NUNCA se borran; correcciones via asiento de reversa (Etapa 2)

DATOS:
- Borrado siempre soft (deletedAt / activo: false)
- Operaciones multi-tabla en prisma.$transaction
- Acciones criticas registran en tabla logs

ESTADOS DE CITA:
- Maquina de estados via transicionValida() de @pos/types
- EstadoCita: backend importa de @prisma/client, frontend de @pos/types (valores identicos)
- La deuda real = cobros con saldo de citas ATENDIDA/CON_DEUDA (no PENDIENTE de citas futuras)
- Deudas ALERTAN pero NO BLOQUEAN (se puede seguir agendando a un deudor)
```

---

## Fechas

```
- Services del API: rangos UTC con strings Z → new Date(`${fecha}T00:00:00Z`)
- NUNCA setHours() en backend para fechas de BD
- Frontend envia fechaHora con new Date(...).toISOString()
- Frontend muestra con formatFecha/formatHora de lib/utils.ts (date-fns + locale es)
```

---

## Archivos de referencia

| Patron | Archivo |
|--------|---------|
| Controller + service API | `apps/api/src/modules/pacientes/` |
| Maquina de estados + transaccion + log | `apps/api/src/modules/citas/citas.service.ts` |
| Pago transaccional (caja + deuda + log) | `apps/api/src/modules/cobros/cobros.service.ts` |
| DTO con class-validator | `apps/api/src/auth/dto/register.dto.ts` |
| Pagina con query + modal | `apps/web/src/features/agenda/AgendaPage.tsx` |
| Modal con mutation | `apps/web/src/features/agenda/CobroModal.tsx` |
| Utils frontend (DRY: buscar aqui primero) | `apps/web/src/lib/utils.ts` |
| Axios con JWT | `apps/web/src/lib/api-client.ts` |
| Auth store | `apps/web/src/stores/auth.store.ts` |

---

## Don'ts

```
✗ consultorioId desde el body o params
✗ DTO sin decoradores class-validator (400 garantizado)
✗ Borrar registros (usar soft delete)
✗ float para dinero
✗ setHours() en services del API
✗ @Roles('ADMIN') con string (usar Rol.ADMIN)
✗ Exponer passwordHash en una respuesta (select explicito siempre)
✗ Duplicar logica que ya existe en lib/utils.ts
✗ queryKey planas que pisen cache de otra vista (usar jerarquia: ['servicios','todos'])
```

---

## Problemas comunes

| Error | Solucion |
|-------|----------|
| Prisma client desactualizado | `cd apps/api && npx prisma generate` |
| 400 "property X should not exist" | Falta decorador class-validator en el DTO |
| @pos/types no resuelve | Es TS crudo via workspace; no agregar paths en tsconfig del api |
| Decimal en respuesta JSON | Llega como string; convertir con Number() en el frontend |
| Ruta NestJS interpreta segmento como :id | Declarar rutas literales antes que las parametrizadas |

---

## Memoria del proyecto (claude-mem)

claude-mem graba observaciones automaticamente (hooks activos). Ademas hay un
**corpus consultable** llamado `pos-consultorio` con las decisiones, bugfixes
y refactors (el conocimiento que NO se deduce del codigo).

- Preguntar al historial: `prime_corpus("pos-consultorio")` y luego
  `query_corpus` (ej: "que bugs de timezone hubo y como se resolvieron").
- El corpus es un snapshot: tras varias sesiones nuevas, regenerarlo con
  `rebuild_corpus` o `build_corpus` (mismo nombre, filtro
  `types: decision,bugfix,refactor,security_note`, `limit: 500`).
- Para busquedas puntuales sin corpus: `search` / `get_observations`.

## Grafo de conocimiento (graphify)

`graphify-out/graph.json` existe (683 nodos, 51 comunidades; regenerable, no
versionado). Para preguntas de arquitectura/relaciones usar primero:
`graphify query "<pregunta>"` · `graphify path "A" "B"` · `graphify explain "Nodo"`
Tras cambios grandes: `/graphify . --update` (incremental, usa el manifest).

## Comandos

```bash
pnpm install                          # raiz del monorepo
cd packages/types && pnpm build       # OBLIGATORIO tras cambiar tipos compartidos
cd apps/api && npx prisma migrate dev # migraciones (dev)
cd apps/api && pnpm start:dev         # API en :3000 (Swagger en /api/docs)
cd apps/web && pnpm dev               # web en :5173
```

## Testing (ver docs/TESTING.md)

```bash
cd apps/api && npx jest               # unit: maquina de estados
scripts/gate-*.ps1                    # gates de API (API corriendo; crean su propio tenant)
cd apps/web && npx playwright test    # E2E UI (API :3000 + vite :5173)
```

- Cada hito nuevo agrega su gate y/o spec; los anteriores corren como regresion.
- Un bug de runtime gana un caso en el gate que lo hubiera atrapado.
- PS 5.1: `ConvertFrom-Json -InputObject` (el pipeline no enumera arrays).
- La suite E2E necesita `LOGIN_RATE_LIMIT` alto en apps/api/.env (throttle).
