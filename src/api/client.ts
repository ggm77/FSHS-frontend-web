const BASE = '/api/v2';

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getCookie(name: string): string | undefined {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift();
  return undefined;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const xsrfToken = getCookie('XSRF-TOKEN');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (xsrfToken) {
    headers['X-XSRF-TOKEN'] = xsrfToken;
  }

  const res = await fetch(BASE + path, {
    credentials: 'include',
    ...init,
    headers: {
      ...headers,
      ...init.headers,
    },
  });

  if (res.status === 204) return undefined as T;
  if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`);

  const ct = res.headers.get('Content-Type') || '';
  if (ct.includes('application/json')) return res.json() as Promise<T>;
  return undefined as T;
}

export { request, ApiError, BASE, getCookie };

