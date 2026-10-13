# Cron service de Railway: pg_dump de la Postgres de producción -> Backblaze B2.
# Solo lectura sobre la DB (pg_dump): no borra ni modifica datos de producción.
# Spec: docs/superpowers/specs/2026-06-18-db-backup-backblaze-design.md
# Runbook/restore: docs/BACKUPS.md
#
# La major del cliente debe coincidir (o ser mayor) que la del server. Railway
# corre postgres-ssl:18. Si Railway sube de major, cambiar la imagen base aquí.
FROM postgres:18-alpine

# aws-cli: subida a B2 por su API S3-compatible (mismo comando que usaba el
# workflow de GitHub Actions).
RUN apk add --no-cache aws-cli

COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh

# Reemplaza el entrypoint del server Postgres: este contenedor solo corre el
# script y termina (Railway espera que un cron service salga al acabar).
ENTRYPOINT ["/usr/local/bin/backup.sh"]
