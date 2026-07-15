/**
 * @jest-environment node
 */

function decodeJWT(token: string): { role?: string; email?: string } | null {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(Buffer.from(payload, 'base64').toString());
  } catch {
    return null;
  }
}

function createToken(payload: Record<string, any>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `${header}.${body}.fake-signature`;
}

describe('JWT decode utility', () => {
  it('decodes a valid JWT payload', () => {
    const token = createToken({ role: 'patient', email: 'test@chds.np' });
    const result = decodeJWT(token);
    expect(result).toEqual({ role: 'patient', email: 'test@chds.np' });
  });

  it('returns null for malformed token', () => {
    expect(decodeJWT('not-a-jwt')).toBeNull();
  });

  it('returns null for empty token', () => {
    expect(decodeJWT('')).toBeNull();
  });

  it('returns null for invalid base64', () => {
    expect(decodeJWT('a.!!!.c')).toBeNull();
  });
});

describe('Role-based route logic', () => {
  const ROLE_ROUTES: Record<string, string> = {
    patient: '/dashboard',
    doctor: '/doctor/search',
    admin: '/admin/users',
  };

  function getRedirectRole(pathname: string, role: string): string | null {
    if (pathname.startsWith('/dashboard') && role !== 'patient') {
      return ROLE_ROUTES[role] || '/login';
    }
    if (pathname.startsWith('/doctor') && role !== 'doctor') {
      return ROLE_ROUTES[role] || '/login';
    }
    if (pathname.startsWith('/admin') && role !== 'admin') {
      return ROLE_ROUTES[role] || '/login';
    }
    return null;
  }

  it('allows patient to access /dashboard', () => {
    expect(getRedirectRole('/dashboard', 'patient')).toBeNull();
  });

  it('redirects doctor trying to access /dashboard', () => {
    expect(getRedirectRole('/dashboard', 'doctor')).toBe('/doctor/search');
  });

  it('redirects admin trying to access /dashboard', () => {
    expect(getRedirectRole('/dashboard', 'admin')).toBe('/admin/users');
  });

  it('allows doctor to access /doctor/search', () => {
    expect(getRedirectRole('/doctor/search', 'doctor')).toBeNull();
  });

  it('redirects patient trying to access /doctor', () => {
    expect(getRedirectRole('/doctor/search', 'patient')).toBe('/dashboard');
  });

  it('allows admin to access /admin/users', () => {
    expect(getRedirectRole('/admin/users', 'admin')).toBeNull();
  });

  it('redirects patient trying to access /admin', () => {
    expect(getRedirectRole('/admin/users', 'patient')).toBe('/dashboard');
  });

  it('redirects unknown role to /login', () => {
    expect(getRedirectRole('/admin/users', 'unknown' as any)).toBe('/login');
  });
});
