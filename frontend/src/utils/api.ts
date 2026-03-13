import { assertEnv } from './assertEnv';

// Resolve API base once.
// Priority:
// 1) Explicit env vars
// 2) Local dev fallback to Flask on :5001
// 3) Production fallback to relative paths on current origin
let raw =
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
  } else {
    // Use same-origin in deployed environments:
    // /api/... stays on whatever domain the user is currently visiting
    raw = '';
  }
}

const normalized = raw.replace(/\/+$/, '');

export const APIBASE = normalized;
export const API_BASE = normalized;

export const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '517149606657-1c7alf9nm5ms1n0s20ch2lj0b02h5189.apps.googleusercontent.com';

assertEnv('VITE_BACKEND_URL', raw || 'RELATIVE_MODE');

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
