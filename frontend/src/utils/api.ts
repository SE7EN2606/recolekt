import { assertEnv } from './assertEnv';

const raw =
  import.meta.env.VITE_BACKEND_URL ??
  import.meta.env.VITE_API_BASE ??
  import.meta.env.VITE_API_URL ??
  '';

assertEnv('VITE_BACKEND_URL', raw);

if (!raw) {
  console.warn('⚠️ API_BASE is empty. Check Netlify env variables.');
}

export const API_BASE = String(raw).replace(/\/+$/, '');