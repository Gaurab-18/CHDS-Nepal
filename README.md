# CHDS Nepal

## Architecture

```
Caddy (HTTPS termination : ports 80/443)
  ├── /api/* → Backend (Express, TypeScript, port 4000)
  └── /*     → Frontend (Next.js 14, Tailwind CSS, port 3000)

Backend (Express + TypeScript) : 9 route files, 97+ endpoints
  ├── Auth           : JWT, 2FA (TOTP), backup codes, password management, IP blocking
  ├── Patient        : Records CRUD, file upload, consent management, wipe request, audit QR
  ├── Doctor         : Patient search, consent-gated access, emergency override, profile
  ├── Admin          : User CRUD, doctor verification, audit log, notices, IP blocks, storage
  ├── AdminHospitals : Hospital registration, API keys, status, match review
  ├── Notifications  : List, unread count, mark read, read-all
  ├── FHIR           : Metadata proxy, Patient/Observation/Condition/MedicationRequest/DiagnosticReport
  ├── HospitalIngest : FHIR bundle ingest with patient matching (NID + composite scoring)
  └── HospitalTerms  : Terms & conditions acceptance for hospital partners

Database  (PostgreSQL 15 + pgcrypto)
  ├── AES-256 field-level PHI encryption (pgp_sym_encrypt)
  ├── Append-only audit_log (UPDATE/DELETE revoked for app_user)
  ├── Per-record consent visibility toggles
  ├── Hospital patient matching (nid_hash + composite scoring)
  └── IP block tracking with geo fields

Cache    (Redis 7)
  └── Rate limiting, session store, token blacklist, failed login tracking

Message  (Mailpit : dev SMTP capture)
  └── http://localhost:8025
```

## Quick Start

```bash
docker compose up --build
```

| Service       | URL                          |
|---------------|------------------------------|
| Frontend      | https://localhost            |
| Backend API   | https://localhost/api/v1     |
| Mailpit UI    | http://localhost:8025        |
| FHIR Server   | http://localhost:8080        |

## Development

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev                  # Starts on port 4000
npm test                     # Backend test suite (Jest, 62 cases)
npm run seed:synthetic       # Generate sample data (50 patients, 200 records, etc.)
```

### Frontend

```bash
cd frontend
npm install
npm run dev                  # Starts on port 3000
npm test                     # Frontend tests (Jest + RTL)
npm run test:e2e             # Playwright E2E tests
```

## Environment Variables

Generate all secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

| Variable             | Required | Description                              |
|----------------------|----------|------------------------------------------|
| `DB_HOST`            | Yes      | PostgreSQL host                          |
| `DB_PORT`            | Yes      | PostgreSQL port                          |
| `DB_NAME`            | Yes      | Database name                            |
| `DB_USER`            | Yes      | PostgreSQL superuser (migrations only)   |
| `DB_PASSWORD`        | Yes      | PostgreSQL superuser password            |
| `APP_USER`           | Yes      | App database user (restricted RBAC role) |
| `APP_USER_PASSWORD`  | Yes      | App database user password               |
| `JWT_SECRET`         | Yes      | 256-bit hex for JWT signing              |
| `JWT_REFRESH_SECRET` | Yes      | 256-bit hex for refresh tokens           |
| `ENCRYPTION_KEY`     | Yes      | AES-256 key for PHI field encryption     |
| `REDIS_HOST`         | Yes      | Redis host                               |
| `REDIS_PORT`         | Yes      | Redis port                               |
| `BREACH_THRESHOLD`   | No       | Failed logins before IP block (default: 7) |
| `SMTP_HOST`          | Email    | SMTP server (default: mailpit)           |
| `SMTP_USER`          | Email    | SMTP username                            |
| `SMTP_PASS`          | Email    | SMTP password / app password             |

## Test Credentials

| Role    | Email             | Password    |
|---------|-------------------|-------------|
| Admin   | admin@chds.np     | @CHDS2024!  |
| Doctor  | doctor@chds.np    | @CHDS2024!  |
| Patient | patient@chds.np   | @CHDS2024!  |

## API Endpoints

97+ endpoints across 9 route files:

- **Auth** (15) : login, register, 2FA, backup codes, forgot/reset/change password, onboarding, security score, accept-terms
- **Patient** (21) : profile, records CRUD, file upload/download, storage, consents grant/revoke/toggle/approve/decline, wipe request, audit log, audit QR, access stats
- **Doctor** (13) : profile, patient search, consent-gated records, file download, record creation with categories, emergency override, consent request, directory
- **Admin** (24) : users CRUD/invite/disable, notices, notifications, audit log, wipe requests, storage requests, doctor verification, IP blocks management
- **AdminHospitals** (7) : list, create, activate/suspend, regen API key, match review queue, confirm/reject, audit log
- **FHIR** (6) : metadata, Patient, Observation, Condition, MedicationRequest, DiagnosticReport
- **Notifications** (4) : list, unread count, mark read, read-all
- **HospitalIngest** (1) : POST /api/v1/hospital/ingest (FHIR bundle, patient matching, encrypted storage)
- **HospitalTerms** (2) : GET/POST terms acceptance for hospital partners
- **Health** (4) : /health, /api/v1/health, /api/v1, /api/v1/public/audit-log

## Test Suite

| Layer     | Runner      | Tests |
|-----------|-------------|-------|
| Backend   | Jest        | 62 (auth 9, rbac 33, encryption 3, audit 5, consent 6, security 6) |
| Frontend  | Jest + RTL  | 2     |
| E2E       | Playwright  | Full auth/patient/doctor/admin flows |

### Running Tests

```bash
# Backend
cd backend && npm test

