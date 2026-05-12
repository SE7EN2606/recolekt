import { apiUrl } from '../utils/videoDetailUtils';

type ApiRequestOptions = {
  body?: unknown;
  cache?: RequestCache;
};

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
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const hasBody = options.body !== undefined;
  const res = await fetch(apiUrl(path), {
    method,
    headers: buildAuthHeaders(hasBody),
    credentials: 'include',
    ...(options.cache ? { cache: options.cache } : {}),
    ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }

  return data as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>('GET', path, { cache: 'no-store' });
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>('POST', path, body === undefined ? {} : { body });
}

export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>('PUT', path, body === undefined ? {} : { body });
}
