import { apiUrl } from '../../utils/videoDetailUtils';

export type RecipeNoteResponse = {
  noteText: string;
  createdAt?: string;
  updatedAt?: string;
};

function getAuthToken(): string {
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

function noteUrl(reelId: string) {
  return apiUrl(`api/reel/${encodeURIComponent(reelId)}/notes`);
}

export async function getRecipeNote(reelId: string): Promise<RecipeNoteResponse> {
  const token = getAuthToken();
  const res = await fetch(noteUrl(reelId), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
    cache: 'no-store',
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }

  return {
    noteText: String(data?.noteText || ''),
    createdAt: data?.createdAt,
    updatedAt: data?.updatedAt,
  };
}

export async function saveRecipeNote(
  reelId: string,
  noteText: string
): Promise<RecipeNoteResponse> {
  const token = getAuthToken();
  const res = await fetch(noteUrl(reelId), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
    body: JSON.stringify({ noteText }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }

  return {
    noteText: String(data?.noteText ?? noteText),
    createdAt: data?.createdAt,
    updatedAt: data?.updatedAt,
  };
}