# Frontend unit
cd frontend && npm test

# E2E (requires running backend + frontend)
cd frontend && npm run test:e2e
```

## CI/CD

On every push to `main` / `master`:

1. **Type-check** : `tsc --noEmit` on backend
2. **Security audit** : `npm audit` on backend + frontend
3. **Tests** : backend (Jest with Postgres + Redis services), frontend (Jest)
4. **Build** : Next.js production build
5. **Server startup** : Start backend, verify `/health` endpoint
6. **Seed** : Insert test users (`ci-seed-test-users.sql`)

## Brute Force & IP Blocking

- **Threshold**: 7 failed logins (`BREACH_THRESHOLD`) triggers automatic IP block
- **Rapid-fire detection**: 5+ attempts in 60 seconds → immediate block with `SUSPICIOUS_ACTIVITY`
- **Warning**: Login response includes `warning` field with remaining attempts when ≤3 left
- **Admin management**: View/manage blocks at `/admin/ip-blocks` : can review, unblock, add notes
- **Blocked page**: Blocked users see a Lottie animation at `/blocked`
- **Bypass**: Auth routes bypass IP blocker; admin IP-block routes bypass both IP blocker and `must_change_password` check

## Hospital Integration

Hospitals can push FHIR R4 bundles via a secure API key:

1. **Register hospital** : admin creates hospital, gets API key (shown once)
2. **Accept terms** : hospital calls `POST /api/v1/hospital/accept-terms`
3. **Activate** : admin activates the hospital account
4. **Ingest** : hospital pushes FHIR bundles with API key auth
5. **Patient matching**:
   - Fast: NID → SHA-256 hash → `nid_hash` lookup (confidence 1.0)
   - Fallback: name (40pts) + DOB (35pts) + gender (10pts) + fuzzy name (25pts)
   - Thresholds: ≥75 auto-link, 40-74 pending_review, <40 create_new

## UI Features

- **Cursor switcher**: Ambulance SVG, canvas particle trail, or off : persisted in localStorage, accessible from login/register/2FA pages
- **Clock popup**: Full-screen canvas clock animation following cursor : date ring + analog face + hands. Floating button on dashboard, admin/users, doctor/search pages
- **Back buttons**: "Back to Users" on admin/hospitals page, "Back to Hospitals" on admin/hospitals/matches page

## Data Flow

```
Patient uploads record
  → Encrypted with pgp_sym_encrypt (AES-256)
  → Stored in records table (BYTEA columns)
  → Audit log entry created (append-only)
  → Doctor requests access
    → Consent check middleware
    → If granted: decrypted and returned
    → If emergency: override logged

