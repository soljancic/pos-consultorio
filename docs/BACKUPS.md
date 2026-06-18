# Backups de la base de datos

Respaldo automático de la Postgres de producción (Railway) hacia Backblaze B2.

- **Workflow:** [.github/workflows/db-backup.yml](../.github/workflows/db-backup.yml)
- **Spec/diseño:** [docs/superpowers/specs/2026-06-18-db-backup-backblaze-design.md](superpowers/specs/2026-06-18-db-backup-backblaze-design.md)
- **Cuándo corre:** diario 02:00 La Paz (06:00 UTC). También manual.
- **Qué guarda:** `daily/` (7 días) + `weekly/` los domingos (8 semanas).
- **Formato:** `pg_dump -Fc` (custom, comprimido), restaurable con `pg_restore`.

## Setup inicial (una sola vez, lo hace el owner)

### 1. Bucket B2
Crear un bucket **privado** en Backblaze B2. Anotar nombre, endpoint S3 y región
(ej. endpoint `https://s3.us-west-004.backblazeb2.com`, región `us-west-004`).

### 2. Lifecycle Rules del bucket (retención)
En el bucket B2, agregar 2 reglas por prefijo:

| Prefijo   | Acción                        |
|-----------|-------------------------------|
| `daily/`  | borrar archivos a los 7 días  |
| `weekly/` | borrar archivos a los 56 días |

Sin estas reglas los backups se acumulan indefinidamente.

### 3. Secrets en GitHub
Repo → Settings → Secrets and variables → Actions → New repository secret:

| Secret                | Qué es                                                  |
|-----------------------|--------------------------------------------------------|
| `DATABASE_PUBLIC_URL` | connection string pública de Railway Postgres          |
| `B2_KEY_ID`           | keyID de la app key de Backblaze                        |
| `B2_APP_KEY`          | applicationKey de Backblaze                             |
| `B2_BUCKET`           | nombre del bucket                                       |
| `B2_S3_ENDPOINT`      | endpoint S3 (con `https://`)                            |
| `B2_REGION`           | región del bucket                                       |

### 4. Probar
Repo → Actions → "DB Backup to Backblaze B2" → Run workflow. Verificar que
aparezca el `.dump` en `daily/` del bucket.

## Restore (recuperar la base desde un backup)

> Probar el restore es parte de tener backups: un backup que nunca se restauró
> no es un backup confiable. Hacerlo al menos una vez tras el setup.

1. Bajar el `.dump` deseado desde B2 (consola web de Backblaze o AWS CLI):

   ```bash
   aws s3 cp "s3://<BUCKET>/daily/consultech-YYYYMMDD-HHMMSS.dump" . \
     --endpoint-url "<B2_S3_ENDPOINT>"
   ```

2. Restaurar contra una base **local/de prueba** (NUNCA contra producción):

   ```bash
   createdb consultech_restore
   pg_restore --no-owner --no-privileges -d consultech_restore consultech-YYYYMMDD-HHMMSS.dump
   ```

3. Verificar datos (ej. contar pacientes, citas) antes de dar por buena la copia.

## Notas de seguridad

- Los secrets viven solo en GitHub Actions, nunca en el repo.
- Si alguna credencial se expuso (chat, captura, log), rotarla: app key nueva en
  Backblaze y/o nueva contraseña de Postgres en Railway, y actualizar el secret.
- El bucket es privado + SSE-B2 (cifrado en reposo). El dump contiene datos de
  pacientes: no copiarlo a lugares sin cifrar ni compartir links públicos.
