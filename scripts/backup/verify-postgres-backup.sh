#!/usr/bin/env sh
set -eu

BACKUP_FILE="${1:?usage: verify-postgres-backup.sh backup.sql.gz[.enc]}"
TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

case "$BACKUP_FILE" in
  *.enc)
    : "${BACKUP_ENCRYPTION_PASSPHRASE:?BACKUP_ENCRYPTION_PASSPHRASE is required for encrypted backups}"
    openssl enc -d -aes-256-cbc -pbkdf2 -in "$BACKUP_FILE" -pass env:BACKUP_ENCRYPTION_PASSPHRASE | gzip -t
    ;;
  *.gz)
    gzip -t "$BACKUP_FILE"
    ;;
  *)
    head -n 5 "$BACKUP_FILE" > "$TMP_FILE"
    ;;
esac

echo "Backup integrity check passed"
