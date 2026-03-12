import { assertEnv } from './assertEnv';

// 1. Determine the Raw URL base
let raw = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL;

if (!raw) {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    
    if (import.meta.env.DEV || hostname === 'localhost' || hostname === '127.0.0.1') {
      // Force local Python backend if we are running locally
      raw = 'http://127.0.0.1:5001';
    } else if (hostname.includes('staging')) {
      // ✅ FIX: Use the exact same domain we are browsing on to bypass CORS
      raw = 'https://staging.recolekt.app';
    } else {
      // Default to production (Empty string allows relative paths like /api/...)
      raw = '';
    }
  } else {
    raw = '';
  }
}

// 2. Export Constants (Only once!)
export const API_BASE = raw.replace(/\/+$/, '');
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '517149606657-1c7alf9nm5ms1n0s20ch2lj0b02h5189.apps.googleusercontent.com';

// Sanity check
assertEnv('VITE_BACKEND_URL', raw || 'RELATIVE_MODE');

// 3. Authenticated Fetch Wrapper
export const fetchWithAuth = (endpoint: string, options: RequestInit = {}) => {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
  
  const headers: any = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(url, {
    ...options,
    credentials: 'omit', // STRIP COOKIES! We are fully stateless now.
    headers,
  });
};