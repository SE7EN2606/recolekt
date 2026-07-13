import { API_BASE } from '../utils/api';
import { recordPerfApiCall } from './perf';

export { isPerfModeEnabled } from './perf';

type ApiRequestOptions = {
  body?: unknown;
  cache?: RequestCache;
  signal?: AbortSignal;
};

type ApiErrorOptions = {
  status: number;
  code?: string;
  method: string;
  path: string;
  message: string;
};

export class ApiError extends Error {
  status: number;
  code?: string;
  method: string;
  path: string;
  isApiError = true;

  constructor({ status, code, method, path, message }: ApiErrorOptions) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.method = method;
    this.path = path;
  }
}

const inflightGetRequests = new Map<string, Promise<any>>();

const sanitizeApiCode = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || !/^[a-zA-Z0-9_.:-]{1,80}$/.test(trimmed)) return undefined;
  return trimmed;
};

const safeHttpErrorMessage = (status: number): string => {
  if (status === 401) return 'Authentication is required.';
  if (status === 403) return 'You do not have access to this item.';
  if (status === 404 || status === 410) return 'This item is no longer available.';
  if (status >= 500) return 'Recolekt could not complete the request. Please try again.';
  return `Request failed with status ${status}.`;
};

function apiUrl(path: string) {
  const clean = String(path || '').replace(/^\/+/, '');
  const base = String(API_BASE || '').replace(/\/+$/, '');

  if (!base) return `/${clean}`;
  if (base.endsWith('/api') && clean.startsWith('api/')) {
    return `${base}/${clean.slice(4)}`;
  }

  return `${base}/${clean}`;
}

export function getAuthToken(): string {
  try {
    const direct =
      (window as any).__REKOLEKT_TOKEN__ ||
      localStorage.getItem('auth_token') ||
      localStorage.getItem('token') ||
      localStorage.getItem('access_token') ||
      localStorage.getItem('jwt') ||
      localStorage.getItem('recolekt_token') ||
      '';

    if (direct) {
      return String(direct).replace(/^Bearer\s+/i, '').trim();
    }

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      const value = localStorage.getItem(key);
      if (!value) continue;
      const lowerKey = key.toLowerCase();
      const looksRelevant =
        lowerKey.includes('token') ||
        lowerKey.includes('jwt') ||
        lowerKey.includes('auth');
      const looksLikeJwt = value.split('.').length === 3;
      if (looksRelevant && looksLikeJwt) {
        return value.replace(/^Bearer\s+/i, '').trim();
      }
    }

    return '';
  } catch {
    return '';
  }
}

function buildAuthHeaders(hasBody: boolean): Record<string, string> {
  const token = getAuthToken();

  return {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const hasBody = options.body !== undefined;
  const resolvedUrl = apiUrl(path);
  const requestKey = method === 'GET' && !hasBody ? `${method}:${resolvedUrl}` : null;

  if (requestKey && inflightGetRequests.has(requestKey)) {
    return inflightGetRequests.get(requestKey) as Promise<T>;
  }

  const requestPromise = (async () => {
    const startedPerfMs = performance.now();
    let res: Response | null = null;

    try {
      res = await fetch(resolvedUrl, {
        method,
        headers: buildAuthHeaders(hasBody),
        credentials: 'include',
        ...(options.cache ? { cache: options.cache } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
        ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        recordPerfApiCall({
          method,
          path,
          status: res.status,
          durationMs: performance.now() - startedPerfMs,
          failed: true,
          startedPerfMs,
        });
        throw new ApiError({
          status: res.status,
          code: sanitizeApiCode(data?.code || data?.error_code || data?.errorCode),
          method,
          path,
          message: safeHttpErrorMessage(res.status),
        });
      }

      recordPerfApiCall({
        method,
        path,
        status: res.status,
        durationMs: performance.now() - startedPerfMs,
        failed: false,
        startedPerfMs,
      });

      return data as T;
    } catch (error) {
      if (!res) {
        recordPerfApiCall({
          method,
          path,
          status: 0,
          durationMs: performance.now() - startedPerfMs,
          failed: true,
          startedPerfMs,
        });
      }
      throw error;
    } finally {
      if (requestKey) {
        inflightGetRequests.delete(requestKey);
      }
    }
  })();

  if (requestKey) {
    inflightGetRequests.set(requestKey, requestPromise);
  }

  return requestPromise;
}

export function apiGet<T>(path: string, options: Omit<ApiRequestOptions, 'body'> = {}): Promise<T> {
  return apiRequest<T>('GET', path, { cache: 'no-store', ...options });
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>('POST', path, body === undefined ? {} : { body });
}

export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>('PUT', path, body === undefined ? {} : { body });
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>('PATCH', path, body === undefined ? {} : { body });
}

export function apiDelete<T>(path: string): Promise<T> {
  return apiRequest<T>('DELETE', path);
}
