// frontend/src/utils/api.ts
import { assertEnv } from './assertEnv';

const raw = import.meta.env.VITE_BACKEND_URL || 'https://api.recolekt.app';
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