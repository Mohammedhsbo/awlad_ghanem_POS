#!/usr/bin/env sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups/postgres}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
mkdir -p "$BACKUP_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR}/backup-${STAMP}.sql.gz"

pg_dump "$DATABASE_URL" | gzip -9 > "$OUT"

if [ -n "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]; then
  openssl enc -aes-256-cbc -salt -pbkdf2 -in "$OUT" -out "${OUT}.enc" -pass env:BACKUP_ENCRYPTION_PASSPHRASE
  rm "$OUT"
  OUT="${OUT}.enc"
fi

find "$BACKUP_DIR" -type f -name 'backup-*' -mtime +"$RETENTION_DAYS" -delete

if [ -n "${BACKUP_OFFSITE_URI:-}" ] && command -v aws >/dev/null 2>&1; then
  aws s3 cp "$OUT" "$BACKUP_OFFSITE_URI/"
fi

echo "$OUT"
