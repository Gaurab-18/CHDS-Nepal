#!/usr/bin/env bash
set -euo pipefail
# CHDS Database Backup
# Usage: ./scripts/backup-db.sh [retention_days]
# Creates timestamped gzipped pg_dump in backups/ and prunes older than retention_days (default 30).

BACKUP_DIR="$(cd "$(dirname "$0")/.." && pwd)/backups"
RETENTION_DAYS="${1:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/chds_db_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "Starting backup → ${BACKUP_FILE}"

if ! docker ps --format '{{.Names}}' | grep -qE '^chds_db$'; then
  echo "ERROR: chds_db container is not running" >&2
  exit 1
fi

docker exec chds_db pg_dump -U postgres -d chds_db --clean --if-exists | gzip > "$BACKUP_FILE"
BACKUP_SIZE=$(stat --printf="%s" "$BACKUP_FILE" 2>/dev/null || echo 0)

if [ "$BACKUP_SIZE" -eq 0 ]; then
  echo "ERROR: backup file is empty : pg_dump may have failed" >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

echo "Backup size: $(numfmt --to=iec "$BACKUP_SIZE")"

# Rotate old backups
find "$BACKUP_DIR" -name 'chds_db_*.sql.gz' -mtime +$RETENTION_DAYS -delete

# Count remaining
COUNT=$(find "$BACKUP_DIR" -name 'chds_db_*.sql.gz' | wc -l)
echo "Done : ${COUNT} backup(s) retained (pruned >${RETENTION_DAYS}d)"
