import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addShoppingRecipe,
  fetchShoppingRecipePayload,
  fetchShoppingList,
  patchShoppingItemOverride,
  removeShoppingRecipe,
  type ShoppingItemOverride,
  type ShoppingListResponse,
  type ShoppingRecipeEntry,
} from './shoppingApi';
import { deriveMergedShoppingItems, shoppingBaseIngredientCount } from './shoppingMerge';
import { groupShoppingItems } from './shoppingGrouping';

const EMPTY_RESPONSE: ShoppingListResponse = {
  shoppingListId: '',
  recipeEntries: [],
  itemOverrides: [],
};

function attachOverrides(recipe: any, source: any) {
  const overrides = source?.recipeUserOverrides || source?.recipe_user_overrides;
  if (!overrides) return recipe;

  return {
    ...recipe,
    recipeUserOverrides: overrides,
    recipe_user_overrides: overrides,
  };
}

async function hydrateRecipeEntries(entries: ShoppingRecipeEntry[]): Promise<ShoppingRecipeEntry[]> {
  const hydrated = await Promise.all(
    entries.map(async (entry) => {
      if (shoppingBaseIngredientCount(entry.recipe) > 0 || !entry.reelId) return entry;

      try {
        const fullRecipe = await fetchShoppingRecipePayload(entry.reelId);
        if (shoppingBaseIngredientCount(fullRecipe) === 0) return entry;

        return {
          ...entry,
          recipe: attachOverrides(fullRecipe, entry.recipe),
        };
      } catch {
        return entry;
      }
    })
  );

  return hydrated;
}

export default function useShoppingList() {
  const [data, setData] = useState<ShoppingListResponse>(EMPTY_RESPONSE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    fetchShoppingList()
      .then(async (next) => {
        const recipeEntries = await hydrateRecipeEntries(next.recipeEntries || []);
        setData({
          shoppingListId: next.shoppingListId,
          recipeEntries,
          itemOverrides: next.itemOverrides || [],
        });
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Shopping list failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const plannedRecipeIds = useMemo(
    () => new Set(data.recipeEntries.map((entry) => entry.reelId)),
    [data.recipeEntries]
  );

  const mergedItems = useMemo(
    () => deriveMergedShoppingItems(data.recipeEntries, data.itemOverrides),
    [data.recipeEntries, data.itemOverrides]
  );

  const groupedItems = useMemo(() => groupShoppingItems(mergedItems), [mergedItems]);
  const excludedItems = useMemo(
    () => mergedItems.filter((item) => item.excluded),
    [mergedItems]
  );
  const groupedExcludedItems = useMemo(
    () => groupShoppingItems(excludedItems, { includeExcluded: true }),
    [excludedItems]
  );

  const addRecipe = useCallback(async (reelId: string, servings: number | null = null) => {
    setSaving(true);
    try {
      await addShoppingRecipe(reelId, servings);
      const next = await fetchShoppingList();
      const recipeEntries = await hydrateRecipeEntries(next.recipeEntries || []);
      setData({
        shoppingListId: next.shoppingListId,
        recipeEntries,
        itemOverrides: next.itemOverrides || [],
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add recipe');
    } finally {
      setSaving(false);
    }
  }, []);

  const removeRecipe = useCallback(async (reelId: string) => {
    setSaving(true);
    try {
      await removeShoppingRecipe(reelId);
      setData((current) => ({
        ...current,
        recipeEntries: current.recipeEntries.filter((entry) => entry.reelId !== reelId),
      }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove recipe');
    } finally {
      setSaving(false);
    }
  }, []);

  const patchItem = useCallback(async (ingredientKey: string, patch: { checked?: boolean; excluded?: boolean }) => {
    const optimistic: ShoppingItemOverride = {
      ingredientKey,
      checked: Boolean(patch.checked),
      excluded: Boolean(patch.excluded),
      updatedAt: new Date().toISOString(),
    };

    setData((current) => {
      const existing = current.itemOverrides.find((item) => item.ingredientKey === ingredientKey);
      const nextOverride = existing ? { ...existing, ...patch } : optimistic;
      return {
        ...current,
        itemOverrides: [
          ...current.itemOverrides.filter((item) => item.ingredientKey !== ingredientKey),
          nextOverride,
        ],
      };
    });

    try {
      const saved = await patchShoppingItemOverride(ingredientKey, patch);
      setData((current) => ({
        ...current,
        itemOverrides: [
          ...current.itemOverrides.filter((item) => item.ingredientKey !== ingredientKey),
          saved,
        ],
      }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update item');
      reload();
    }
  }, [reload]);

  return {
    loading,
    saving,
    error,
    recipeEntries: data.recipeEntries as ShoppingRecipeEntry[],
    itemOverrides: data.itemOverrides,
    plannedRecipeIds,
    mergedItems,
    groupedItems,
    excludedItems,
    groupedExcludedItems,
    addRecipe,
    removeRecipe,
    patchItem,
    reload,
  };
}
