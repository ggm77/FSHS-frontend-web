import { BASE, createApiErrorFromResponse, getCookie } from './client';

export async function login(username: string, password: string, rememberMe = false): Promise<void> {
  const body = new URLSearchParams({ username, password });
  if (rememberMe) body.set('remember-me', 'true');
  const xsrfToken = getCookie('XSRF-TOKEN');
  const headers: Record<string, string> = {};
  if (xsrfToken) {
    headers['X-XSRF-TOKEN'] = xsrfToken;
  }
  const res = await fetch(BASE + '/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers,
    body,
  });
  if (!res.ok) throw await createApiErrorFromResponse(res, '로그인 실패');
}

export async function logout(): Promise<void> {
  const xsrfToken = getCookie('XSRF-TOKEN');
  const headers: Record<string, string> = {};
  if (xsrfToken) {
    headers['X-XSRF-TOKEN'] = xsrfToken;
  }
  await fetch(BASE + '/auth/logout', {
    method: 'POST',
    credentials: 'include',
    headers,
  });
}
