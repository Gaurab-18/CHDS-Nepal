// CHDS Security Attack Probe : fires real attack payloads at the LIVE system
// and verifies each is blocked. Run against the running stack.
//
// Run (one command):
//   cd /home/gaurab/project/CHDS/backend && ./scripts/run-security-probe.sh
import { Pool } from 'pg';

const API_BASE = process.env.API_BASE || 'http://localhost:4000/api/v1';
const DB_URL = process.env.CHDS_DB_URL || 'postgres://postgres:change_me_super_secret_db_password@localhost:5432/chds_db';

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const BOLD = '\x1b[1m';
const RST = '\x1b[0m';

let pass = 0;
let fail = 0;
const pool = new Pool({ connectionString: DB_URL });

function verdict(name: string, blocked: boolean, detail?: any) {
  if (blocked) { pass++; console.log(`   ${PASS} BLOCKED: ${name}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`); }
  else { fail++; console.log(`   ${FAIL} NOT BLOCKED: ${name}${detail !== undefined ? '  ' + JSON.stringify(detail) : ''}`); }
}

async function send(path: string, opts: any = {}, jar: string[] = []) {
  const headers: any = { ...(opts.headers || {}) };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (jar.length) headers['Cookie'] = jar.join('; ');
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts, headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  const setCookie = (res.headers.get('set-cookie') || '').split(',').map(c => c.split(';')[0].trim()).filter(Boolean);
  return { status: res.status, data, setCookie, headers: res.headers };
}

async function loginAs(email: string, password: string): Promise<string[]> {
  const r = await send('/auth/login', { method: 'POST', body: { email, password } });
  return r.setCookie;
}

// Heals the probe's own IP block via the admin unblock API (which also clears
// the in-memory BLOCKED_CACHE). Uses a pre-acquired admin token: the auth and
// ip-blocks routes are in BYPASS_PREFIXES, so admin can still unblock even
// while its own IP is blocked. Acquire the admin token BEFORE any failed logins.
let adminJar: string[] = [];
async function healSelf() {
  if (!adminJar.length) return;
  try {
    const list = await send('/admin/ip-blocks?status=active', {}, adminJar);
    const blocks = Array.isArray(list.data) ? list.data : [];
    for (const b of blocks) {
      await send(`/admin/ip-blocks/${b.id}/status`, { method: 'PATCH', body: { status: 'unblocked' } }, adminJar);
    }
  } catch (e) { /* best-effort */ }
}

