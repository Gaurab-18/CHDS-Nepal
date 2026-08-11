import { Pool } from 'pg';
import { faker } from '@faker-js/faker';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'chds_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'change_me_super_secret_db_password',
});

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-aes-256-encryption-key-here';

function randomTimestamp(daysAgo: number): string {
  const d = new Date(Date.now() - Math.random() * daysAgo * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

async function pgpEncrypt(plain: string): Promise<Buffer> {
  const r = await pool.query('SELECT pgp_sym_encrypt($1, $2) AS v', [plain, ENCRYPTION_KEY]);
  return r.rows[0].v;
}

async function main() {
  console.log('Seeding synthetic data…');

  // --- Hospitals ---
  const hospitalNames = ['Bir Hospital', 'Patan Hospital', 'Teaching Hospital', 'Mediciti Hospital', 'Norvic Hospital'];
  const hospitalIds: string[] = [];
  for (const name of hospitalNames) {
    const r = await pool.query(
      `INSERT INTO hospitals (id, name, address, contact_number)
       VALUES (gen_random_uuid(), $1, $2, $3)
       ON CONFLICT (name) DO NOTHING
       RETURNING id`,
      [name, faker.location.streetAddress(), faker.phone.number()]
    );
    if (r.rows.length) hospitalIds.push(r.rows[0].id);
  }
  console.log(`  ✓ ${hospitalIds.length} hospitals`);

  // --- Clinician users ---
  const doctorIds: string[] = [];
  const existingDoctors = await pool.query('SELECT id FROM users WHERE role = $1 LIMIT 5', ['doctor']);
  for (const row of existingDoctors.rows) {
    doctorIds.push(row.id);
  }
  if (doctorIds.length < 3) {
    for (let i = 0; i < 3; i++) {
      const r = await pool.query(
        `INSERT INTO users (username, email, password_hash, role, two_factor_enabled, active)
         VALUES (gen_random_uuid(), $1, crypt('@CHDS2026!', gen_salt('bf', 12)), 'doctor', false, true)
         RETURNING id`,
        [`doctor${Date.now()}${i}@example.com`]
      );
      if (r.rows.length) doctorIds.push(r.rows[0].id);
    }
  }
  console.log(`  ✓ ${doctorIds.length} doctors`);

  // --- Patient users + patient records + consents + wipe requests ---
  const patientUserIds: string[] = [];
  const patientIds: string[] = [];
  const createdConsentIds: string[] = [];

  for (let i = 0; i < 50; i++) {
    const email = faker.internet.email();
    const username = faker.internet.username();
    const userR = await pool.query(
      `INSERT INTO users (id, username, email, password_hash, role, onboarding_complete)
       VALUES (gen_random_uuid(), $1, $2, crypt('@CHDS2026!', gen_salt('bf', 12)), 'patient', true)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [username, email]
    );
    if (!userR.rows.length) continue;
    const userId = userR.rows[0].id;
    patientUserIds.push(userId);

    const encFirstName = await pgpEncrypt(faker.person.firstName());
    const encLastName = await pgpEncrypt(faker.person.lastName());
    const encDob = await pgpEncrypt(faker.date.birthdate({ min: 18, max: 90, mode: 'age' }).toISOString().split('T')[0]);
    const encPhone = await pgpEncrypt(faker.phone.number());
    const encAddress = await pgpEncrypt(faker.location.streetAddress());
    const encNationalId = await pgpEncrypt(faker.string.alphanumeric(10).toUpperCase());

    const patientR = await pool.query(
      `INSERT INTO patients (id, user_id, encrypted_first_name, encrypted_last_name, encrypted_dob, encrypted_phone, encrypted_address, encrypted_national_id)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [userId, encFirstName, encLastName, encDob, encPhone, encAddress, encNationalId]
    );
    const patientId = patientR.rows[0].id;
    patientIds.push(patientId);

    // 4 records per patient (mix of sources)
    const sources: ('patient_upload' | 'doctor_entry' | 'fhir_push')[] = ['patient_upload', 'doctor_entry', 'fhir_push'];
    for (const source of sources) {
      const encTitle = await pgpEncrypt(faker.lorem.sentence());
      const encDesc = await pgpEncrypt(faker.lorem.paragraph());
      const doctorId = source === 'doctor_entry' || source === 'fhir_push'
        ? doctorIds[Math.floor(Math.random() * doctorIds.length)] : null;
      await pool.query(
        `INSERT INTO records (id, patient_id, hospital_id, doctor_id, source, encrypted_title, encrypted_description, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [patientId, hospitalIds[Math.floor(Math.random() * hospitalIds.length)], doctorId, source, encTitle, encDesc, randomTimestamp(90)]
      );
    }

    // 2 consents per patient (some expired)
    for (let k = 0; k < 2; k++) {
      const doctorId = doctorIds[Math.floor(Math.random() * doctorIds.length)];
      const scopedAccess = ['all', 'read_only', 'emergency_only'][Math.floor(Math.random() * 3)];
      const expiresInDays = Math.random() > 0.3 ? 30 : -10; // 70% active, 30% expired
      const r = await pool.query(
        `INSERT INTO consents (id, patient_id, doctor_id, scoped_access, status, expires_at, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'active', CURRENT_TIMESTAMP + INTERVAL '1 day' * $4, $5)
         RETURNING id`,
        [patientId, doctorId, scopedAccess, expiresInDays, randomTimestamp(60)]
      );
      createdConsentIds.push(r.rows[0].id);
    }
  }
  console.log(`  ✓ ${patientUserIds.length} patients`);
  console.log(`  ✓ ${patientIds.length * 4} health records`);
  console.log(`  ✓ ${createdConsentIds.length} consents`);

  // --- 500 audit log entries ---
  const allUserIds = [...patientUserIds, ...doctorIds];
  const actions = [
    'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_CHANGED',
    'CONSENT_GRANTED', 'CONSENT_REVOKED', 'CLINICIAN_VIEWED_RECORDS',
    'WIPE_REQUESTED', '2FA_ENABLED', 'ONBOARDING_COMPLETED'
  ];
  for (let i = 0; i < 500; i++) {
    const actorId = allUserIds[Math.floor(Math.random() * allUserIds.length)];
    const action = actions[Math.floor(Math.random() * actions.length)];
    await pool.query(
      `INSERT INTO audit_log (id, actor_id, action, ip_address, user_agent, timestamp)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
      [actorId, action, faker.internet.ip(), faker.internet.userAgent(), randomTimestamp(90)]
    );
  }
  console.log('  ✓ 500 audit log entries');

  // --- 3 data wipe requests ---
  const wipeStatuses: ('pending' | 'approved' | 'rejected')[] = ['pending', 'approved', 'rejected'];
  for (let i = 0; i < 3; i++) {
    const patientId = patientIds[Math.floor(Math.random() * patientIds.length)];
    await pool.query(
      `INSERT INTO data_wipe_requests (id, patient_id, reason, status, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
      [patientId, faker.lorem.sentence(), wipeStatuses[i], randomTimestamp(30)]
    );
  }
  console.log('  ✓ 3 data wipe requests');

  // --- 10 notifications ---
  for (let i = 0; i < 10; i++) {
    const userId = allUserIds[Math.floor(Math.random() * allUserIds.length)];
    const isRead = Math.random() > 0.5;
    await pool.query(
      `INSERT INTO notifications (id, user_id, title, message, is_read, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
      [userId, faker.lorem.sentence(3), faker.lorem.sentence(), isRead, randomTimestamp(30)]
    );
  }
  console.log('  ✓ 10 notifications');

  console.log('\nSynthetic data seeding complete.');
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
