import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/apiClient';
import { fetchGcsJson } from '../../utils/videoDetailUtils';

export type ShoppingRecipeEntry = {
  id: number | string;
  reelId: string;
  servings: number | null;
  addedAt: string | null;
  recipe: any;
};

export type ShoppingItemOverride = {
  ingredientKey: string;
  checked: boolean;
  excluded: boolean;
  updatedAt: string | null;
};

export type ShoppingListResponse = {
  shoppingListId: number | string;
  recipeEntries: ShoppingRecipeEntry[];
  itemOverrides: ShoppingItemOverride[];
};

export type ShoppingRecipeStatusResponse = {
  inShoppingList: boolean;
  listId?: string | number | null;
};

export function fetchShoppingList(): Promise<ShoppingListResponse> {
  return apiGet<ShoppingListResponse>('api/shopping-list');
}

export function fetchShoppingRecipeStatus(reelId: string): Promise<ShoppingRecipeStatusResponse> {
  return apiGet<ShoppingRecipeStatusResponse>(`api/shopping-list/recipes/${encodeURIComponent(reelId)}/status`);
}

function resultJsonUrl(payload: any): string {
  return String(
    payload?.result_json_url ||
      payload?.resultJsonUrl ||
      payload?.gcs_result_json_url ||
      payload?.result_json ||
      payload?.gcs_urls?.result_json ||
      payload?.gcs_urls?.result_json_url ||
      ''
  );
}

export async function fetchShoppingRecipePayload(reelId: string): Promise<any> {
  const db = await apiGet<any>(`api/reel/${encodeURIComponent(reelId)}?ts=${Date.now()}`);
  const gcs = resultJsonUrl(db) ? await fetchGcsJson(resultJsonUrl(db)) : null;
  const merged = { ...(gcs || {}), ...(db || {}) };

  merged.id = db?.id || db?.process_id || gcs?.id || gcs?.process_id || reelId;
  merged.process_id = db?.process_id || db?.id || gcs?.process_id || gcs?.id || reelId;
  if (gcs?.recipe && !db?.recipe) {
    merged.recipe = gcs.recipe;
  }

  return merged;
}

export function addShoppingRecipe(reelId: string, servings: number | null = null): Promise<ShoppingRecipeEntry> {
  return apiPost<ShoppingRecipeEntry>('api/shopping-list/recipes', { reelId, servings });
}

export function removeShoppingRecipe(reelId: string): Promise<{ ok: boolean; reelId: string }> {
  return apiDelete<{ ok: boolean; reelId: string }>(`api/shopping-list/recipes/${encodeURIComponent(reelId)}`);
}

export function patchShoppingItemOverride(
  ingredientKey: string,
  patch: { checked?: boolean; excluded?: boolean }
): Promise<ShoppingItemOverride> {
  return apiPatch<ShoppingItemOverride>(`api/shopping-list/items/${encodeURIComponent(ingredientKey)}`, patch);
}
