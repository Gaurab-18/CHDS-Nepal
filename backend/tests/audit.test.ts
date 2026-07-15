import { query } from '../src/db';
import { loginAs, apiGet, apiPost, clearCookies, apiUrl } from './helpers';

const PATIENT_EMAIL = 'patient@chds.np';
const DOCTOR_EMAIL = 'doctor@chds.np';
const PASSWORD = '@CHDS2024!';

describe('Audit Log', () => {

  afterEach(() => clearCookies());

  test('UPDATE on audit_log as app_user fails (append-only)', async () => {
    await expect(
      query("UPDATE audit_log SET action = 'hacked' WHERE action = 'LOGIN_SUCCESS'")
    ).rejects.toThrow();
  });

  test('DELETE on audit_log as app_user fails (append-only)', async () => {
    await expect(
      query("DELETE FROM audit_log WHERE action = 'LOGIN_SUCCESS'")
    ).rejects.toThrow();
  });

  test('every login creates an audit entry', async () => {
    await loginAs(PATIENT_EMAIL, PASSWORD);
    const r = await query(
      "SELECT COUNT(*) as cnt FROM audit_log WHERE action = 'LOGIN_SUCCESS' AND actor_id = (SELECT id FROM users WHERE email = $1)",
      [PATIENT_EMAIL]
    );
    expect(parseInt(r.rows[0].cnt, 10)).toBeGreaterThanOrEqual(1);
  });

  test('failed login creates audit entry', async () => {
    await loginAs(PATIENT_EMAIL, 'wrong_password');
    const r = await query(
      "SELECT COUNT(*) as cnt FROM audit_log WHERE action = 'LOGIN_FAILED' AND actor_id = (SELECT id FROM users WHERE email = $1)",
      [PATIENT_EMAIL]
    );
    expect(parseInt(r.rows[0].cnt, 10)).toBeGreaterThanOrEqual(1);
  });

  test('forgot-password creates audit entry', async () => {
    await fetch(apiUrl('/auth/forgot-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: PATIENT_EMAIL }),
    });
    const r = await query(
      "SELECT COUNT(*) as cnt FROM audit_log WHERE action = 'PASSWORD_RESET_REQUESTED' AND actor_id = (SELECT id FROM users WHERE email = $1)",
      [PATIENT_EMAIL]
    );
    expect(parseInt(r.rows[0].cnt, 10)).toBeGreaterThanOrEqual(1);
  });

  test('emergency override creates audit entry with reason', async () => {
    const { status } = await loginAs(DOCTOR_EMAIL, PASSWORD);
    expect(status).toBe(200);

    const patientsRes = await apiGet('/doctor/patients');
    const patients: any = await patientsRes.json();
    if (patients.length === 0) return;

    const patientId = patients[0].id;
    const overrideRes = await apiPost('/doctor/emergency-override', {
      patient_id: patientId,
      reason: 'Urgent clinical need for patient care and treatment',
    });
    expect(overrideRes.status).toBe(200);
    const overrideData: any = await overrideRes.json();
    expect(overrideData.override_reason).toBeTruthy();

    const r = await query(
      "SELECT override_reason FROM audit_log WHERE action = 'EMERGENCY_OVERRIDE' AND target_id = $1 ORDER BY timestamp DESC LIMIT 1",
      [patientId]
    );
    expect(r.rows.length).toBeGreaterThanOrEqual(1);
    if (r.rows.length > 0) {
      expect(r.rows[0].override_reason).toBeTruthy();
    }
  });
});
