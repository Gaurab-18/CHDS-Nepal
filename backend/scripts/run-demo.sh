#!/usr/bin/env bash
# CHDS Hospital Integration : LIVE DEMO (one command)
# Auto-detects DB credentials from the running backend container.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! docker ps --format '{{.Names}}' | grep -q chds_backend; then
  echo "ERROR: chds_backend container is not running. Start the stack first:"
  echo "  cd /home/gaurab/project/CHDS && docker compose up -d"
  exit 1
fi

DBPASS=$(docker exec chds_backend env | sed -n 's/^DB_PASSWORD=//p')
EK=$(docker exec chds_backend env | sed -n 's/^ENCRYPTION_KEY=//p')
DBIP=$(docker inspect chds_db --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')

export CHDS_DB_URL="postgres://postgres:${DBPASS}@${DBIP}:5432/chds_db"
export ENCRYPTION_KEY="$EK"

echo "=== CHDS Hospital Integration Live Demo ==="
echo "backend:  http://localhost:4000/api/v1"
echo "db:       ${DBIP} (chds_db)"
echo

npx ts-node --project tsconfig.test.json scripts/demo-hospital-integration.ts
