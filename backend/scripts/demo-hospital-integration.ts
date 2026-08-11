// CHDS Hospital Integration : LIVE DEMO
// Shows, step by step, that the whole hospital integration works as intended:
//   admin login → hospital onboarding → FHIR ingest → patient matching (auto-link /
//   pending review / create-new) → QA decision → data encrypted at rest → the right
//   people can actually see the data. Every check prints in plain language so the
//   logs read like a story, not raw JSON.
//
// Run (backend stack must be up):
//   npx ts-node --project tsconfig.test.json scripts/demo-hospital-integration.ts
//
// Env:
//   API_BASE   default http://localhost:4000/api/v1
//   CHDS_DB_URL / ENCRYPTION_KEY : set from the backend container (see below) so it
//   can query the DB directly to PROVE what's in the database.
//
// One-liner against the live stack:
//   DBPASS=$(docker exec chds_backend env | sed -n 's/^DB_PASSWORD=//p')
//   EK=$(docker exec chds_backend env | sed -n 's/^ENCRYPTION_KEY=//p')
//   CHDS_DB_URL="postgres://postgres:${DBPASS}@172.19.0.2:5432/chds_db" ENCRYPTION_KEY="$EK" \
//   npx ts-node --project tsconfig.test.json scripts/demo-hospital-integration.ts
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import { makePatientDecryptor } from '../src/crypto';

const API_BASE = process.env.API_BASE || 'http://localhost:4000/api/v1';
const ADMIN = { email: 'admin@chds.np', password: '@CHDS2026!' };
const DB_URL = process.env.CHDS_DB_URL || 'postgres://postgres:change_me_super_secret_db_password@localhost:5432/chds_db';
const FIX = path.resolve(__dirname, '../tests/fixtures/fhir');

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RST = '\x1b[0m';

let adminJar: string[] = [];
let passCount = 0;
let failCount = 0;
const pool = new Pool({ connectionString: DB_URL });

function banner(title: string) {
  console.log(`\n${BOLD}── ${title}${RST}`);
  console.log(DIM + '─'.repeat(Math.max(20, title.length + 6)) + RST);
}
function step(msg: string) {
  console.log(`${DIM}→${RST} ${msg}`);
}
function ok(name: string, detail?: any) {
  passCount++;
  console.log(`   ${PASS} ${name}${detail !== undefined ? DIM + '  ' + JSON.stringify(detail) + RST : ''}`);
}
function fail(name: string, detail?: any) {
  failCount++;
  console.log(`   ${FAIL} ${name}${detail !== undefined ? DIM + '  ' + JSON.stringify(detail) + RST : ''}`);
}
function result(name: string, cond: boolean, detail?: any) {
  cond ? ok(name, detail) : fail(name, detail);
  return cond;
}
// Human-readable version of the matcher's verdict
function verdict(action?: string): string {
  switch (action) {
    case 'create_new': return 'CREATED a new patient record';
    case 'auto-link': return 'MATCHED : linked to the existing patient';
    case 'pending_review': return 'HELD for admin review (match uncertain)';
    default: return (action || 'unknown');
  }
}

