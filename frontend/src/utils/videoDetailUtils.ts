// src/utils/videoDetailUtils.ts
// Helpers extracted from VideoDetail.tsx to keep it under 700 lines

import { API_BASE } from '../utils/api';
import { getAuthHeaders } from '../context/AuthContext';

export const fmt = (val: number | string | undefined): string => {
  if (!val) return '0:00';
  if (typeof val === 'string') {
    if (val.includes(':')) return val;
    const n = parseInt(val, 10);
    if (isNaN(n)) return '0:00';
    val = n;
  }
  const m = Math.floor((val as number) / 60);
  const s = Math.floor((val as number) % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const apiUrl = (p: string) => {
  const clean = String(p || '').replace(/^\/+/, '');
  return API_BASE ? `${API_BASE}/${clean}` : `/${clean}`;
};

export const fetchGcsJson = async (url: string): Promise<any> => {
  if (!url) return null;
  try {
    const r = await fetch(`${url}?v=${Date.now()}`, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
    });
    return r.ok ? r.json() : null;
  } catch {
    return null;
  }
};

export const fetchBackend = async (url: string): Promise<any> => {
  const r = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'include',
    headers: { ...getAuthHeaders() },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

export const safe = (val: any): string => {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return safe(val[0]);
  if (typeof val === 'object') {
    return String(
      val.text || val.title || val.summary || val.transcript ||
      val.caption || val.headline || val.name || ''
    );
  }
  return String(val);
};

export const inferLang = (text: string): string => {
  if (/[àâäéèêëîïôöùûüçæœ]/i.test(text)) return 'FR';
  if (/[áíóúñ¿¡]/i.test(text)) return 'ES';
  if (/[äöüß]/i.test(text)) return 'DE';
  if (/[ãõâêîôûáéíóúç]/i.test(text)) return 'PT';
  return 'EN';
};

export const detectPlatform = (url: string): string => {
  const u = url.toLowerCase();
  if (u.includes('facebook.com') || u.includes('fb.watch') || u.includes('fb.com')) return 'facebook';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('tiktok.com')) return 'tiktok';
  return 'instagram';
};

export const HASHTAG_STYLE = `
  .hashtag-links a {
    display:inline-flex !important; align-items:center !important;
    justify-content:center !important; padding:0.375rem 0.9rem !important;
    border-radius:9999px !important; background-color:#e0f2fe !important;
    color:#075985 !important; border:1px solid #7dd3fc !important;
    font-size:0.75rem !important; font-weight:700 !important;
    box-shadow:0 1px 2px rgba(8,145,178,.15) !important;
    text-decoration:none !important; margin-right:0.5rem; margin-bottom:0.5rem;
  }
  .hashtag-links a:hover {
    background-color:#bae6fd !important; border-color:#38bdf8 !important;
    box-shadow:0 2px 6px rgba(8,145,178,.25) !important; transform:translateY(-1px);
  }
`;
