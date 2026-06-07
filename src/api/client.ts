const BASE = '/api/v2';

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  if (res.status === 204) return undefined as T;
  if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`);

  const ct = res.headers.get('Content-Type') || '';
  if (ct.includes('application/json')) return res.json() as Promise<T>;
  return undefined as T;
}

export { request, ApiError, BASE };
