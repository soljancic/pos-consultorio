# POS del Consultorio

Sistema operativo tipo POS para consultorios medicos pequenos y medianos (1-10
profesionales), multi-tenant SaaS. Estado: **v0.1.0-mvp** — Etapa 1 completa
(agenda con maquina de estados, pacientes, cobros con pagos parciales, deudores,
caja diaria, atencion clinica basica, catalogo, configuracion, dashboard).

> **Documento madre:** [PLAN.md](PLAN.md) — vision, modelo de datos, roadmap de
> 7 etapas, reglas de negocio y estado actual.
> **Guia de desarrollo:** [CLAUDE.md](CLAUDE.md) — workflow, patrones, gotchas.

## Stack

```
apps/api        NestJS 11 + Prisma 6 + PostgreSQL · JWT/Passport · argon2
apps/web        React 19 + Vite + TypeScript + Tailwind · TanStack Query v5 · Zustand
packages/types  Enums y tipos compartidos (@pos/types, buildea a dist/)
```

Monorepo con pnpm workspaces.

## Setup local

```bash
pnpm install

# 1. PostgreSQL local + configurar apps/api/.env (copiar de .env.example)
cd apps/api
npx prisma migrate dev

# 2. Tipos compartidos (necesario tras clonar y tras cambiar packages/types)
cd ../../packages/types && pnpm build

# 3. Levantar
cd ../../apps/api && pnpm dev            # API :3000 (Swagger: /api/docs)
cd ../../apps/web && pnpm dev            # Web :5173
```

Primer uso: `POST /api/v1/auth/register` (o desde Swagger) crea el consultorio
con su usuario ADMIN.

## Testing

Ver [docs/TESTING.md](docs/TESTING.md). Resumen:

| Capa | Que cubre | Comando |
|---|---|---|
| Unit (Jest) | Maquina de estados de citas | `cd apps/api && npx jest` |
| Gates de API (PowerShell) | Flujos de negocio + casos negativos + multi-tenant | `scripts/gate-*.ps1` (API corriendo) |
| E2E UI (Playwright) | Flujo completo en Chromium real + roles | `cd apps/web && npx playwright test` |

## Estructura de documentacion

```
PLAN.md                      Biblia del proyecto (roadmap, modelo, reglas)
CLAUDE.md                    Guia de desarrollo y gotchas
docs/DEPLOY.md               Checklist de deploy en Railway
docs/TESTING.md              Guia de testing por capas
docs/superpowers/specs/      Specs de diseno por feature
docs/superpowers/plans/      Planes de implementacion + master plans por etapa
```

## Reglas criticas (las 5 que rompen todo si se ignoran)

1. `consultorioId` SIEMPRE sale del JWT, nunca del body — es un SaaS multi-tenant.
2. Todo DTO lleva decoradores class-validator o el request muere con 400.
3. Dinero = `Decimal` de Prisma; los pagos no se borran (reversas en Etapa 2).
4. Estados de cita via `transicionValida()` — nunca update directo del estado.
5. El server corre en el timezone del consultorio (`TZ`): caja y agenda usan el dia local.
```
