#!/bin/bash
set -e

# Store the PHI encryption key in a helper table read by seed.sql.
# Never commit real keys. Set POSTGRES_ENCRYPTION_KEY via docker-compose environment.

if [ -n "$POSTGRES_ENCRYPTION_KEY" ]; then
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    -c "CREATE TABLE IF NOT EXISTS _phi_key (val TEXT NOT NULL);" \
    -c "TRUNCATE _phi_key;" \
    -c "INSERT INTO _phi_key VALUES ('${POSTGRES_ENCRYPTION_KEY}');"
  echo "app.phi_key set from POSTGRES_ENCRYPTION_KEY"
else
  echo "WARNING: POSTGRES_ENCRYPTION_KEY not set. Using fallback default."
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    -c "CREATE TABLE IF NOT EXISTS _phi_key (val TEXT NOT NULL);" \
    -c "TRUNCATE _phi_key;" \
    -c "INSERT INTO _phi_key VALUES ('your-aes-256-encryption-key-here');"
fi
