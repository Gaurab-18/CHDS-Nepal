import { loginAs, apiGet, apiPost, clearCookies } from './helpers';

const PASSWORD = '@CHDS2026!';

interface RouteTest {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  role: 'patient' | 'doctor' | 'admin';
  expectedStatus: number;
  body?: any;
}

const routes: RouteTest[] = [
  { method: 'GET', path: '/patient/profile', role: 'patient', expectedStatus: 200 },
  { method: 'GET', path: '/patient/profile', role: 'doctor', expectedStatus: 403 },
  { method: 'GET', path: '/patient/profile', role: 'admin', expectedStatus: 403 },
  { method: 'GET', path: '/patient/records', role: 'patient', expectedStatus: 200 },
  { method: 'GET', path: '/patient/records', role: 'doctor', expectedStatus: 403 },
  { method: 'GET', path: '/patient/records', role: 'admin', expectedStatus: 403 },
  { method: 'POST', path: '/patient/records', role: 'patient', expectedStatus: 400, body: {} },
  { method: 'POST', path: '/patient/records', role: 'doctor', expectedStatus: 403 },
  { method: 'POST', path: '/patient/records', role: 'admin', expectedStatus: 403 },
  { method: 'GET', path: '/patient/consents', role: 'patient', expectedStatus: 200 },
  { method: 'GET', path: '/patient/consents', role: 'doctor', expectedStatus: 403 },
  { method: 'POST', path: '/patient/consents', role: 'patient', expectedStatus: 400, body: {} },
  { method: 'POST', path: '/patient/consents', role: 'doctor', expectedStatus: 403 },
  { method: 'GET', path: '/patient/audit-log', role: 'patient', expectedStatus: 200 },
  { method: 'GET', path: '/patient/audit-log', role: 'doctor', expectedStatus: 403 },
  { method: 'GET', path: '/patient/audit-qr', role: 'patient', expectedStatus: 200 },
  { method: 'GET', path: '/patient/audit-qr', role: 'doctor', expectedStatus: 403 },
  { method: 'GET', path: '/doctor/patients', role: 'doctor', expectedStatus: 200 },
  { method: 'GET', path: '/doctor/patients', role: 'patient', expectedStatus: 403 },
  { method: 'GET', path: '/doctor/patients', role: 'admin', expectedStatus: 403 },
  { method: 'POST', path: '/doctor/emergency-override', role: 'doctor', expectedStatus: 400, body: {} },
  { method: 'POST', path: '/doctor/emergency-override', role: 'patient', expectedStatus: 403 },
  { method: 'GET', path: '/admin/users', role: 'admin', expectedStatus: 200 },
  { method: 'GET', path: '/admin/users', role: 'patient', expectedStatus: 403 },
  { method: 'GET', path: '/admin/users', role: 'doctor', expectedStatus: 403 },
  { method: 'GET', path: '/admin/notifications', role: 'admin', expectedStatus: 200 },
  { method: 'GET', path: '/admin/notifications', role: 'patient', expectedStatus: 403 },
  { method: 'GET', path: '/admin/audit-log', role: 'admin', expectedStatus: 200 },
  { method: 'GET', path: '/admin/audit-log', role: 'patient', expectedStatus: 403 },
  { method: 'GET', path: '/admin/wipe-requests', role: 'admin', expectedStatus: 200 },
  { method: 'GET', path: '/admin/wipe-requests', role: 'patient', expectedStatus: 403 },
  { method: 'GET', path: '/auth/security-score', role: 'patient', expectedStatus: 200 },
  { method: 'GET', path: '/auth/security-score', role: 'doctor', expectedStatus: 200 },
  { method: 'GET', path: '/auth/security-score', role: 'admin', expectedStatus: 200 },
];

const roleCredentials: Record<string, string> = {
  patient: 'patient@chds.np',
  doctor: 'doctor@chds.np',
  admin: 'admin@chds.np',
};

describe('RBAC Matrix', () => {
  routes.forEach((route) => {
    const testName = `${route.method} ${route.path} as ${route.role} → ${route.expectedStatus}`;
    it(testName, async () => {
      clearCookies();
      const email = roleCredentials[route.role];
      const { status: loginStatus } = await loginAs(email, PASSWORD);
      expect(loginStatus).toBe(200);

      let res: Response;
      switch (route.method) {
        case 'GET':
          res = await apiGet(route.path);
          break;
        case 'POST':
          res = await apiPost(route.path, route.body || {});
          break;
        default:
          throw new Error(`Unsupported method ${route.method}`);
      }

      expect(res.status).toBe(route.expectedStatus);
    });
  });
});
