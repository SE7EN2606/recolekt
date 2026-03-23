import { assertEnv } from './assertEnv';

let raw =
  import.meta.env.VITE_API_BASE ||      // ✅ check this first — it's what .env.local has
  import.meta.env.VITE_BACKEND_URL ||
  import.meta.env.VITE_API_URL ||
  '';

if (!raw && typeof window !== 'undefined') {
  const hostname = window.location.hostname;

  if (
    import.meta.env.DEV ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1'
  ) {
    raw = 'http://127.0.0.1:5001';
  } else if (hostname.includes('staging')) {
    raw = 'https://recolekt-staging.up.railway.app';
  } else {
    raw = 'https://api.recolekt.app';
  }
}

const normalized = raw.replace(/\/+$/, '');  // ✅ also fixed the broken regex (was \\/+$)

export const APIBASE = normalized;
export const API_BASE = normalized;

export const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '517149606657-1c7alf9nm5ms1n0s20ch2lj0b02h5189.apps.googleusercontent.com';

// ✅ Don't throw on missing VITE_BACKEND_URL — we have fallbacks
if (import.meta.env.DEV) {
  console.log(`[api] API_BASE resolved to: ${normalized}`);
}

export const fetchWithAuth = (
  endpoint: string,
  options: RequestInit = {}
) => {
  const url = endpoint.startsWith('http')
    ? endpoint
    : `${API_BASE}${endpoint}`;

  const token =
    localStorage.getItem('auth_token') ||
    localStorage.getItem('authtoken') ||
    localStorage.getItem('token');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return fetch(url, {
    ...options,
    credentials: 'omit',
    headers,
  });
};

export default APIBASE;
