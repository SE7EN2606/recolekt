import { assertEnv } from './assertEnv';

// 1. Try to get the environment variable (check both names just in case!)
let raw = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL;

// 2. Smart Fallback: If no env var is found, check the URL
if (!raw) {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    
    if (hostname.includes('staging')) {
      // ✅ FIX: Use the exact same staging domain to completely bypass CORS
      raw = 'https://staging.recolekt.app';
    } else if (hostname === 'localhost' || hostname === '127.0.0.1') {
      // Force local Python backend if we are running the frontend locally!
      raw = 'http://127.0.0.1:5001';
    } else {
      // Default to production
      raw = 'https://api.recolekt.app';
    }
  } else {
    raw = 'https://api.recolekt.app';
  }
}

// Disable assertEnv for local dev if it's strict, or pass the resolved 'raw'
assertEnv('VITE_BACKEND_URL', raw);

export const API_BASE = raw.replace(/\/+$/, '');
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '517149606657-1c7alf9nm5ms1n0s20ch2lj0b02h5189.apps.googleusercontent.com';

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