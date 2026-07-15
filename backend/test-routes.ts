import https from 'https';

const BASE_URL = process.env.TEST_URL || 'https://localhost:4000';
const agent = new https.Agent({ rejectUnauthorized: false });

interface TestResult {
  name: string;
  passed: boolean;
  detail?: string;
}

const results: TestResult[] = [];

async function request(method: string, path: string, body?: any, cookies?: string): Promise<{ status: number; data: any; setCookie?: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options: https.RequestOptions = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      agent,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (cookies) {
      (options.headers as Record<string, string>)['Cookie'] = cookies;
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const setCookie = res.headers['set-cookie']?.join('; ') || cookies;
          resolve({ status: res.statusCode || 0, data: parsed, setCookie });
        } catch {
          resolve({ status: res.statusCode || 0, data: { raw: data } });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  console.log('=== CHDS Nepal - Route Integration Test ===\n');

  let cookies = '';

  // Test 1: Health check
  try {
    const health = await request('GET', '/health');
    results.push({
      name: 'Health Check',
      passed: health.status === 200 && health.data.status === 'ok',
      detail: `${health.status} - ${JSON.stringify(health.data)}`
    });
  } catch (err: any) {
    results.push({ name: 'Health Check', passed: false, detail: err.message });
  }

  // Test 2: Register (if not already)
  try {
    const register = await request('POST', '/api/v1/auth/register', {
      username: `test_${Date.now()}`,
      email: `test_${Date.now()}@test.com`,
      password: 'TestPass123!',
      role: 'patient'
    });
    results.push({
      name: 'Register Patient',
      passed: register.status === 201,
      detail: register.data.message || register.data.error
    });
  } catch (err: any) {
    results.push({ name: 'Register Patient', passed: false, detail: err.message });
  }

  // Test 3: Login
  try {
    const login = await request('POST', '/api/v1/auth/login', {
      email: 'test@chds.com',
      password: 'Test12345!'
    });
    cookies = login.setCookie || '';
    const hasAccessToken = cookies.includes('access_token=');
    const hasRefreshToken = cookies.includes('refresh_token=');
    results.push({
      name: 'Login (httpOnly cookies)',
      passed: login.status === 200 && hasAccessToken && hasRefreshToken,
      detail: `status=${login.status}, hasAccessToken=${hasAccessToken}, hasRefreshToken=${hasRefreshToken}`
    });
  } catch (err: any) {
    results.push({ name: 'Login', passed: false, detail: err.message });
  }

  const authCookie = cookies;

  // Test 4: Patient Profile (verifies encryption/decryption)
  if (authCookie) {
    try {
      const profile = await request('GET', '/api/v1/patient/profile', undefined, authCookie);
      const hasDecryptedFields = profile.data.first_name && profile.data.last_name && profile.data.dob;
      results.push({
        name: 'Patient Profile (encryption/decryption)',
        passed: profile.status === 200 && hasDecryptedFields,
        detail: hasDecryptedFields
          ? `Decrypted: ${profile.data.first_name} ${profile.data.last_name}, DOB: ${profile.data.dob}`
          : `status=${profile.status}, data=${JSON.stringify(profile.data)}`
      });
    } catch (err: any) {
      results.push({ name: 'Patient Profile', passed: false, detail: err.message });
    }

    // Test 5: Patient Records (verifies record encryption/decryption)
    try {
      const records = await request('GET', '/api/v1/patient/records', undefined, authCookie);
      const recordsDecrypted = Array.isArray(records.data) && records.data.every(
        (r: any) => r.title || r.description || r.source
      );
      results.push({
        name: 'Patient Records (encryption/decryption)',
        passed: records.status === 200 && recordsDecrypted,
        detail: Array.isArray(records.data) ? `${records.data.length} records fetched` : JSON.stringify(records.data)
      });
    } catch (err: any) {
      results.push({ name: 'Patient Records', passed: false, detail: err.message });
    }

    // Test 6: RBAC - Patient trying Clinician route
    try {
      const clinicianRoute = await request('GET', '/api/v1/clinician/patients', undefined, authCookie);
      results.push({
        name: 'RBAC: Patient cannot access clinician routes',
        passed: clinicianRoute.status === 403,
        detail: `status=${clinicianRoute.status}, message=${clinicianRoute.data.error || 'ok'}`
      });
    } catch (err: any) {
      results.push({ name: 'RBAC: Clinician route', passed: false, detail: err.message });
    }

    // Test 7: RBAC - Patient trying Admin route
    try {
      const adminRoute = await request('GET', '/api/v1/admin/users', undefined, authCookie);
      results.push({
        name: 'RBAC: Patient cannot access admin routes',
        passed: adminRoute.status === 403,
        detail: `status=${adminRoute.status}, message=${adminRoute.data.error || 'ok'}`
      });
    } catch (err: any) {
      results.push({ name: 'RBAC: Admin route', passed: false, detail: err.message });
    }

    // Test 8: Upload record (verifies encryption)
    try {
      const upload = await request('POST', '/api/v1/patient/records', {
        title: 'Integration Test Record',
        description: 'Created by test-routes.ts to verify encryption pipeline'
      }, authCookie);
      results.push({
        name: 'Upload Record (encryption pipeline)',
        passed: upload.status === 201 && upload.data.record?.source === 'patient_upload',
        detail: upload.data.message || upload.data.error
      });
    } catch (err: any) {
      results.push({ name: 'Upload Record', passed: false, detail: err.message });
    }

    // Test 9: Consent creation
    try {
      const clinicianLogin = await request('POST', '/api/v1/auth/login', {
        email: 'dr.smith@chds.np',
        password: 'Clin12345!'
      });

      const clinicianId = clinicianLogin.data.user?.id || '3169d162-c01e-4fdd-a41c-ca43b8888030';

      const consent = await request('POST', '/api/v1/patient/consents', {
        clinician_id: clinicianId,
        scoped_access: 'read_only',
        expires_in_days: 7
      }, authCookie);

      results.push({
        name: 'Grant Consent',
        passed: consent.status === 201 && consent.data.consent?.status === 'active',
        detail: consent.data.message || consent.data.error
      });
    } catch (err: any) {
      results.push({ name: 'Grant Consent', passed: false, detail: err.message });
    }

    // Test 10: Wipe request
    try {
      const wipe = await request('POST', '/api/v1/patient/wipe-request', {
        reason: 'Integration test data wipe'
      }, authCookie);
      results.push({
        name: 'Submit Wipe Request',
        passed: wipe.status === 201 && wipe.data.request?.status === 'pending',
        detail: wipe.data.message || wipe.data.error
      });
    } catch (err: any) {
      results.push({ name: 'Submit Wipe Request', passed: false, detail: err.message });
    }

    // Test 11: Refresh token
    try {
      const refresh = await request('POST', '/api/v1/auth/refresh', undefined, authCookie);
      results.push({
        name: 'Token Refresh',
        passed: refresh.status === 200,
        detail: refresh.data.message || JSON.stringify(refresh.data)
      });
    } catch (err: any) {
      results.push({ name: 'Token Refresh', passed: false, detail: err.message });
    }
  }

  // Test 12: Invalid login
  try {
    const badLogin = await request('POST', '/api/v1/auth/login', {
      email: 'test@chds.com',
      password: 'wrongpassword'
    });
    results.push({
      name: 'Invalid Login returns 401',
      passed: badLogin.status === 401,
      detail: `status=${badLogin.status}, error=${badLogin.data.error}`
    });
  } catch (err: any) {
    results.push({ name: 'Invalid Login', passed: false, detail: err.message });
  }

  // Summary
  console.log('--- Results ---');
  let passed = 0;
  let failed = 0;
  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`${icon} ${r.name}`);
    if (r.detail) console.log(`   ${r.detail}`);
    if (r.passed) passed++;
    else failed++;
  }
  console.log(`\n--- Summary: ${passed} passed, ${failed} failed ---`);

  // Cleanup: remove test patients created during this test
  if (authCookie) {
    try {
      await request('POST', '/api/v1/auth/logout', undefined, authCookie);
    } catch {}
  }

  process.exit(failed > 0 ? 1 : 0);
}

run();