import { assertEnv } from './assertEnv';

let raw =
  import.meta.env.VITE_BACKEND_URL ??
  import.meta.env.VITE_API_BASE ??
  import.meta.env.VITE_API_URL ??
  '';

// 🛑 THE ULTIMATE OVERRIDE: 
// If the browser is on the staging site, FORCE it to use the staging API.
// This completely ignores whatever Netlify built into the environment.
if (typeof window !== 'undefined' && window.location.hostname.includes('staging')) {
  raw = 'https://recolekt-staging.up.railway.app';
}

assertEnv('VITE_BACKEND_URL', raw);

if (!raw) {
  console.warn('⚠️ API_BASE is empty. Check Netlify env variables.');
}

export const API_BASE = String(raw).replace(/\/+$/, '');