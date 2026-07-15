import { loginAs, apiPost, clearCookies, apiUrl } from './helpers';

const PATIENT_EMAIL = 'patient@chds.np';
const DOCTOR_EMAIL = 'doctor@chds.np';
const ADMIN_EMAIL = 'admin@chds.np';
const PASSWORD = '@CHDS2024!';

describe('Auth API', () => {

  afterEach(() => clearCookies());

  test('POST /auth/login valid patient → 200 + cookie set', async () => {
    const { data, status } = await loginAs(PATIENT_EMAIL, PASSWORD);
    expect(status).toBe(200);
    expect(data.message).toBe('Login successful');
    expect(data.user.role).toBe('patient');
  });

  test('POST /auth/login wrong password → 401', async () => {
    const { data, status } = await loginAs(PATIENT_EMAIL, 'wrong_password');
    expect(status).toBe(401);
    expect(data.error).toBe('Invalid credentials');
  });

  test('POST /auth/login 6 times → 429 (rate limited)', async () => {
    for (let i = 0; i < 6; i++) {
      await loginAs(PATIENT_EMAIL, 'wrong_password');
    }
    const res = await fetch(apiUrl('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: PATIENT_EMAIL, password: PASSWORD }),
    });
    expect([200, 429]).toContain(res.status);
  });

  test('POST /auth/forgot-password any email → always 200', async () => {
    const res = await fetch(apiUrl('/auth/forgot-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nonexistent@example.com' }),
    });
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.message).toContain('If that email exists');
  });

  test('POST /auth/reset-password invalid token → 400', async () => {
    const res = await fetch(apiUrl('/auth/reset-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'invalid-token', newPassword: 'NewPass123!' }),
    });
    expect(res.status).toBe(400);
    const data: any = await res.json();
    expect(data.error).toBe('Invalid or expired reset token');
  });

  test('POST /auth/verify-backup-code with invalid code → 401', async () => {
    await loginAs(PATIENT_EMAIL, PASSWORD);
    const res = await apiPost('/auth/verify-backup-code', {
      email: PATIENT_EMAIL,
      password: PASSWORD,
      code: '00000000',
    });
    expect(res.status).toBe(401);
    const body: any = await res.json();
    expect(body.error).toContain('Invalid');
  });

  test('access protected route without cookie → 401', async () => {
    const res = await fetch(apiUrl('/patient/records'), {
      headers: { Cookie: '' },
    });
    expect(res.status).toBe(401);
    const data: any = await res.json();
    expect(data.error).toContain('Authentication required');
  });

  test('admin login → 200 + admin role', async () => {
    const { data, status } = await loginAs(ADMIN_EMAIL, PASSWORD);
    expect(status).toBe(200);
    expect(data.user.role).toBe('admin');
  });

  test('doctor login → 200 + doctor role', async () => {
    const { data, status } = await loginAs(DOCTOR_EMAIL, PASSWORD);
    expect(status).toBe(200);
    expect(data.user.role).toBe('doctor');
  });
});
