#!/usr/bin/env sh
set -eu

BACKUP_FILE="${1:?usage: postgres-restore.sh backup.sql.gz[.enc]}"
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required; never point it at production accidentally}"

case "$BACKUP_FILE" in
  *.enc)
    : "${BACKUP_ENCRYPTION_PASSPHRASE:?BACKUP_ENCRYPTION_PASSPHRASE is required}"
    openssl enc -d -aes-256-cbc -pbkdf2 -in "$BACKUP_FILE" -pass env:BACKUP_ENCRYPTION_PASSPHRASE | gunzip | psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1
    ;;
  *.gz)
    gunzip -c "$BACKUP_FILE" | psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1
    ;;
  *)
    psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$BACKUP_FILE"
    ;;
esac

echo "Restore completed into RESTORE_DATABASE_URL"
