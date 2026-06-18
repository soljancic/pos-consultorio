# Backups periódicos de Postgres (Railway) → Backblaze B2

> Fecha: 2026-06-18
> Estado: aprobado, pendiente de implementación/owner setup

## Objetivo

Respaldo automático y periódico de la base Postgres de producción (Railway,
proyecto Consultech) hacia un bucket privado de Backblaze B2, con retención
tipo abuelo-padre-hijo (GFS) y verificación de restore.

## Decisiones (brainstorming 2026-06-18)

- **Ejecución:** GitHub Actions (cron). Gratis, fuera de la máquina del owner,
  versionado en el repo, logs e historial en GitHub. No consume cómputo de Railway.
- **Frecuencia + retención (GFS):** diario retenido 7 días + un semanal
  (domingo) retenido 8 semanas (56 días).
- **Cifrado:** bucket privado + SSE-B2 (server-side de Backblaze). Sin cifrado
  cliente/GPG (se descartó para no arriesgar pérdida de passphrase).
- **Naturaleza:** solo lectura sobre la DB (`pg_dump`). No borra ni modifica
  datos de producción; no viola la regla de oro del proyecto.

## Arquitectura

- Workflow `.github/workflows/db-backup.yml`.
  - `schedule: '0 6 * * *'` (02:00 America/La_Paz = 06:00 UTC, La Paz es UTC-4 sin DST).
  - `workflow_dispatch` para corridas manuales bajo demanda.
- Runner `ubuntu-latest`:
  1. Instala el cliente Postgres más reciente desde PGDG. Un `pg_dump` más
     nuevo dumpea cualquier server igual o más viejo, así se evita el problema
     de versión cliente/servidor.
  2. `pg_dump -Fc --no-owner --no-privileges` → formato custom comprimido,
     restaurable selectivamente con `pg_restore`.
  3. Guard de integridad: si el dump pesa menos de ~1 KB se aborta (evita subir
     un backup roto).
  4. Sube a B2 vía API S3-compatible con AWS CLI (preinstalado en el runner),
     con `--sse AES256` (SSE-B2).

## Flujo de datos

1. `pg_dump -Fc "$DATABASE_PUBLIC_URL"` → `consultech-YYYYMMDD-HHMMSS.dump`
2. `aws s3 cp` → `s3://$B2_BUCKET/daily/<archivo>`
3. Si `date -u +%u == 7` (domingo) → además `s3://$B2_BUCKET/weekly/<archivo>`

## Retención (la maneja Backblaze, no el workflow)

Lifecycle Rules del bucket B2, por prefijo:

| Prefijo   | Regla                           | Resultado          |
|-----------|---------------------------------|--------------------|
| `daily/`  | borrar archivos > 7 días        | ~7 diarios vivos   |
| `weekly/` | borrar archivos > 56 días       | ~8 semanales vivos |

Se elige B2 lifecycle en vez de un prune en el script: corre solo, no depende
de que el job termine bien, y no hay riesgo de borrar de más por un bug del
script.

## Secretos (GitHub → Settings → Secrets and variables → Actions)

| Secret                  | Valor                                                        |
|-------------------------|-------------------------------------------------------------|
| `DATABASE_PUBLIC_URL`   | Connection string PÚBLICA de Railway Postgres (la interna `*.railway.internal` no es accesible desde GitHub) |
| `B2_KEY_ID`             | keyID de la app key de Backblaze                            |
| `B2_APP_KEY`            | applicationKey de Backblaze (rotar tras setup)             |
| `B2_BUCKET`             | nombre del bucket                                           |
| `B2_S3_ENDPOINT`        | endpoint S3, ej. `https://s3.us-west-004.backblazeb2.com`  |
| `B2_REGION`             | región, ej. `us-west-004`                                  |

Ningún valor de secreto vive en el repo; el workflow solo referencia nombres.

## Manejo de fallos

- GitHub envía email automático al owner si el workflow falla. Suficiente para
  el piloto; se puede agregar aviso a otro canal (email/Slack) más adelante.
- `concurrency` evita corridas solapadas.
- `timeout-minutes` corta corridas colgadas.

## Verificación / restore

- Corrida manual vía `workflow_dispatch` sin esperar al cron.
- Runbook de restore en `docs/BACKUPS.md`: bajar el `.dump` de B2 y
  `pg_restore` contra una DB local — prueba que el backup sirve, no solo que se
  sube. La prueba de restore es parte de la verificación, no opcional.

## Setup del owner (fuera del código)

1. Crear bucket B2 privado.
2. Crear (o reusar) app key de Backblaze con acceso al bucket.
3. Configurar las 2 Lifecycle Rules (`daily/` 7d, `weekly/` 56d).
4. Cargar los 6 secrets en GitHub Actions.
5. Tener a mano la `DATABASE_PUBLIC_URL` de Railway.
6. Disparar el workflow manual una vez y validar el restore.
