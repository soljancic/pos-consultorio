#!/bin/sh
# Respaldo de la Postgres de producción (Railway) hacia Backblaze B2.
# Corre como cron service en Railway (schedule en el servicio, no acá).
# Solo lectura sobre la DB: pg_dump. Sale con código != 0 si algo falla, para
# que la corrida quede marcada como fallida en Railway.
set -eu

# --- Variables requeridas (las carga el owner en el servicio de Railway) ---
# DATABASE_URL     referencia ${{Postgres.DATABASE_URL}} (red privada)
# B2_KEY_ID        keyID de la app key de Backblaze
# B2_APP_KEY       applicationKey de Backblaze
# B2_BUCKET        nombre del bucket
# B2_S3_ENDPOINT   endpoint S3 (con o sin https://)
# B2_REGION        región del bucket
for v in DATABASE_URL B2_KEY_ID B2_APP_KEY B2_BUCKET B2_S3_ENDPOINT B2_REGION; do
  eval "val=\${$v:-}"
  if [ -z "$val" ]; then
    echo "ERROR: falta la variable $v" >&2
    exit 1
  fi
done

STAMP="$(date -u +%Y%m%d-%H%M%S)"
FILE="/tmp/consultech-${STAMP}.dump"
NAME="$(basename "$FILE")"

echo "pg_dump $(pg_dump --version | awk '{print $3}') -> $NAME"

# --- Dump (con reintento: la red privada de Railway puede tardar un instante
#     en resolver al arrancar el contenedor) ---
n=1
until pg_dump -Fc --no-owner --no-privileges "$DATABASE_URL" -f "$FILE"; do
  if [ "$n" -ge 3 ]; then
    echo "ERROR: pg_dump falló $n veces. Aborto." >&2
    exit 1
  fi
  echo "pg_dump falló (intento $n), reintento en 5s..." >&2
  n=$((n + 1))
  sleep 5
done

SIZE="$(stat -c%s "$FILE")"
echo "Dump generado: $NAME (${SIZE} bytes)"
# Guard: un dump sano nunca pesa < 1 KB; abortar antes de subir basura
if [ "$SIZE" -lt 1024 ]; then
  echo "ERROR: dump sospechosamente pequeño (${SIZE} bytes). Aborto." >&2
  exit 1
fi

# --- Subida a B2 (API S3) ---
export AWS_ACCESS_KEY_ID="$B2_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$B2_APP_KEY"
export AWS_DEFAULT_REGION="$B2_REGION"
# AWS CLI exige esquema en el endpoint; si el secret vino sin http(s)://, se agrega.
ENDPOINT="$B2_S3_ENDPOINT"
case "$ENDPOINT" in
  http://*|https://*) ;;
  *) ENDPOINT="https://$ENDPOINT" ;;
esac

# Diario siempre
aws s3 cp "$FILE" "s3://${B2_BUCKET}/daily/${NAME}" \
  --endpoint-url "$ENDPOINT" --sse AES256
echo "Subido a daily/${NAME}"

# Domingo (date -u +%u == 7): además al prefijo semanal
if [ "$(date -u +%u)" = "7" ]; then
  aws s3 cp "$FILE" "s3://${B2_BUCKET}/weekly/${NAME}" \
    --endpoint-url "$ENDPOINT" --sse AES256
  echo "Subido a weekly/${NAME}"
fi

echo "Backup OK"
