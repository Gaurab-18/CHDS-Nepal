#!/usr/bin/env bash
set -euo pipefail
# CHDS Database Restore
# Usage: ./scripts/restore-db.sh <backup_file>
# Drops and recreates chds_db from a compressed pg_dump.
# Run ONLY against a fresh/staging DB — data loss is irreversible.

if [ $# -ne 1 ]; then
  echo "Usage: $0 <backup_file>" >&2
  echo "Example: $0 backups/chds_db_20260627_120000.sql.gz" >&2
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qE '^chds_db$'; then
  echo "ERROR: chds_db container is not running" >&2
  exit 1
fi

echo "WARNING: This will DROP and recreate the chds_db database."
read -p "Type 'restore' to confirm: " CONFIRM
if [ "$CONFIRM" != "restore" ]; then
  echo "Cancelled."
  exit 0
fi

echo "Dropping and recreating database..."
docker exec -i chds_db psql -U postgres <<'SQLEOF'
DROP DATABASE IF EXISTS chds_db WITH (FORCE);
CREATE DATABASE chds_db OWNER postgres;
SQLEOF

echo "Restoring from ${BACKUP_FILE}..."
gunzip -c "$BACKUP_FILE" | docker exec -i chds_db psql -U postgres -d chds_db

echo "Restore complete. Verify manually:"
echo "  docker exec -it chds_db psql -U postgres -d chds_db -c '\\dt'"