Admin invites doctor
  → Email sent via Mailpit / SMTP
  → Doctor registers with temporary password
  → Admin verifies license → doctor_profile.verification_status = 'approved'

Hospital pushes FHIR bundle
  → API key authentication
  → Patient matching (NID fast path / composite fallback)
  → Auto-consent created on first ingest
  → Clinical records encrypted and stored
  → HIPAA audit log written
```

## Deployment

### Production checklist

- [ ] Generate unique JWT secrets, encryption key, and DB passwords
- [ ] Configure real SMTP credentials in `.env`
- [ ] Set up Caddy with proper TLS certificates
- [ ] Disable `DISABLE_RATE_LIMIT`
- [ ] Remove `.env` from version control
- [ ] Run DB migrations before starting services
- [ ] Configure regular PostgreSQL backups
- [ ] **Remove port mappings for backend/frontend** : expose only Caddy (80/443)
- [ ] Set `BREACH_THRESHOLD` to desired value (default 7)

### Docker

```bash
# Build and start all services
docker compose up --build -d

# View logs
docker compose logs -f backend

# Run seed data
docker compose exec backend npm run seed:synthetic

# Stop
docker compose down
```

## Security

- PHI encrypted with AES-256 via `pgp_sym_encrypt` before storage
- App database user has `REVOKE UPDATE/DELETE` on `audit_log`
- JWT tokens with configurable expiry and refresh rotation
- Rate limiting via Redis-backed `express-rate-limit`
- Helmet security headers
- RBAC middleware on every protected route
- Emergency access override is logged with reason
- All consent changes are recorded in the audit trail
- IP blocking after N failed logins (configurable `BREACH_THRESHOLD`)
- Rapid-fire attack detection (5+ attempts in 60s)
- Hospital API key authentication (SHA-256 hashed, shown once)

## FHIR Compatibility

Supports FHIR R4 endpoints proxied to a HAPI FHIR server:

- `GET /api/v1/fhir/metadata`
- `GET/POST /api/v1/fhir/Patient`
- `GET/POST /api/v1/fhir/Observation`
- `GET /api/v1/fhir/Condition`
- `GET/POST /api/v1/fhir/MedicationRequest`
- `GET/POST /api/v1/fhir/DiagnosticReport`

## Database Backup & Restore

### Scheduled Backup (cron)

```bash
# Add to crontab : runs daily at 3 AM, retains 30 days
0 3 * * * /path/to/chds/scripts/backup-db.sh >> /path/to/chds/backups/backup.log 2>&1
```

### Manual Backup

```bash
./scripts/backup-db.sh [retention_days]
```

Creates a gzipped `pg_dump` in `backups/` (e.g., `chds_db_20260627_030000.sql.gz`). Old backups beyond the retention window are pruned automatically.

### Restore

```bash
./scripts/restore-db.sh backups/chds_db_20260627_030000.sql.gz
```

**Warning:** drops the existing `chds_db` database and recreates it : irreversible data loss.

### Off-site / Cloud Copy

To push backups to S3, rsync, or another remote target, chain the backup with your preferred upload:

```bash
./scripts/backup-db.sh && \
  rclone copy backups/chds_db_$(date +%Y%m%d_*.sql.gz myremote:chds-backups/
```

## Network Security

**Production**: Only ports 80 (HTTP→HTTPS redirect) and 443 (HTTPS) should be exposed on the host. Caddy terminates TLS and reverse-proxies to backend/frontend over Docker's internal bridge network (HTTP). **Do not map ports 3000 and 4000 to the host in production.**

**WiFi risk**: If backend (4000) and frontend (3000) ports are exposed on the host, anyone on the same WiFi can connect directly via HTTP with no encryption : the Caddy HTTPS layer is bypassed entirely. Attackers on the same subnet can use Wireshark to capture plaintext API traffic including JWTs and PHI.

**Fix**: Remove these lines from `docker-compose.yml` in production:
```yaml
ports:
  - "4000:4000"   # ← remove
  - "3000:3000"   # ← remove
```

Docker's internal bridge network (`chds_network`) is isolated : services communicate over HTTP safely inside it, and are not reachable from outside the host.

## License

MIT
