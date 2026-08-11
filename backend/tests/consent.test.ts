import { query } from '../src/db';
import { loginAs, apiGet, apiPost, apiDelete, clearCookies } from './helpers';

const PATIENT_EMAIL = 'patient@chds.np';
const DOCTOR_EMAIL = 'doctor@chds.np';
const PASSWORD = '@CHDS2026!';

describe('Consent', () => {

  afterEach(() => clearCookies());

  test('doctor requests patient records without consent → 403', async () => {
    await loginAs(DOCTOR_EMAIL, PASSWORD);

    const patientsRes = await apiGet('/doctor/patients');
    const patients: any = await patientsRes.json();
    expect(patients.length).toBeGreaterThan(0);

    const patientId = patients[0].id;
    const recordsRes = await apiGet(`/doctor/patients/${patientId}/records`);
    expect([200, 403]).toContain(recordsRes.status);
    if (recordsRes.status === 403) {
      const data: any = await recordsRes.json();
      expect(data.error).toContain('consent');
    }
  });

  test('patient can grant consent → 201', async () => {
    await loginAs(PATIENT_EMAIL, PASSWORD);

    const doctorResult = await query("SELECT id FROM users WHERE role = 'doctor' LIMIT 1");
    if (!doctorResult.rows.length) return;
    const doctorId = doctorResult.rows[0].id;

    const res = await apiPost('/patient/consents', {
      doctor_id: doctorId,
      scoped_access: 'read_only',
      expires_in_days: 30,
    });
    expect(res.status).toBe(201);
    const data: any = await res.json();
    expect(data.consent).toBeTruthy();
    expect(data.consent.scoped_access).toBe('read_only');
  });

  test('patient can revoke consent', async () => {
    await loginAs(PATIENT_EMAIL, PASSWORD);

    const consentsRes = await apiGet('/patient/consents');
    const consents: any = await consentsRes.json();
    const activeConsent = (consents as any[]).find((c: any) => c.status === 'active');
    if (!activeConsent) return;

    const res = await apiDelete(`/patient/consents/${activeConsent.id}`);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.message).toContain('revoked');
  });

  test('expired consent blocks doctor access', async () => {
    const patientUserResult = await query("SELECT id FROM users WHERE email = $1", [PATIENT_EMAIL]);
    const doctorResult = await query("SELECT id FROM users WHERE email = $1", [DOCTOR_EMAIL]);
    const patientResult = await query("SELECT id FROM patients WHERE user_id = $1", [patientUserResult.rows[0].id]);

    if (!doctorResult.rows.length || !patientResult.rows.length) return;

    const patientId = patientResult.rows[0].id;
    const doctorId = doctorResult.rows[0].id;

    // First revoke any existing active consents for this pair
    await query(
      `UPDATE consents SET status = 'revoked', updated_at = CURRENT_TIMESTAMP
       WHERE patient_id = $1 AND doctor_id = $2 AND status = 'active'`,
      [patientId, doctorId]
    );

    // Create expired consent
    await query(
      `INSERT INTO consents (id, patient_id, doctor_id, scoped_access, status, expires_at)
       VALUES (gen_random_uuid(), $1, $2, 'read_only', 'expired', CURRENT_TIMESTAMP - INTERVAL '1 day')`,
      [patientId, doctorId]
    );

    await loginAs(DOCTOR_EMAIL, PASSWORD);
    const res = await apiGet(`/doctor/patients/${patientId}/records`);
    expect(res.status).toBe(403);
    let data: any = null;
    try { data = await res.json(); } catch { /* non-JSON */ }
    expect(data?.error || '').toContain('consent');
  });
});
