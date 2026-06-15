# Deploy — Railway

> Hosting elegido: Railway (decision 2026-06-10). El frontend puede ir en el
> mismo proyecto Railway (static) o en Vercel; abajo van ambas opciones.

## Deploy del dia a dia (TL;DR)

**No hay auto-deploy de GitHub**: el deploy se dispara a mano. La config de build
(RAILPACK) y las variables viven en el dashboard de cada servicio; al deployar solo
se sube el codigo del monorepo a los servicios `api` y `web` (production).

```bash
railway login            # una sola vez
pnpm deploy              # deploya api + web (script scripts/deploy.ps1)
```

Solo un servicio:

```powershell
./scripts/deploy.ps1 -Service web
```

Equivalente manual (lo que hace el script, desde la raiz del repo):

```bash
railway up --ci -p 02c99275-ceef-4b0b-90da-4ab5a9e758cf -e production -s api
railway up --ci -p 02c99275-ceef-4b0b-90da-4ab5a9e758cf -e production -s web
```

- Migraciones: el pre-deploy de `api` corre `prisma migrate deploy` (aplica
  pendientes, NO borra datos). NUNCA usar `migrate reset`/`db push
  --accept-data-loss` contra production (ver REGLA DE ORO en CLAUDE.md).
- El resto de este documento es la configuracion inicial (one-time setup).

## Arquitectura en Railway

```
Proyecto Railway "pos-consultorio"
├── PostgreSQL (plugin Railway, backups automaticos incluidos)
├── api      → apps/api  (NestJS, Dockerfile o nixpacks)
└── web      → apps/web  (estatico) ... o Vercel
```

## 1. Base de datos

1. Crear servicio PostgreSQL en el proyecto Railway.
2. Copiar `DATABASE_URL` (Railway la inyecta como variable al vincular servicios).

## 2. API (apps/api)

**Variables de entorno (Settings → Variables):**

| Variable | Valor |
|---|---|
| `DATABASE_URL` | referencia al plugin Postgres (`${{Postgres.DATABASE_URL}}`) |
| `NODE_ENV` | `production` |
| `JWT_SECRET` | secreto real largo y aleatorio (`openssl rand -hex 48`) |
| `JWT_REFRESH_SECRET` | otro secreto distinto |
| `JWT_EXPIRES_IN` | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | `7d` |
| `FRONTEND_URL` | URL real del frontend (CORS) |
| `REGISTRO_ABIERTO` | `false` para el piloto (el consultorio se crea una vez con `true` o por DB) |
| `TZ` | **`America/La_Paz`** (o el timezone del consultorio piloto) — CRITICO: caja y agenda usan el dia local del server |

> La API valida al arrancar: en `NODE_ENV=production` se niega a levantar si
> `JWT_SECRET`/`JWT_REFRESH_SECRET`/`DATABASE_URL` faltan o tienen el placeholder.

**Build & start (monorepo pnpm):**
- Root del servicio: repo completo (necesita packages/types).
- Build command: `pnpm install --frozen-lockfile && pnpm --filter @pos/types build && pnpm --filter api build`
  (ajustar `--filter` a los nombres reales de los package.json de apps/api y packages/types)
- Pre-deploy (Railway "Pre-deploy command"): `cd apps/api && npx prisma migrate deploy`
- Start command: `node apps/api/dist/main.js`
- Healthcheck path: `/api/v1/health` (verifica DB con SELECT 1)

## 3. Frontend (apps/web)

**Opcion A — Vercel (recomendada para SPA):**
- Root: `apps/web`, framework Vite.
- Env de build: `VITE_API_URL=https://<api>.up.railway.app/api/v1`
- Vercel maneja el fallback SPA automaticamente.

**Opcion B — Railway static:**
- Build: `pnpm install && pnpm --filter web build` con `VITE_API_URL` seteada.
- Servir `apps/web/dist` con fallback SPA (todas las rutas → index.html), p.ej. Caddy/serve.

Luego actualizar `FRONTEND_URL` de la API con la URL final del frontend.

## 4. Alta del consultorio piloto

1. Deploy con `REGISTRO_ABIERTO=true` (temporal).
2. `POST /api/v1/auth/register` con los datos reales del consultorio.
3. Cambiar `REGISTRO_ABIERTO=false` y redeploy (Railway reinicia con la nueva var).
4. Desde Configuracion (UI): cargar telefono, direccion, moneda y timezone del consultorio; crear los usuarios SECRETARIA/DOCTOR/CAJA.

## 5. Smoke post-deploy

```
GET  https://<api>/api/v1/health            → 200 {status: ok}
GET  https://<api>/api/docs                 → 404 (Swagger apagado en prod)
POST https://<api>/api/v1/auth/register     → 403 (registro cerrado)
POST https://<api>/api/v1/auth/login x11    → el 11vo da 429 (throttle)
Login desde el frontend real               → dashboard carga
Crear cita de prueba a las 21:00           → aparece en la agenda de HOY (verifica TZ)
```

El ultimo punto es el canario del timezone: si la cita nocturna cae en otro dia,
la variable `TZ` del servicio esta mal.

## Pendiente (post-piloto)

- Sentry o similar para errores del API y del frontend
- Dominio propio + certificado (Railway lo gestiona al agregar custom domain)
- Politica de retencion de backups segun plan de Railway
