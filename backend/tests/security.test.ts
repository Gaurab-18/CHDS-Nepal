import { query } from '../src/db';
import { loginAs, apiGet, apiPost, clearCookies, apiUrl } from './helpers';

const PATIENT_EMAIL = 'patient@chds.np';
const DOCTOR_EMAIL = 'doctor@chds.np';
const PASSWORD = '@CHDS2026!';

describe('Security', () => {

  afterEach(() => clearCookies());

  test('security score returns correct breakdown', async () => {
    await loginAs(PATIENT_EMAIL, PASSWORD);
    const res = await apiGet('/auth/security-score');
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data).toHaveProperty('score');
    expect(data).toHaveProperty('label');
    expect(data).toHaveProperty('breakdown');
    expect(data.breakdown).toHaveProperty('twoFactor');
    expect(data.breakdown).toHaveProperty('recentLogin');
    expect(data.breakdown).toHaveProperty('noFailedLogins');
    expect(data.breakdown).toHaveProperty('recentConsentReview');
    expect(data.score).toBeGreaterThanOrEqual(0);
    expect(data.score).toBeLessThanOrEqual(100);
    expect(['Strong', 'Good', 'Needs attention']).toContain(data.label);
  });

  test('QR token generates valid JWT', async () => {
    await loginAs(PATIENT_EMAIL, PASSWORD);
    const res = await apiGet('/patient/audit-qr');
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data).toHaveProperty('qrCode');
    expect(data).toHaveProperty('url');
    expect(data.url).toContain('/api/v1/public/audit-log?token=');
    expect(data.expiresIn).toBe('24h');
  });

  test('public verify route returns receipt without auth', async () => {
    await loginAs(PATIENT_EMAIL, PASSWORD);
    const qrRes = await apiGet('/patient/audit-qr');
    const qrData: any = await qrRes.json();
    const token = new URL(qrData.url).searchParams.get('token');

    clearCookies();

    const publicRes = await fetch(`${apiUrl('/public/audit-log')}?token=${token}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.headers.get('content-type')).toContain('text/html');
    const html = await publicRes.text();
    expect(html).toContain('CHDS Audit Receipt');
  });

  test('expired QR token → 401', async () => {
    const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItaWQiLCJzY29wZSI6ImF1ZGl0X3ZpZXciLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTUxNjIzOTAyMn0.fake-signature';
    const publicRes = await fetch(`${apiUrl('/public/audit-log')}?token=${expiredToken}`);
    expect(publicRes.status).toBe(401);
  });

  test('override reason < 20 chars → 400', async () => {
    await loginAs(DOCTOR_EMAIL, PASSWORD);
    const res = await apiPost('/doctor/emergency-override', {
      patient_id: '00000000-0000-0000-0000-000000000000',
      reason: 'short',
    });
    expect(res.status).toBe(400);
    const data: any = await res.json();
    expect(data.error).toContain('20');
  });

  test('override reason >= 20 chars with valid patient → 200', async () => {
    const patientResult = await query('SELECT id FROM patients LIMIT 1');
    if (!patientResult.rows.length) return;
    const patientId = patientResult.rows[0].id;

    await loginAs(DOCTOR_EMAIL, PASSWORD);
    const res = await apiPost('/doctor/emergency-override', {
      patient_id: patientId,
      reason: 'Urgent clinical intervention required for patient safety',
    });
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.override_reason).toBeTruthy();
    expect(data.records).toBeDefined();
  });
});
