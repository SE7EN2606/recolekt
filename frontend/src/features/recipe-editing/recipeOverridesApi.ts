import { apiGet, apiPut } from '../../lib/apiClient';
import type { RecipeOverrideLayer } from './useRecipeEditing';

export type RecipeOverridesResponse = {
  verifiedByUser: boolean;
  overridePayload: Partial<Pick<RecipeOverrideLayer, 'ingredients' | 'steps'>>;
  createdAt: string | null;
  updatedAt: string | null;
};

function recipeOverridesPath(reelId: string): string {
  return `api/reel/${encodeURIComponent(reelId)}/recipe-overrides`;
}

export function fetchRecipeOverrides(reelId: string): Promise<RecipeOverridesResponse> {
  return apiGet<RecipeOverridesResponse>(recipeOverridesPath(reelId));
}

export function saveRecipeOverrides(
  reelId: string,
  overrides: RecipeOverrideLayer
): Promise<RecipeOverridesResponse> {
  return apiPut<RecipeOverridesResponse>(recipeOverridesPath(reelId), {
    verifiedByUser: overrides.verifiedByUser,
    overridePayload: {
      ingredients: overrides.ingredients,
      steps: overrides.steps,
    },
  });
}
