-- Per-report consent visibility
CREATE TABLE IF NOT EXISTS consent_record_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consent_id UUID NOT NULL REFERENCES consents(id) ON DELETE CASCADE,
    record_id UUID NOT NULL REFERENCES records(id) ON DELETE CASCADE,
    visible BOOLEAN DEFAULT TRUE,
    UNIQUE(consent_id, record_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON consent_record_permissions TO app_user;

-- Cookie & terms acceptance
ALTER TABLE users ADD COLUMN IF NOT EXISTS cookie_consent BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP WITH TIME ZONE;

-- Record categories for doctor prescriptions
ALTER TABLE records ADD COLUMN IF NOT EXISTS category VARCHAR(50) NOT NULL DEFAULT 'general'
  CHECK (category IN ('general', 'prescription', 'bill', 'timetable', 'explanation'));

-- Per-record access tracking
CREATE TABLE IF NOT EXISTS record_access_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id UUID NOT NULL REFERENCES records(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    accessed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

GRANT SELECT, INSERT ON record_access_log TO app_user;
REVOKE UPDATE, DELETE ON record_access_log FROM app_user;

-- Allow 'pending' status in consents
ALTER TABLE consents DROP CONSTRAINT IF EXISTS consents_status_check;
ALTER TABLE consents ADD CONSTRAINT consents_status_check CHECK (status IN ('active', 'revoked', 'expired', 'pending'));

-- ==========================================================
-- Hospital Integration (Phase 0)
-- ==========================================================

-- 0-A: ALTER hospitals — add matching & auth columns
ALTER TABLE hospitals
  ADD COLUMN IF NOT EXISTS software_type   TEXT,
  ADD COLUMN IF NOT EXISTS api_key_hash    TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS status          TEXT NOT NULL DEFAULT 'pending'
                                           CHECK (status IN ('pending','active','suspended')),
  ADD COLUMN IF NOT EXISTS contact_email   TEXT;

-- 0-B: ALTER patients — add plaintext matching columns
-- encrypted_national_id BYTEA stays as-is (used only for decrypted display)
-- nid_hash enables fast equality matching without decrypting every row
-- full_name / date_of_birth / gender are plaintext copies for scoring
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS nid_hash        TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS full_name       TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth   TEXT,
  ADD COLUMN IF NOT EXISTS gender          TEXT;

CREATE INDEX IF NOT EXISTS idx_patients_nid_hash ON patients(nid_hash);
CREATE INDEX IF NOT EXISTS idx_patients_dob     ON patients(date_of_birth);
CREATE INDEX IF NOT EXISTS idx_patients_name    ON patients(full_name);

-- 0-C: ALTER records — add 'hospital_push' to source constraint
ALTER TABLE records DROP CONSTRAINT IF EXISTS records_source_check;
ALTER TABLE records
  ADD CONSTRAINT records_source_check
  CHECK (source IN ('patient_upload','doctor_entry','fhir_push','doctor_upload','hospital_push'));

-- 0-D: CREATE hospital_patient_links
CREATE TABLE IF NOT EXISTS hospital_patient_links (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  chds_patient_id    UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  hospital_id        UUID        NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  hospital_local_id  TEXT        NOT NULL,
  match_method       TEXT        NOT NULL
                     CHECK (match_method IN ('nid','composite','admin_confirmed')),
  match_confidence   FLOAT       NOT NULL DEFAULT 1.0,
  status             TEXT        NOT NULL DEFAULT 'confirmed'
                     CHECK (status IN ('confirmed','pending_review')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(hospital_id, hospital_local_id)
);

CREATE INDEX IF NOT EXISTS idx_hpl_patient  ON hospital_patient_links(chds_patient_id);
CREATE INDEX IF NOT EXISTS idx_hpl_hospital ON hospital_patient_links(hospital_id);
CREATE INDEX IF NOT EXISTS idx_hpl_status   ON hospital_patient_links(status);

-- 0-E: CREATE hospital_consents (additive — does not replace existing consents)
CREATE TABLE IF NOT EXISTS hospital_consents (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  hospital_id      UUID        NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  status           TEXT        NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','revoked')),
  data_share_level TEXT        NOT NULL DEFAULT 'full'
                   CHECK (data_share_level IN ('diagnosis_only','full','emergency_only')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(patient_id, hospital_id)
);

CREATE INDEX IF NOT EXISTS idx_hconsent_patient   ON hospital_consents(patient_id);
CREATE INDEX IF NOT EXISTS idx_hconsent_hospital  ON hospital_consents(hospital_id);
CREATE INDEX IF NOT EXISTS idx_hconsent_status    ON hospital_consents(status);

-- Grant permissions for new tables
GRANT SELECT, INSERT, UPDATE, DELETE ON hospital_patient_links TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON hospital_consents     TO app_user;

-- ==========================================================
-- Hospital Integration (Phase 2 — HIPAA & Terms)
-- ==========================================================

-- 2-A: ALTER hospitals — add terms acceptance columns
ALTER TABLE hospitals
  ADD COLUMN IF NOT EXISTS terms_accepted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_version      TEXT;

-- 2-B: CREATE hospital_audit_log (HIPAA-grade, append-only)
-- Stores every hospital action for audit compliance
CREATE TABLE IF NOT EXISTS hospital_audit_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id   UUID        NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  event_type    TEXT        NOT NULL,
  -- event_type values:
  -- 'register', 'terms_accept', 'activate', 'suspend',
  -- 'api_key_gen', 'api_key_regen', 'ingest',
  -- 'patient_match', 'match_confirm', 'match_reject',
  -- 'consent_auto', 'consent_revoke'
  actor_type    TEXT        NOT NULL DEFAULT 'system'
                CHECK (actor_type IN ('hospital','admin','system','patient')),
  actor_id      TEXT,                -- hospital ID or admin user ID
  target_type   TEXT,                -- 'patient', 'record', 'hospital', 'link'
  target_id     TEXT,                -- UUID of target
  outcome       TEXT        NOT NULL DEFAULT 'success'
                CHECK (outcome IN ('success','failure')),
  details       JSONB,               -- structured context data
  ip_address    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hal_hospital   ON hospital_audit_log(hospital_id);
CREATE INDEX IF NOT EXISTS idx_hal_event      ON hospital_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_hal_created    ON hospital_audit_log(created_at);

-- Append-only: no UPDATE or DELETE for app_user
GRANT SELECT, INSERT ON hospital_audit_log TO app_user;
REVOKE UPDATE, DELETE ON hospital_audit_log FROM app_user;

-- ==========================================================
-- IP Blocking (Brute Force Protection)
-- ==========================================================

CREATE TABLE IF NOT EXISTS ip_blocks (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_address      TEXT        NOT NULL,
    reason          TEXT        NOT NULL DEFAULT 'BRUTE_FORCE'
                      CHECK (reason IN ('BRUTE_FORCE', 'MANUAL', 'SUSPICIOUS_ACTIVITY')),
    blocked_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
    blocked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ,
    status          TEXT        NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'reviewed', 'unblocked')),
    affected_user_id UUID       REFERENCES users(id) ON DELETE SET NULL,
    geo_city        TEXT,
    geo_country     TEXT,
    geo_region      TEXT,
    geo_isp         TEXT,
    failed_attempts INTEGER     DEFAULT 0,
    notes           TEXT,
    last_request_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ip_blocks_ip      ON ip_blocks(ip_address);
CREATE INDEX IF NOT EXISTS idx_ip_blocks_status  ON ip_blocks(status);

GRANT SELECT, INSERT, UPDATE ON ip_blocks TO app_user;
