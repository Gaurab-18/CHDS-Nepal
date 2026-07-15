const API_BASE = process.env.API_BASE || 'http://localhost:4000/api/v1';

let cookieJar: string[] = [];

export function getCookies(): string[] {
  return cookieJar;
}

export function clearCookies(): void {
  cookieJar = [];
}

function extractCookies(response: Response): string[] {
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) return [];
  return setCookie.split(',').map(c => c.split(';')[0].trim());
}

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export async function loginAs(email: string, password: string): Promise<{ data: any; status: number }> {
  const res = await fetch(apiUrl('/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (res.ok) {
    cookieJar = extractCookies(res);
  }
  return { data, status: res.status };
}

export async function apiGet(path: string): Promise<Response> {
  return fetch(apiUrl(path), {
    headers: { Cookie: cookieJar.join('; ') },
  });
}

export async function apiPost(path: string, body?: any): Promise<Response> {
  return fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieJar.join('; ') },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function apiPatch(path: string, body?: any): Promise<Response> {
  return fetch(apiUrl(path), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookieJar.join('; ') },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function apiDelete(path: string): Promise<Response> {
  return fetch(apiUrl(path), {
    method: 'DELETE',
    headers: { Cookie: cookieJar.join('; ') },
  });
}
