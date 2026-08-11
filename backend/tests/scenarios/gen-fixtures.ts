// Generates synthetic FHIR fixture bundles for every hospital-matching
// scenario. Run: npx ts-node --project tsconfig.test.json tests/scenarios/gen-fixtures.ts
import * as fs from 'fs';
import * as path from 'path';

const OUT = path.resolve(__dirname, '../fixtures/fhir');

// Nepal NIDs must be exactly 16 digits. Each person gets a UNIQUE NID.
const NID_SURAJ = '1000111122223333'; // Suraj Lama (S1)
const NID_RAJ  = '1000555566667777';  // Raj Khatri (S3A)
const NID_RAJ2 = '1000888899990000';  // DIFFERENT NID, same leaked identity (S3B)

function makePatient(over: any = {}): any {
  return {
    resourceType: 'Patient',
    id: 'P-XYZ',
    identifier: [],
    name: [{ family: over.family || 'Test', given: [over.given || 'Scenario'] }],
    birthDate: over.birthDate || '1990-01-01',
    gender: over.gender || 'other',
    ...over,
  };
}

function withNid(resource: any, value: string) {
  resource.identifier.push({ system: 'http://chds.np/national-id', type: { text: 'NID' }, value });
  return resource;
}

function makeBundle(resources: any[]): any {
  return { resourceType: 'Bundle', type: 'transaction', entry: resources.map(r => ({ resource: r })) };
}

function observation(_id: string, subjectId: string, display: string, value: string): any {
  return {
    resourceType: 'Observation',
    status: 'final',
    code: { coding: [{ system: 'http://loinc.org', code: 'X', display }] },
    subject: { reference: `Patient/${subjectId}` },
    valueString: value,
    effectiveDateTime: new Date().toISOString(),
  };
}

function write(name: string, data: any) {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 2));
  console.log('wrote', name);
}

fs.mkdirSync(OUT, { recursive: true });

// ── SCENARIO 1: Same NID pushed by two hospitals → ONE patient ──
{
  const p1 = makePatient({ id: 'PATAN-NID1', given: 'Suraj', family: 'Lama', birthDate: '1990-05-15', gender: 'male' });
  withNid(p1, NID_SURAJ);
  write('s1-patan-surj-lama.json', makeBundle([p1, observation('BP', p1.id, 'Blood Pressure', '120/80')]));

  const p2 = makePatient({ id: 'BIR-NID1', given: 'Suraj', family: 'Lama', birthDate: '1990-05-15', gender: 'male' });
  withNid(p2, NID_SURAJ);
  write('s1-bir-surj-lama.json', makeBundle([p2, observation('FBG', p2.id, 'Fasting Blood Glucose', '95')]));
}

// ── SCENARIO 2: No NID, identical demos → pending_review, bundle HELD ──
{
  const p1 = makePatient({ id: 'S2-HOSPA', given: 'Sita', family: 'Sharma', birthDate: '1985-03-20', gender: 'female' });
  write('s2-hospital-A.json', makeBundle([p1, observation('H1', p1.id, 'HbA1c', '6.5')]));

  const p2 = makePatient({ id: 'S2-HOSPB', given: 'Sita', family: 'Sharma', birthDate: '1985-03-20', gender: 'female' });
  write('s2-hospital-B.json', makeBundle([p2, observation('H2', p2.id, 'HbA1c', '6.2')]));
}

// ── SCENARIO 3: Same name/DOB/gender, DIFFERENT NID → conflict, never merge ──
{
  const p = makePatient({ id: 'S3-A', given: 'Raj', family: 'Khatri', birthDate: '1975-07-21', gender: 'male' });
  withNid(p, NID_RAJ);
  write('s3-hospital-A.json', makeBundle([p, observation('C1', p.id, 'Total Cholest', '210')]));

  const p2 = makePatient({ id: 'S3-B', given: 'Raj', family: 'Khatri', birthDate: '1975-07-21', gender: 'male' });
  withNid(p2, NID_RAJ2);
  write('s3-hospital-B-diff-nid.json', makeBundle([p2, observation('C2', p2.id, 'LDL', '160')]));
}

// ── SCENARIO 6: patient already on file gets a push → auto-link via NID ──
{
  const p = makePatient({ id: 'S6-PUSH', given: 'Bina', family: 'Gurung', birthDate: '1992-11-02', gender: 'female', telecom: 'bina.gurung@test.np' });
  withNid(p, '2110202020202020');
  write('s6-hospital-push.json', makeBundle([p, observation('V1', p.id, 'Vitamin D', '25')]));
}

console.log('Done. Fixtures in', OUT);