#!/bin/sh
# CHDS automated backup entrypoint — runs inside Docker container

while true; do
  FILE="/backups/chds_db_$(date +%Y%m%d_%H%M%S).sql.gz"
  echo "Backup started: $(date)"
  pg_dump | gzip > "$FILE"
  SIZE=$(stat -c%s "$FILE" 2>/dev/null || echo 0)
  if [ "$SIZE" -eq 0 ]; then
    echo "ERROR: backup file is empty — removing"
    rm -f "$FILE"
  else
    HR_SIZE=$(awk "BEGIN{printf \"%.0fK\", $SIZE/1024}" 2>/dev/null || echo "${SIZE}B")
    echo "Backup saved: ${HR_SIZE}  $FILE"
    find /backups -name "*.sql.gz" -mtime +"${BACKUP_RETENTION_DAYS:-30}" -delete
  fi
  echo "Sleeping ${BACKUP_INTERVAL:-86400}s until next backup..."
  sleep "${BACKUP_INTERVAL:-86400}"
done
