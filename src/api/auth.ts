const BASE = '/api/v2';

export async function login(username: string, password: string): Promise<void> {
  const body = new URLSearchParams({ username, password });
  const res = await fetch(BASE + '/auth/login', {
    method: 'POST',
    credentials: 'include',
    body,
  });
  if (!res.ok) throw new Error('로그인 실패');
}

export async function logout(): Promise<void> {
  await fetch(BASE + '/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });
}
