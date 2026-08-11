// Hospital matching & merge : end-to-end scenario verifier.
// Exercises the real API against a running stack.
//
// Run:  npx ts-node --project tsconfig.test.json tests/scenarios/run-scenarios.ts
// Env:  API_BASE (default http://localhost:4000/api/v1)
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

const API_BASE = process.env.API_BASE || 'http://localhost:4000/api/v1';
const ADMIN = { email: 'admin@chds.np', password: '@CHDS2026!' };
const DB_URL = process.env.CHDS_DB_URL || 'postgres://postgres:change_me_super_secret_db_password@localhost:5432/chds_db';

const FIX = path.resolve(__dirname, '../fixtures/fhir');

let adminJar: string[] = [];
let passCount = 0;
let failCount = 0;
const pool = new Pool({ connectionString: DB_URL });

function check(name: string, cond: boolean, extra?: any) {
  if (cond) { passCount++; console.log(`  ✓ ${name}`); }
  else {
    failCount++;
    console.log(`  ✗ FAIL: ${name}${extra ? '  ' + JSON.stringify(extra) : ''}`);
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

async function loginAdmin() {
  const r = await req('/auth/login', { method: 'POST', body: { email: ADMIN.email, password: ADMIN.password } });
  adminJar = r.setCookie;
  return r;
}

async function createHospital(name: string): Promise<{ hospital: any; apiKey: string }> {
  const r = await req('/admin/hospitals', {
    method: 'POST',
    body: { name, address: 'Kathmandu', contact_number: '+977-1-5550000', contact_email: `admin@${name.replace(/\s+/g, '').toLowerCase()}.test`, software_type: 'HealthPRO' },
  }, adminJar);
  return { hospital: r.data.hospital, apiKey: r.data.api_key };
}

async function acceptTerms(apiKey: string) {
  return req('/hospital/accept-terms', {
    method: 'POST',
    headers: { 'X-Hospital-API-Key': apiKey },
    body: { terms_version: 'v1.0' },
  });
}

async function activate(hospitalId: string) {
  return req(`/admin/hospitals/${hospitalId}/status`, { method: 'PATCH', body: { status: 'active' } }, adminJar);
}

async function ingest(apiKey: string, bundle: any) {
  return req('/hospital/ingest', {
    method: 'POST',
    headers: { 'X-Hospital-API-Key': apiKey },
    body: bundle,
  });
}

async function pendingMatches() {
  const r = await req('/admin/hospitals/matches', {}, adminJar);
  return r.data.pending_matches || [];
}

async function decide(linkId: string, action: 'confirm' | 'reject', evidence?: string) {
  return req(`/admin/hospitals/matches/${linkId}/confirm`, { method: 'POST', body: { action, evidence } }, adminJar);
}

async function pgq(sql: string, params: any[] = []): Promise<any[]> {
  const r = await pool.query(sql, params);
  return r.rows;
}

function load(name: string): any {
  return JSON.parse(fs.readFileSync(path.join(FIX, name), 'utf8'));
}

async function main() {
  console.log('\n=== CHDS Hospital Matching Scenario Verifier ===\n');

  if (!fs.existsSync(path.join(FIX, 's1-patan-surj-lama.json'))) {
    throw new Error('Fixtures missing. Run gen-fixtures.ts first.');
  }

  // ── Clean prior run artifacts so the suite is idempotent ──
  console.log('Cleaning leftover scenario data…');
  await pgq(`
    DELETE FROM hospital_audit_log WHERE hospital_id IN
      (SELECT id FROM hospitals WHERE name LIKE 'Scen%');
    DELETE FROM records WHERE patient_id IN
      (SELECT id FROM patients WHERE full_name IN ('Suraj Lama','Sita Sharma','Raj Khatri','Bina Gurung','Kiran Malla','Gita Gurung'));
    DELETE FROM hospital_patient_links WHERE hospital_id IN
      (SELECT id FROM hospitals WHERE name LIKE 'Scen%')
      OR chds_patient_id IN (SELECT id FROM patients WHERE full_name IN ('Suraj Lama','Sita Sharma','Raj Khatri','Bina Gurung','Kiran Malla','Gita Gurung'));
    DELETE FROM hospital_consents WHERE hospital_id IN
      (SELECT id FROM hospitals WHERE name LIKE 'Scen%')
      OR patient_id IN (SELECT id FROM patients WHERE full_name IN ('Suraj Lama','Sita Sharma','Raj Khatri','Bina Gurung','Kiran Malla','Gita Gurung'));
    DELETE FROM records WHERE hospital_id IN
      (SELECT id FROM hospitals WHERE name LIKE 'Scen%');
    DELETE FROM patients WHERE nid_hash IN (
      encode(digest('1000111122223333','sha256'),'hex'),
      encode(digest('1000555566667777','sha256'),'hex'),
      encode(digest('1000888899990000','sha256'),'hex'),
      encode(digest('2110202020202020','sha256'),'hex'),
      encode(digest('7770888899990000','sha256'),'hex')
    ) OR full_name IN ('Suraj Lama','Sita Sharma','Raj Khatri','Bina Gurung','Kiran Malla','Gita Gurung');
    DELETE FROM users WHERE email IN ('bina.gurung@test.np','kiran.malla@test.np')
      OR username LIKE 'hospital_%';
    DELETE FROM hospitals WHERE name LIKE 'Scen%';
  `);

  console.log('Logging in as admin…');
  const login = await loginAdmin();
  check('admin login', login.status === 200, login.data);

  const stamp = Date.now().toString().slice(-6);
  const h = {
    A: await createHospital(`ScenA${stamp}`),
    B: await createHospital(`ScenB${stamp}`),
    C: await createHospital(`ScenC${stamp}`),
    D: await createHospital(`ScenD${stamp}`),
  };
  const hkeys = ['A','B','C','D'] as const;
  for (const k of hkeys) {
    await acceptTerms(h[k].apiKey);
    const act = await activate(h[k].hospital.id);
    check(`hospital ${k} active`, act.status === 200, act.data);
  }

  // ── S1: Same NID from two hospitals → ONE patient ──
  console.log('\n[S1] Same NID pushed by two hospitals → one patient');
  const s1a = await ingest(h.A.apiKey, load('s1-patan-surj-lama.json'));
  check('S1 first → create_new', s1a.data?.match_action === 'create_new', s1a.data);
  const s1First = s1a.data?.chds_patient_id;
  check('S1 first imported 1 record', s1a.data?.records_inserted === 1, s1a.data);

  const s1b = await ingest(h.B.apiKey, load('s1-bir-surj-lama.json'));
  check('S1 same NID → auto-link', s1b.data?.match_action === 'auto-link', s1b.data);
  check('S1 auto-link → same patient', s1b.data?.chds_patient_id === s1First, { first: s1First, second: s1b.data?.chds_patient_id });
  check('S1 second imported 1 record', s1b.data?.records_inserted === 1, s1b.data);

  const s1links = await pgq(
    `SELECT hospital_local_id FROM hospital_patient_links WHERE chds_patient_id=$1`,
    [s1First]);
  check('S1 exactly 2 hospital links under one patient', s1links.length === 2, s1links);

  // ── S2: No NID, identical demos → pending_review, records HELD ──
  console.log('\n[S2] No NID, identical demographics from two hospitals');
  const s2A = await ingest(h.A.apiKey, load('s2-hospital-A.json'));
  check('S2 A → create_new', s2A.data?.match_action === 'create_new', s2A.data);
  const s2B = await ingest(h.B.apiKey, load('s2-hospital-B.json'));
  check('S2 B → pending_review (not auto-link)', s2B.data?.match_action === 'pending_review', s2B.data);
  check('S2 requires_evidence=true', s2B.data?.requires_evidence === true, s2B.data);
  check('S2 0 records inserted (held)', s2B.data?.records_inserted === 0, s2B.data);

  const pend2 = await pendingMatches();
  const s2Link = pend2.find((m: any) => m.link_id && m.hospital_local_id === 'S2-HOSPB');
  check('S2 link in review queue', !!s2Link, pend2.map((m: any) => m.hospital_local_id));
  check('S2 candidate is the S2A patient', s2Link && s2Link.candidate_patient_id === s2A.data?.chds_patient_id, s2Link);
  if (!s2Link) throw new Error('S2 link not found : aborting downstream scenarios');

  // ── S3: Same demos, DIFFERENT NID → two separate patients, no hold ──
  console.log('\n[S3] Same name/DOB/gender but different NID');
  const s3A = await ingest(h.A.apiKey, load('s3-hospital-A.json'));
  check('S3 A → create_new', s3A.data?.match_action === 'create_new', s3A.data);
  const s3B = await ingest(h.C.apiKey, load('s3-hospital-B-diff-nid.json'));
  check('S3 B (different valid NID) → create_new (separate patient)', s3B.data?.match_action === 'create_new', s3B.data);
  check('S3 NOT pending_review (valid NID is authoritative)', s3B.data?.match_action !== 'pending_review', s3B.data);
  check('S3 records inserted immediately (nothing held)', s3B.data?.records_inserted === 1, s3B.data?.records_inserted);
  // Two patients now exist with identical demographics but distinct NIDs
  const s3NidCount = await pgq(`SELECT count(*)::int AS c FROM patients WHERE full_name='Raj Khatri'`);
  check('S3 two separate patients (one per NID)', s3NidCount[0].c === 2, s3NidCount[0]);

  // ── S4: QA confirm (with evidence) imports held records ──
  console.log('\n[S4] QA confirms pending match with evidence');
  const confirm = await decide(s2Link.link_id, 'confirm', 'Hospital verified via phone number and mother name on file.');
  check('S4 confirm 200', confirm.status === 200, confirm.data);
  const s2Records = await pgq(`SELECT count(*)::int AS c FROM records WHERE patient_id=$1`, [s2A.data?.chds_patient_id]);
  check('S4 held record now imported', s2Records[0].c >= 1, s2Records[0]);
  const s2linkAfter = await pgq(`SELECT status, match_method, evidence FROM hospital_patient_links WHERE hospital_local_id='S2-HOSPB'`);
  check('S4 link confirmed w/ admin_confirmed', s2linkAfter[0].status === 'confirmed' && s2linkAfter[0].match_method === 'admin_confirmed', s2linkAfter[0]);
  check('S4 evidence recorded', !!s2linkAfter[0].evidence, s2linkAfter[0]);

  // ── S5: QA rejects → held bundle discarded, no leak ──
  console.log('\n[S5] QA rejects pending → held records discarded');
  const s5Person = (id: string, value: string) => ({
    resourceType: 'Bundle', type: 'transaction', entry: [{ resource: {
      resourceType: 'Patient', id,
      name: [{ family: 'Gurung', given: ['Gita'] }], birthDate: '1985-03-14', gender: 'female',
    } }, { resource: { resourceType: 'Observation', status: 'final', code: { text: 'Glucose' }, subject: { reference: `Patient/${id}` }, valueString: value } }],
  });
  const s5A = await ingest(h.A.apiKey, s5Person('S5-A', '95'));
  const s5B = await ingest(h.B.apiKey, s5Person('S5-B', '97'));
  check('S5 B → pending_review (no NID, matching demos)', s5B.data?.match_action === 'pending_review', s5B.data);
  const pend5 = await pendingMatches();
  const s5Link = pend5.find((m: any) => m.link_id && m.hospital_local_id === 'S5-B');
  check('S5 link in review queue', !!s5Link, pend5.map((m: any) => m.hospital_local_id));
  if (!s5Link) throw new Error('S5 link not found : aborting reject scenario');
  const reject = await decide(s5Link.link_id, 'reject', 'Hospital says records do not match on interview.');
  check('S5 reject 200', reject.status === 200, reject.data);
  const s5LinkGone = await pgq(`SELECT count(*)::int AS c FROM hospital_patient_links WHERE hospital_local_id='S5-B'`);
  check('S5 link removed', s5LinkGone[0].c === 0, s5LinkGone[0]);
  const s5ARecs = await pgq(`SELECT count(*)::int AS c FROM records WHERE patient_id=$1`, [s5A.data?.chds_patient_id]);
  check('S5 no records leaked from rejected link', s5ARecs[0].c === 1, s5ARecs[0]);

  // ── S6: existing patient gets a push → auto-link via NID, no duplicate ──
  console.log('\n[S6] Existing patient already in DB gets hospital push');
  await pgq(`
    INSERT INTO users (username, email, password_hash, role, active, onboarding_complete)
    VALUES ('bina_gurung', 'bina.gurung@test.np', crypt('@CHDS2026!', gen_salt('bf',12)), 'patient', true, true)
    ON CONFLICT (email) DO NOTHING`);
  await pgq(`
    INSERT INTO patients (user_id, full_name, date_of_birth, gender, nid_hash,
      encrypted_first_name, encrypted_last_name, encrypted_dob)
    SELECT id, 'Bina Gurung', '1992-11-02', 'female',
      encode(digest('2110202020202020','sha256'),'hex'),
      pgp_sym_encrypt('Bina', $1), pgp_sym_encrypt('Gurung', $1), pgp_sym_encrypt('1992-11-02', $1)
    FROM users WHERE email='bina.gurung@test.np'
    ON CONFLICT (nid_hash) DO NOTHING`,
    [process.env.ENCRYPTION_KEY || 'test-encryption-key-at-least-32-chars!!']);
  const s6 = await ingest(h.D.apiKey, load('s6-hospital-push.json'));
  check('S6 existing NID → auto-link', s6.data?.match_action === 'auto-link', s6.data);
  const binaCount = await pgq(`SELECT count(*)::int AS c FROM patients WHERE nid_hash=encode(digest('2110202020202020','sha256'),'hex')`);
  check('S6 only ONE patient for that NID', binaCount[0].c === 1, binaCount[0]);

  // ── S7: brand-new patient → create_new + login provisioned ──
  console.log('\n[S7] Brand-new patient → created with login');
  const s7 = await ingest(h.B.apiKey, {
    resourceType: 'Bundle', type: 'transaction', entry: [{ resource: {
      resourceType: 'Patient', id: 'S7-NEW', identifier: [{ system: 'http://chds.np/national-id', type: { text: 'NID' }, value: '7770888899990000' }],
      name: [{ family: 'Malla', given: ['Kiran'] }], birthDate: '1988-09-09', gender: 'male', telecom: [{ system: 'email', value: 'kiran.malla@test.np' }],
    } }, { resource: { resourceType: 'Observation', status: 'final', code: { text: 'Hemoglobin' }, subject: { reference: 'Patient/S7-NEW' }, valueString: '13.5' } }],
  });
  check('S7 → create_new', s7.data?.match_action === 'create_new', s7.data);
  check('S7 login provisioned (temp_password present)', !!s7.data?.temp_password, s7.data);
  const s7User = await pgq(`SELECT u.email FROM users u JOIN patients p ON p.user_id=u.id WHERE p.full_name='Kiran Malla'`);
  check('S7 patient has a login user', s7User.length === 1, s7User);

  // ── S8: records integrity (hospital_push accepted, encrypted) ──
  console.log('\n[S8] Record integrity');
  const s8Recs = await pgq(`SELECT encrypted_title IS NOT NULL AS enc, category, source FROM records WHERE patient_id=$1`, [s1First]);
  check('S8 records encrypted + source=hospital_push', s8Recs.every((r: any) => r.enc && r.source === 'hospital_push'), s8Recs[0]);

  console.log(`\n=== RESULT: ${passCount} passed, ${failCount} failed ===`);
  await pool.end();
  process.exit(failCount ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });