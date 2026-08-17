import { pool } from '../src/db';
import { randomBytes, createHash } from 'crypto';
import { encryptField } from '../src/crypto';
import axios from 'axios';

const BASE_URL = process.env.BASE_URL || 'http://localhost:4000/api/v1';

const HOSPITALS = [
  { name: 'Patan Hospital',  software_type: 'HealthPRO', contact_email: 'admin@patan.np', address: 'Patan, Lalitpur', contact_number: '+977-1-5521234' },
  { name: 'Bir Hospital',    software_type: 'HMN',       contact_email: 'admin@bir.np',   address: 'Kathmandu',     contact_number: '+977-1-4221111' },
  { name: 'Grande Hospital', software_type: 'Custom',    contact_email: 'admin@grande.np', address: 'Pokhara',       contact_number: '+977-61-520000' },
];

async function createHospital(data: typeof HOSPITALS[0], adminToken: string) {
  const res = await axios.post(
    `${BASE_URL}/admin/hospitals`,
    data,
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );
  return { hospital: res.data.hospital, apiKey: res.data.api_key };
}

function buildFHIRBundle(patientId: string, nid: string | null, name: string, dob: string, gender: string) {
  const names = name.split(' ');
  return {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: [
      {
        resource: {
          resourceType: 'Patient',
          id: patientId,
          identifier: nid
            ? [{ system: 'http://chds.np/national-id', type: { text: 'NID' }, value: nid }]
            : [],
          name: [{ family: names.pop(), given: names }],
          birthDate: dob,
          gender,
        }
      },
      {
        resource: {
          resourceType: 'Observation',
          status: 'final',
          code: { text: 'Blood Pressure' },
          subject: { reference: `Patient/${patientId}` },
          valueString: '120/80 mmHg',
          effectiveDateTime: new Date().toISOString(),
        }
      }
    ]
  };
}

async function seed() {
  const adminToken = process.env.ADMIN_TEST_TOKEN;
  if (!adminToken) {
    console.error('Set ADMIN_TEST_TOKEN env var to a valid admin JWT');
    process.exit(1);
  }

  console.log('Creating hospitals...');
  const createdHospitals: Array<{ hospital: any; apiKey: string }> = [];
  for (const h of HOSPITALS) {
    const result = await createHospital(h, adminToken);
    console.log(`  Created: ${result.hospital.name} | Key: [REDACTED]`);

    await axios.patch(
      `${BASE_URL}/admin/hospitals/${result.hospital.id}/status`,
      { status: 'active' },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    console.log(`  Activated: ${result.hospital.name}`);
    createdHospitals.push(result);
  }

  const [patan, bir, grande] = createdHospitals;

  // ── SCENARIO A: NID match → auto-link ─────────────────────
  console.log('\n--- Scenario A: NID match → auto-link ---');
  const encNameA = await encryptField('Demo Patient');
  const encLnameA = await encryptField('NID Match');
  const encDobA = await encryptField('1990-05-15');
  const nidHashA = createHash('sha256').update('NID-DEMO-001').digest('hex');

  await pool.query(
    `INSERT INTO patients
       (encrypted_first_name, encrypted_last_name, encrypted_dob,
        encrypted_national_id, nid_hash, full_name, date_of_birth, gender)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'male')
     ON CONFLICT (nid_hash) DO NOTHING`,
    [
      encNameA, encLnameA, encDobA,
      await encryptField('NID-DEMO-001'), nidHashA,
      'Demo Patient NID Match', '1990-05-15'
    ]
  );

  const bundleA = buildFHIRBundle('PATAN-001', 'NID-DEMO-001', 'Demo Patient', '1990-05-15', 'male');
  const resA = await axios.post(
    `${BASE_URL}/hospital/ingest`,
    bundleA,
    { headers: { 'X-Hospital-API-Key': patan.apiKey, 'Content-Type': 'application/json' } }
  );
  console.log(`  Action: ${resA.data.match_action} | Method: ${resA.data.match_method} | Confidence: ${resA.data.confidence} | Records: ${resA.data.records_inserted}`);

  // ── SCENARIO B: Name + DOB match → pending review ──────────
  console.log('\n--- Scenario B: Name + DOB match → pending review ---');
  const encNameB1 = await encryptField('Sita');
  const encLnameB1 = await encryptField('Sharma');
  const encDobB1 = await encryptField('1985-03-20');
  await pool.query(
    `INSERT INTO patients
       (encrypted_first_name, encrypted_last_name, encrypted_dob,
        full_name, date_of_birth, gender)
     VALUES ($1, $2, $3, $4, $5, 'female')
     ON CONFLICT DO NOTHING`,
    [encNameB1, encLnameB1, encDobB1, 'Sita Sharma', '1985-03-20']
  );

  const bundleB = buildFHIRBundle('BIR-001', null, 'Sita Sharma', '1985-03-20', 'female');
  const resB = await axios.post(
    `${BASE_URL}/hospital/ingest`,
    bundleB,
    { headers: { 'X-Hospital-API-Key': bir.apiKey, 'Content-Type': 'application/json' } }
  );
  console.log(`  Action: ${resB.data.match_action} | Method: ${resB.data.match_method || 'N/A'} | Confidence: ${resB.data.confidence} | Records: ${resB.data.records_inserted}`);

  // ── SCENARIO C: No match → create new patient ──────────────
  console.log('\n--- Scenario C: No match → create new patient ---');
  const bundleC = buildFHIRBundle('GRANDE-001', null, 'Ram Bhandari', '1972-11-08', 'male');
  const resC = await axios.post(
    `${BASE_URL}/hospital/ingest`,
    bundleC,
    { headers: { 'X-Hospital-API-Key': grande.apiKey, 'Content-Type': 'application/json' } }
  );
  console.log(`  Action: ${resC.data.match_action} | Method: ${resC.data.match_method || 'N/A'} | Confidence: ${resC.data.confidence} | Records: ${resC.data.records_inserted}`);

  console.log('\n✓ Seed complete. 3 hospitals registered, 3 scenarios demonstrated.');

  await pool.end();
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
