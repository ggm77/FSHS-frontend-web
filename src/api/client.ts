const BASE = '/api/v2';

export interface BackendErrorResponse {
  timestamp?: string;
  httpStatus?: string;
  code?: string;
  message?: string;
}

class ApiError extends Error {
  status: number;
  code?: string;
  response?: BackendErrorResponse;

  constructor(status: number, message: string, code?: string, response?: BackendErrorResponse) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.response = response;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseBackendErrorResponse(bodyText: string): BackendErrorResponse | null {
  if (!bodyText.trim()) return null;

  try {
    const parsed: unknown = JSON.parse(bodyText);
    if (!isRecord(parsed)) return null;

    const response: BackendErrorResponse = {};
    if (typeof parsed.timestamp === 'string') response.timestamp = parsed.timestamp;
    if (typeof parsed.httpStatus === 'string') response.httpStatus = parsed.httpStatus;
    if (typeof parsed.code === 'string') response.code = parsed.code;
    if (typeof parsed.message === 'string') response.message = parsed.message;

    return Object.keys(response).length > 0 ? response : null;
  } catch {
    return null;
  }
}

function createApiErrorFromBody(
  status: number,
  bodyText: string,
  fallbackMessage = `HTTP ${status}`,
): ApiError {
  const response = parseBackendErrorResponse(bodyText);
  return new ApiError(
    status,
    response?.message || bodyText.trim() || fallbackMessage,
    response?.code,
    response || undefined,
  );
}

async function createApiErrorFromResponse(
  res: Response,
  fallbackMessage = `HTTP ${res.status}`,
): Promise<ApiError> {
  const bodyText = await res.text().catch(() => '');
  return createApiErrorFromBody(res.status, bodyText, fallbackMessage);
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
  if (!res.ok) throw await createApiErrorFromResponse(res);

  const ct = res.headers.get('Content-Type') || '';
  if (ct.includes('application/json')) return res.json() as Promise<T>;
  return undefined as T;
}

export { request, ApiError, BASE, getCookie, createApiErrorFromBody, createApiErrorFromResponse };
