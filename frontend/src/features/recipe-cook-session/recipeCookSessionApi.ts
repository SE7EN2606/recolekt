import { apiGet, apiPost, apiPut } from '../../lib/apiClient';

export type RecipeCookSessionStatus = 'active' | 'completed';

export type RecipeCookSessionPayload = {
  currentStepIndex: number;
  checkedIngredientIds: string[];
  completedStepIds: string[];
  status: RecipeCookSessionStatus;
};

const DEFAULT_SESSION: RecipeCookSessionPayload = {
  currentStepIndex: 0,
  checkedIngredientIds: [],
  completedStepIds: [],
  status: 'active',
};

function cookSessionUrl(reelId: string, suffix = '') {
  return `api/reel/${encodeURIComponent(reelId)}/cook-session${suffix}`;
}

function normalizeCookSession(data: any): RecipeCookSessionPayload {
  const currentStepIndex = Number(data?.currentStepIndex ?? 0);
  const checkedIngredientIds = Array.isArray(data?.checkedIngredientIds)
    ? data.checkedIngredientIds.map((value: any) => String(value))
    : [];
  const completedStepIds = Array.isArray(data?.completedStepIds)
    ? data.completedStepIds.map((value: any) => String(value))
    : [];
  const status = data?.status === 'completed' ? 'completed' : 'active';

  return {
    currentStepIndex:
      Number.isFinite(currentStepIndex) && currentStepIndex > 0 ? currentStepIndex : 0,
    checkedIngredientIds,
    completedStepIds,
    status,
  };
}

export async function getRecipeCookSession(
  reelId: string
): Promise<RecipeCookSessionPayload> {
  const data = await apiGet<any>(cookSessionUrl(reelId));
  return normalizeCookSession(data);
}

export async function saveRecipeCookSession(
  reelId: string,
  payload: RecipeCookSessionPayload
): Promise<RecipeCookSessionPayload> {
  const data = await apiPut<any>(cookSessionUrl(reelId), payload);
  return normalizeCookSession(data);
}

export async function resetRecipeCookSession(
  reelId: string
): Promise<RecipeCookSessionPayload> {
  const data = await apiPost<any>(cookSessionUrl(reelId, '/reset'));
  return normalizeCookSession(data);
}

export function createEmptyCookSession(): RecipeCookSessionPayload {
  return { ...DEFAULT_SESSION };
}
