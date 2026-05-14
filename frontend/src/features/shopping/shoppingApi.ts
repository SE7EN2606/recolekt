import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/apiClient';

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

export function fetchShoppingList(): Promise<ShoppingListResponse> {
  return apiGet<ShoppingListResponse>('api/shopping-list');
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
