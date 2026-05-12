import { apiGet, apiPost } from '../../lib/apiClient';

export type RecipeCookStateResponse = {
  cookCount: number;
  lastCookedAt: string | null;
  verifiedByUser: boolean;
  hasActiveSession: boolean;
  activeSessionId: number | null;
};

function cookStateUrl(reelId: string, path: string) {
  return `api/reel/${encodeURIComponent(reelId)}/${path}`;
}

function normalizeCookStateResponse(data: any): RecipeCookStateResponse {
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
  const data = await apiGet<any>(cookStateUrl(reelId, 'cook-state'));
  return normalizeCookStateResponse(data);
}

export async function markRecipeCooked(
  reelId: string
): Promise<RecipeCookStateResponse> {
  const data = await apiPost<any>(cookStateUrl(reelId, 'mark-cooked'));
  return normalizeCookStateResponse(data);
}

export async function resetRecipeCookState(
  reelId: string
): Promise<RecipeCookStateResponse> {
  const data = await apiPost<any>(cookStateUrl(reelId, 'reset-cook-state'));
  return normalizeCookStateResponse(data);
}