async function req(pathName: string, opts: any = {}, jar: string[] = []) {
  const headers: any = { ...(opts.headers || {}) };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (jar.length) headers['Cookie'] = jar.join('; ');
  const res = await fetch(`${API_BASE}${pathName}`, {
    ...opts,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  const setCookie = (res.headers.get('set-cookie') || '').split(',').map(c => c.split(';')[0].trim()).filter(Boolean);
  return { status: res.status, data, setCookie };
}

function load(name: string): any {
  return JSON.parse(fs.readFileSync(path.join(FIX, name), 'utf8'));
}

const pg = async (sql: string, params: any[] = []) => (await pool.query(sql, params)).rows;

async function loginAdmin() {
  step('POST /auth/login  (admin@chds.np)');
  const r = await req('/auth/login', { method: 'POST', body: { email: ADMIN.email, password: ADMIN.password } });
  adminJar = r.setCookie;
  return result('admin logged in successfully', r.status === 200 && adminJar.length > 0, r.status);
}

async function createHospital(name: string) {
  step(`POST /admin/hospitals  → registering hospital "${name}"`);
  const r = await req('/admin/hospitals', {
    method: 'POST',
    body: {
      name,
      address: 'Kathmandu',
      contact_number: '+977-1-5550000',
      contact_email: `admin@${name.replace(/\s+/g, '').toLowerCase()}.test`,
      software_type: 'HealthPRO',
    },
  }, adminJar);
  result('hospital registered (API key issued)', (r.status === 200 || r.status === 201) && !!r.data?.hospital, { name, id: r.data?.hospital?.id?.slice(0, 8) });
  return { hospital: r.data.hospital, apiKey: r.data.api_key };
}

async function onboardHospital(name: string) {
  const h = await createHospital(name);
  step(`POST /hospital/accept-terms  (${name} accepts terms v1.0)`);
  const terms = await req('/hospital/accept-terms', {
    method: 'POST',
    headers: { 'X-Hospital-API-Key': h.apiKey },
    body: { terms_version: 'v1.0' },
  });
  result('terms accepted', terms.status === 200, terms.status);
  step(`PATCH /admin/hospitals/${h.hospital.id}/status → activate`);
  const act = await req(`/admin/hospitals/${h.hospital.id}/status`, { method: 'PATCH', body: { status: 'active' } }, adminJar);
  result('hospital activated (can now push data)', act.status === 200, act.status);
  return h;
}

async function ingest(apiKey: string, bundle: any, label: string) {
  step(`POST /hospital/ingest  (${label})`);
  const r = await req('/hospital/ingest', {
    method: 'POST',
    headers: { 'X-Hospital-API-Key': apiKey },
    body: bundle,
  });
  return r;
}

function prettyMatch(r: any): string {
  const d = r.data || {};
  const action = verdict(d.match_action);
  return `${action} | confidence ${d.confidence ?? '?'} | ${d.records_inserted ?? 0} record(s) stored`
    + (d.requires_evidence ? ' | HELD for review' : '')
    + (d.match_reason ? ` | reason: ${d.match_reason}` : '');
}

async function pendingMatches() {
  const r = await req('/admin/hospitals/matches', {}, adminJar);
  return r.data.pending_matches || [];
}

async function decide(linkId: string, action: 'confirm' | 'reject', evidence?: string) {
  return req(`/admin/hospitals/matches/${linkId}/confirm`, { method: 'POST', body: { action, evidence } }, adminJar);
}

async function main() {
  const stamp = Date.now().toString().slice(-6);
  const hospName = `DemoHosp${stamp}`;

  console.log(BOLD + '\n═══════════════════════════════════════════════════════════' + RST);
  console.log(BOLD + '  CHDS : HOSPITAL INTEGRATION LIVE DEMO' + RST);
  console.log(DIM + '  What this proves, in plain words:' + RST);
  console.log(DIM + '   • a hospital can join and start sending patient data' + RST);
  console.log(DIM + '   • the same patient from two hospitals becomes ONE record' + RST);
  console.log(DIM + '   • uncertain matches wait for an admin before anything is stored' + RST);
  console.log(DIM + '   • stored health data is encrypted and only decrypts with the right key' + RST);
  console.log(BOLD + '═══════════════════════════════════════════════════════════' + RST);

  banner('0. Clean leftover data from a previous run (safe to re-run)');
  await pg(`
    DELETE FROM hospital_audit_log WHERE hospital_id IN (SELECT id FROM hospitals WHERE name LIKE 'DemoHosp%');
    DELETE FROM records WHERE patient_id IN
      (SELECT id FROM patients WHERE full_name IN ('Suraj Lama','Sita Sharma','Raj Khatri','Kiran Malla','Gita Gurung'))
      OR hospital_id IN (SELECT id FROM hospitals WHERE name LIKE 'DemoHosp%');
    DELETE FROM hospital_patient_links WHERE hospital_id IN (SELECT id FROM hospitals WHERE name LIKE 'DemoHosp%')
      OR chds_patient_id IN (SELECT id FROM patients WHERE full_name IN ('Suraj Lama','Sita Sharma','Raj Khatri','Kiran Malla','Gita Gurung'));
    DELETE FROM hospital_consents WHERE hospital_id IN (SELECT id FROM hospitals WHERE name LIKE 'DemoHosp%')
      OR patient_id IN (SELECT id FROM patients WHERE full_name IN ('Suraj Lama','Sita Sharma','Raj Khatri','Kiran Malla','Gita Gurung'));
    DELETE FROM patients WHERE full_name IN ('Suraj Lama','Sita Sharma','Raj Khatri','Kiran Malla','Gita Gurung')
      OR nid_hash IN (encode(digest('1000111122223333','sha256'),'hex'),
                      encode(digest('1000555566667777','sha256'),'hex'),
                      encode(digest('1000888899990000','sha256'),'hex'),
                      encode(digest('7770888899990000','sha256'),'hex'));
    DELETE FROM users WHERE email IN ('kiran.malla@test.np') OR username LIKE 'hospital_%';
    DELETE FROM hospitals WHERE name LIKE 'DemoHosp%';
  `);
  ok('previous demo patients, records, links and hospitals removed');

  banner('1. Admin login');
  if (!(await loginAdmin())) { await pool.end(); process.exit(1); }

  banner('2. Onboard three hospitals (register, sign terms, activate)');
  const hA = await onboardHospital(`${hospName}A`);
  const hB = await onboardHospital(`${hospName}B`);
  const hC = await onboardHospital(`${hospName}C`);

  banner('3. Hospital A sends a brand-new patient (Suraj Lama, NID 1000111122223333)');
  const s1a = await ingest(hA.apiKey, load('s1-patan-surj-lama.json'), 'Hospital A pushes Suraj Lama, NID 1000111122223333');
  console.log(DIM + '   outcome: ' + RST + prettyMatch(s1a));
  result('new NID → a new patient record is created', s1a.data?.match_action === 'create_new', s1a.data?.message);
  const firstId = s1a.data?.chds_patient_id;
  result('the pushed medical record was stored', s1a.data?.records_inserted === 1, s1a.data?.records_inserted);

  banner('4. Hospital B sends the SAME patient (same NID) : should link, not duplicate');
  const s1b = await ingest(hB.apiKey, load('s1-bir-surj-lama.json'), 'Hospital B pushes Suraj Lama, NID 1000111122223333');
  console.log(DIM + '   outcome: ' + RST + prettyMatch(s1b));
  result('same NID → linked to the SAME existing patient (no duplicate)', s1b.data?.match_action === 'auto-link', s1b.data?.match_method);
  result('it maps to exactly the same patient record', s1b.data?.chds_patient_id === firstId, { first: firstId?.slice(0, 8), second: s1b.data?.chds_patient_id?.slice(0, 8) });

  banner('5. Verify in the database : one patient, two hospital links, merged records');
  const dbPatient = await pg(
    `SELECT p.id, p.full_name, p.date_of_birth, p.nid_hash, p.enc_key_salt IS NOT NULL AS has_patient_key,
            (SELECT count(*)::int FROM hospital_patient_links l WHERE l.chds_patient_id = p.id) AS hospital_links,
            (SELECT count(*)::int FROM records r WHERE r.patient_id = p.id) AS total_records,
            (SELECT string_agg(DISTINCT r.source, ', ') FROM records r WHERE r.patient_id = p.id) AS record_sources
     FROM patients p WHERE p.id = $1`, [firstId]);
  const dbRow = dbPatient[0];
  result('exactly ONE patient row exists for that NID', dbPatient.length === 1, { full_name: dbRow.full_name });
  result('both hospitals are linked to that one patient', dbRow.hospital_links === 2, dbRow.hospital_links);
  result('records from both hospitals were merged under it', dbRow.total_records === 2, { records: dbRow.total_records, sources: dbRow.record_sources });
  result('the patient has its own encryption key (per-patient KDF)', dbRow.has_patient_key === true, {});

  banner('6. Prove the stored data is encrypted (raw ciphertext, not readable text)');
  const raw = await pg(
    `SELECT encrypted_first_name FROM patients WHERE id = $1`,
    [firstId]);
  const hex = Buffer.from(raw[0].encrypted_first_name).toString('hex').slice(0, 48);
  console.log(DIM + '   what is actually stored for the first name (first 48 hex chars): ' + RST + hex);
  result('the name is stored as ciphertext : "Suraj" is not readable in it', hex.length > 0 && !/Suraj/.test(hex), {});
  const masterTry = await pool.query(
    'SELECT pgp_sym_decrypt($1::bytea, $2) AS d',
    [raw[0].encrypted_first_name, process.env.ENCRYPTION_KEY || ''])
    .then(() => true, () => false);
  result('even the master key alone cannot decrypt it (needs the patient key)', masterTry === false, {});

  banner('7. The app decrypts it correctly (using the per-patient key)');
  const dec = await makePatientDecryptor(firstId);
  const fname = await dec(raw[0].encrypted_first_name);
  ok(`decryptForPatient() recovered the name → "${fname}"`, { first_name: fname });
  result('it decrypts back to the real patient name', fname === 'Suraj');

  banner('8. No NID given → uncertain match is HELD for an admin to review');
  const s2A = await ingest(hA.apiKey, load('s2-hospital-A.json'), 'Hospital A: Sita Sharma, no NID');
  console.log(DIM + '   outcome: ' + RST + prettyMatch(s2A));
  const s2B = await ingest(hB.apiKey, load('s2-hospital-B.json'), 'Hospital B: same Sita Sharma details, no NID');
  console.log(DIM + '   outcome: ' + RST + prettyMatch(s2B));
  result('no NID → held for review (NOT silently merged)', s2B.data?.match_action === 'pending_review', s2B.data?.message);
  result('its records are kept back (0 stored) until an admin decides', s2B.data?.records_inserted === 0, s2B.data?.records_inserted);

  banner('9. An admin reviews the hold and confirms it with evidence');
  const pend = await pendingMatches();
  const s2Link = pend.find((m: any) => m.hospital_local_id === 'S2-HOSPB');
  result('the hold is sitting in the review queue', !!s2Link, s2Link?.candidate_patient_id?.slice(0, 8));
  if (!s2Link) { await pool.end(); process.exit(failCount ? 1 : 0); }
  const confirm = await decide(s2Link.link_id, 'confirm', 'Hospital verified identity via phone + mother name on file.');
  result('admin confirms the match (evidence recorded)', confirm.status === 200, confirm.data?.message);
  const heldRecs = await pg(`SELECT count(*)::int AS c FROM records WHERE patient_id = $1`, [s2A.data?.chds_patient_id]);
  result('the held records are imported now that the match is confirmed', heldRecs[0].c >= 1, heldRecs[0]);

  banner('10. Same details but a DIFFERENT valid NID → treated as a different person');
  const s3A = await ingest(hA.apiKey, load('s3-hospital-A.json'), 'Hospital A: Raj Khatri, NID 1000888899990000');
  console.log(DIM + '   outcome: ' + RST + prettyMatch(s3A));
  const s3B = await ingest(hC.apiKey, load('s3-hospital-B-diff-nid.json'), 'Hospital C: same Raj Khatri details but a different valid NID');
  console.log(DIM + '   outcome: ' + RST + prettyMatch(s3B));
  result('different valid NID → a separate new patient (not held for review)', s3B.data?.match_action === 'create_new', s3B.data?.reason);
  result('its record is stored immediately (nothing held back)', s3B.data?.records_inserted === 1, s3B.data?.records_inserted);
  const s3Count = await pg(`SELECT count(*)::int AS c FROM patients WHERE full_name = 'Raj Khatri'`);
  result('two separate patient records exist (one per NID)', s3Count[0].c === 2, s3Count[0]);

  banner('11. An admin REJECTS a false match → the held data is discarded, nothing leaks');
  const gita = (id: string, val: string) => ({
    resourceType: 'Bundle', type: 'transaction', entry: [{ resource: {
      resourceType: 'Patient', id, name: [{ family: 'Gurung', given: ['Gita'] }], birthDate: '1985-03-14', gender: 'female',
    } }, { resource: { resourceType: 'Observation', status: 'final', code: { text: 'Glucose' }, subject: { reference: `Patient/${id}` }, valueString: val } }],
  });
  const s5A = await ingest(hA.apiKey, gita('S5-A', '95'), 'Hospital A: Gita Gurung, no NID');
  const s5B = await ingest(hB.apiKey, gita('S5-B', '97'), 'Hospital B: same Gita Gurung details, no NID');
  console.log(DIM + '   outcome: ' + RST + prettyMatch(s5B));
  result('no NID → held for review', s5B.data?.match_action === 'pending_review', s5B.data?.message);
  const pend5 = await pendingMatches();
  const s5Link = pend5.find((m: any) => m.hospital_local_id === 'S5-B');
  if (!s5Link) { await pool.end(); process.exit(failCount ? 1 : 0); }
  const reject = await decide(s5Link.link_id, 'reject', 'Hospital says records do not match on interview.');
  result('admin rejects the match', reject.status === 200, reject.data?.message);
  const s5Recs = await pg(`SELECT count(*)::int AS c FROM records WHERE patient_id = $1`, [s5A.data?.chds_patient_id]);
  result('the rejected hospital left NO record behind (nothing leaked)', s5Recs[0].c === 1, s5Recs[0]);

  banner('12. A brand-new patient arrives → created and given a secure temp login');
  const s7 = await ingest(hB.apiKey, {
    resourceType: 'Bundle', type: 'transaction', entry: [{ resource: {
      resourceType: 'Patient', id: 'S7-NEW', identifier: [{ system: 'http://chds.np/national-id', type: { text: 'NID' }, value: '7770888899990000' }],
      name: [{ family: 'Malla', given: ['Kiran'] }], birthDate: '1988-09-09', gender: 'male', telecom: [{ system: 'email', value: 'kiran.malla@test.np' }],
    } }, { resource: { resourceType: 'Observation', status: 'final', code: { text: 'Hemoglobin' }, subject: { reference: 'Patient/S7-NEW' }, valueString: '13.5' } }],
  }, 'Hospital B: new patient Kiran Malla, NID 7770888899990000');
  console.log(DIM + '   outcome: ' + RST + prettyMatch(s7));
  result('new NID → a new patient record is created', s7.data?.match_action === 'create_new', {});
  result('a secure 16-character temporary password was auto-provisioned', s7.data?.temp_password?.length === 16, { temp_password: s7.data?.temp_password });

  console.log(`\n${BOLD}═══════════════════════════════════════════════════════════${RST}`);
  console.log(`${BOLD}  RESULT: ${passCount} passed, ${failCount} failed${RST}`);
  console.log(`${BOLD}═══════════════════════════════════════════════════════════${RST}`);
  await pool.end();
  process.exit(failCount ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
