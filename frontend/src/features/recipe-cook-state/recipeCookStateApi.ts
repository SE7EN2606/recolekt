import { apiUrl } from '../../utils/videoDetailUtils';

export type RecipeCookStateResponse = {
  cookCount: number;
  lastCookedAt: string | null;
  verifiedByUser: boolean;
  hasActiveSession: boolean;
  activeSessionId: number | null;
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

function cookStateUrl(reelId: string, path: string) {
  return apiUrl(`api/reel/${encodeURIComponent(reelId)}/${path}`);
}

async function readCookStateResponse(
  res: Response
): Promise<RecipeCookStateResponse> {
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }

  return {
    cookCount: Number(data?.cookCount || 0),
    lastCookedAt: data?.lastCookedAt || null,
    verifiedByUser: Boolean(data?.verifiedByUser),
    hasActiveSession: Boolean(data?.hasActiveSession),
    activeSessionId: data?.activeSessionId ?? null,
  };
}

export async function getRecipeCookState(
  reelId: string
): Promise<RecipeCookStateResponse> {
  const token = getAuthToken();
  const res = await fetch(cookStateUrl(reelId, 'cook-state'), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
    cache: 'no-store',
  });

  return readCookStateResponse(res);
}

export async function markRecipeCooked(
  reelId: string
): Promise<RecipeCookStateResponse> {
  const token = getAuthToken();
  const res = await fetch(cookStateUrl(reelId, 'mark-cooked'), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
  });

  return readCookStateResponse(res);
}

export async function resetRecipeCookState(
  reelId: string
): Promise<RecipeCookStateResponse> {
  const token = getAuthToken();
  const res = await fetch(cookStateUrl(reelId, 'reset-cook-state'), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: 'include',
  });

  return readCookStateResponse(res);
}
