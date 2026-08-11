#!/usr/bin/env bash
# CHDS Security Attack Probe : one command. Auto-detects DB creds.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! docker ps --format '{{.Names}}' | grep -q chds_backend; then
  echo "ERROR: chds_backend container is not running. Start the stack first:"
  echo "  cd /home/gaurab/project/CHDS && docker compose up -d"
  exit 1
fi

DBPASS=$(docker exec chds_backend env | sed -n 's/^DB_PASSWORD=//p')
DBIP=$(docker inspect chds_db --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')

export CHDS_DB_URL="postgres://postgres:${DBPASS}@${DBIP}:5432/chds_db"

# Clear rate-limit + rapid-fire counters so a repeat run starts clean
docker exec chds_redis redis-cli --scan --pattern 'rl:*' 2>/dev/null | xargs -r docker exec chds_redis redis-cli DEL 2>/dev/null || true
docker exec chds_redis redis-cli --scan --pattern 'failed_logins*' 2>/dev/null | xargs -r docker exec chds_redis redis-cli DEL 2>/dev/null || true

npx ts-node --project tsconfig.test.json scripts/security-probe.ts