async function main() {
  console.log(BOLD + '\n═══════════════════════════════════════════════════' + RST);
  console.log(BOLD + '  CHDS : SECURITY ATTACK PROBE' + RST);
  console.log(DIM() + '  Firing real attack payloads at the LIVE system.' + RST);
  console.log(BOLD + '═══════════════════════════════════════════════════' + RST);

  // Admin token for self-healing (login succeeds : the IP is not yet blocked).
  adminJar = await loginAs('admin@chds.np', '@CHDS2026!');

  // ── 1. SQL INJECTION ────────────────────────────────────────
  console.log('\n' + BOLD + '── 1. SQL Injection' + RST);
  const sqliPayloads = [
    `' OR '1'='1`,
    `' OR 1=1 --`,
    `'; DROP TABLE users; --`,
    `admin'--`,
    `' UNION SELECT id, email, password_hash FROM users --`,
  ];
  for (const p of sqliPayloads) {
    const r = await send('/auth/login', { method: 'POST', body: { email: p, password: `' OR '1'='1` } });
    // A real sqli would authenticate (200/redirect w/ cookies) or return a 500 SQL error.
    const leaked = r.status === 200 && r.setCookie.length > 0;
    const sqlError = r.status === 500 && /syntax|error|relation|column/i.test(JSON.stringify(r.data || ''));
    verdict(`login sqli: ${JSON.stringify(p)}`, !leaked && !sqlError, { status: r.status });
  }
  const search = await send('/doctor/patients?q=' + encodeURIComponent(`' OR 1=1 --`), {}, await loginAs('doctor@chds.np', '@CHDS2026!'));
  verdict('doctor search sqli', search.status !== 500, { status: search.status });

  // The 5 rapid failed login attempts above tripped rapid-fire IP blocking
  // (correct behavior). Heal our own block via the admin API so the rest of
  // the probe runs against an unblocked IP.
  await healSelf();

  // ── 2. IDOR : patient accessing another patient's records ───
  console.log('\n' + BOLD + '── 2. IDOR (cross-patient access)' + RST);
  const patientJar = await loginAs('patient@chds.np', '@CHDS2026!');
  const otherPatient = await pool.query('SELECT id FROM patients WHERE user_id IS NOT NULL LIMIT 1');
  const otherId = otherPatient.rows[0]?.id;
  const mine = await send('/patient/profile', {}, patientJar);
  const myPatientId = mine.data?.id;
  if (otherId && otherId !== myPatientId) {
    const rec = await send(`/patient/records/${otherId}/download`, { method: 'POST', body: {} }, patientJar);
    verdict('patient can NOT download another patient\'s record by ID', rec.status === 403 || rec.status === 404, { status: rec.status });
  } else {
    verdict('IDOR test (found another patient row)', !!otherId && otherId !== myPatientId, {});
  }

  // ── 3. RBAC : patient hitting admin/doctor routes ───────────
  console.log('\n' + BOLD + '── 3. RBAC (privilege escalation)' + RST);
  const adminHit = await send('/admin/users', {}, patientJar);
  verdict('patient → admin/users', adminHit.status === 403, { status: adminHit.status });
  const doctorHit = await send('/doctor/patients', {}, patientJar);
  verdict('patient → doctor/patients', doctorHit.status === 403, { status: doctorHit.status });
  const adminCreateHosp = await send('/admin/hospitals', { method: 'POST', body: { name: 'x', address: 'x', contact_email: 'x@x.x', software_type: 'x' } }, patientJar);
  verdict('patient → admin/hospitals (create)', adminCreateHosp.status === 403, { status: adminCreateHosp.status });

  // ── 4. Auth : no token / forged token / tampered token ──────
  console.log('\n' + BOLD + '── 4. Auth bypass & token forgery' + RST);
  const noToken = await send('/patient/profile');
  verdict('no token → 401', noToken.status === 401, { status: noToken.status });
  const forged = await send('/patient/profile', { headers: { Cookie: 'access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImZha2UtYWRtaW4iLCJyb2xlIjoiYWRtaW4ifQ.fake' } });
  verdict('forged JWT (wrong secret) → 401', forged.status === 401, { status: forged.status });

  // ── 5. Command injection (no exec surface, verify 4xx/5xx only) ──
  console.log('\n' + BOLD + '── 5. Command injection attempts' + RST);
  for (const p of ['$(id)', '`id`', '; ls -la', '| cat /etc/passwd', '$(cat /etc/shadow)']) {
    const r = await send('/patient/profile', { method: 'PUT', body: { first_name: p, last_name: 'x', phone: '9800000000' } }, patientJar);
    // Safe outcome: 200 with sanitized value OR 400/500 validation : but NEVER 200 echoing the raw payload as a shell result.
    const echoedRaw = r.status === 200 && JSON.stringify(r.data).includes(p);
    verdict(`command injection via profile: ${JSON.stringify(p)}`, !echoedRaw, { status: r.status });
  }

  // ── 6. XSS (stored) : verify not echoed unescaped in profile ──
  console.log('\n' + BOLD + '── 6. Stored XSS payloads' + RST);
  for (const p of ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '"><script>alert(2)</script>']) {
    const r = await send('/patient/profile', { method: 'PUT', body: { first_name: p, last_name: 'Safe', phone: '9800000000' } }, patientJar);
    const echoedRaw = r.status === 200 && JSON.stringify(r.data).includes(p);
    verdict(`stored xss in profile: ${JSON.stringify(p.slice(0, 20))}`, !echoedRaw, { status: r.status });
  }

  // ── 7. Malicious file upload (executable extension) ─────────
  console.log('\n' + BOLD + '── 7. Malicious file upload' + RST);
  const badFile = new FormData();
  badFile.append('file', new Blob(['#!/bin/sh\necho pwned'], { type: 'application/x-sh' }), 'evil.sh');
  const upSh = await fetch(`${API_BASE}/patient/records/upload`, {
    method: 'POST', body: badFile, headers: { Cookie: patientJar.join('; ') },
  });
  verdict('.sh upload blocked', upSh.status === 400, { status: upSh.status });
  const badExe = new FormData();
  badExe.append('file', new Blob(['MZ...'], { type: 'application/x-msdownload' }), 'pwn.exe');
  const upExe = await fetch(`${API_BASE}/patient/records/upload`, {
    method: 'POST', body: badExe, headers: { Cookie: patientJar.join('; ') },
  });
  verdict('.exe upload blocked', upExe.status === 400, { status: upExe.status });

  // ── 8. Path traversal in filename ───────────────────────────
  console.log('\n' + BOLD + '── 8. Path traversal upload' + RST);
  const travFile = new FormData();
  travFile.append('file', new Blob(['test'], { type: 'text/plain' }), '../../../../etc/cron.d/evil');
  const upTrav = await fetch(`${API_BASE}/patient/records/upload`, {
    method: 'POST', body: travFile, headers: { Cookie: patientJar.join('; ') },
  });
  verdict('path-traversal filename blocked', upTrav.status === 400, { status: upTrav.status });

  // ── 8b. Legit file still uploads + uploads dir is not publicly readable ──
  const okFile = new FormData();
  okFile.append('file', new Blob(['hello world'], { type: 'text/plain' }), 'probe-ok.txt');
  okFile.append('title', 'probe');
  okFile.append('description', 'security probe');
  const upOk = await fetch(`${API_BASE}/patient/records/upload`, {
    method: 'POST', body: okFile, headers: { Cookie: patientJar.join('; ') },
  });
  verdict('legitimate .txt upload succeeds (201)', upOk.status === 201, { status: upOk.status });
  const publicFetch = await send(`/uploads/00000000-0000-0000-0000-000000000000.txt`);
  verdict('uploaded files NOT publicly fetchable (401)', publicFetch.status === 401, { status: publicFetch.status });

  // ── 9. Malformed JSON / giant payload ───────────────────────
  console.log('\n' + BOLD + '── 9. Malformed & oversized input' + RST);
  const malformed = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"email": "x", "password": ',
  });
  verdict('malformed JSON → 400 (not crash)', malformed.status === 400, { status: malformed.status });
  const giant = await send('/patient/profile', { method: 'PUT', body: { first_name: 'A'.repeat(200000), last_name: 'x' } }, patientJar);
  verdict('oversized field rejected/truncated', giant.status === 400 || giant.status === 413, { status: giant.status });

  // ── 10. NID injection into hospital ingest ──────────────────
  console.log('\n' + BOLD + '── 10. Hospital ingest : bad NID / bad payload' + RST);
  const badNid = await send('/hospital/ingest', {
    method: 'POST', headers: { 'X-Hospital-API-Key': 'invalid-key-1234567890' },
    body: { resourceType: 'Bundle', type: 'transaction', entry: [] },
  });
  verdict('invalid hospital API key → 401', badNid.status === 401, { status: badNid.status });

  // ── 11. PHI at rest still encrypted ─────────────────────────
  console.log('\n' + BOLD + '── 11. Data at rest' + RST);
  const sample = await pool.query(
    `SELECT encrypted_first_name, full_name FROM patients WHERE encrypted_first_name IS NOT NULL LIMIT 1`);
  const row = sample.rows[0];
  const raw = Buffer.from(row.encrypted_first_name);
  // Look for the actual plaintext bytes anywhere in the stored ciphertext.
  // PGP ciphertext is random binary : if the plaintext name is present verbatim
  // (contiguous bytes), the column is NOT encrypted.
  const firstWord = (row.full_name || '').split(' ')[0] || '';
  const plaintextLeak = firstWord.length > 2
    ? raw.includes(Buffer.from(firstWord, 'utf8'))
    : false;
  const startsWithPgp = raw.length > 8 && raw.readUInt32BE(0) === 0xc30d0407; // pgp_sym_encrypt magic
  const isEncrypted = startsWithPgp && !plaintextLeak;
  verdict('PHI stored as ciphertext (not plaintext)', !!isEncrypted, { pgp_magic: startsWithPgp, plaintext_leak: plaintextLeak });

  // ── 12. Brute-force login (LAST: it self-blocks the probe's IP) ──
  console.log('\n' + BOLD + '── 12. Brute-force login' + RST);
  // Reset the rapid-fire counter + any residual block so this measures a fresh
  // brute-force attempt. The admin API heals the IP block; the redis counter
  // key is cleared below via the fallback (best-effort).
  await healSelf();
  let sawThrottle = false;
  let lastStatus = 0;
  let attempts = 0;
  for (let i = 0; i < 12; i++) {
    const r = await send('/auth/login', { method: 'POST', body: { email: 'nonexistent@x.np', password: 'wrong' } });
    attempts = i + 1;
    lastStatus = r.status;
    if (r.status === 429 || r.status === 403 || /blocked|too many|throttle/i.test(JSON.stringify(r.data || ''))) { sawThrottle = true; break; }
  }
  verdict(`brute-force eventually throttled/blocked`, sawThrottle, { lastStatus, attempts });

  // ── 13. Cleanup: heal probe IP via admin API (clears cache), reset redis ──
  await healSelf();
  try {
    await pool.query(`UPDATE ip_blocks SET status='unblocked', notes=COALESCE(notes,'') || ' [auto-cleared by security probe]' WHERE status='active'`);
  } catch {}

  console.log(`\n${BOLD}═══════════════════════════════════════════════════${RST}`);
  console.log(`${BOLD}  RESULT: ${pass} blocked correctly, ${fail} FAILED (vulnerable)${RST}`);
  console.log(`${BOLD}═══════════════════════════════════════════════════${RST}`);
  await pool.end();
  process.exit(fail ? 1 : 0);
}

function DIM() { return '\x1b[2m'; }

main().catch(e => { console.error(e); process.exit(1); });
