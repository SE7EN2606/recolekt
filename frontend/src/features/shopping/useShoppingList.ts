import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addShoppingRecipe,
  fetchShoppingList,
  patchShoppingItemOverride,
  removeShoppingRecipe,
  type ShoppingItemOverride,
  type ShoppingListResponse,
  type ShoppingRecipeEntry,
} from './shoppingApi';
import { deriveMergedShoppingItems } from './shoppingMerge';
import { groupShoppingItems } from './shoppingGrouping';

const EMPTY_RESPONSE: ShoppingListResponse = {
  shoppingListId: '',
  recipeEntries: [],
  itemOverrides: [],
};

export default function useShoppingList() {
  const [data, setData] = useState<ShoppingListResponse>(EMPTY_RESPONSE);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    fetchShoppingList()
      .then((next) => {
        setData({
          shoppingListId: next.shoppingListId,
          recipeEntries: next.recipeEntries || [],
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

  const addRecipe = useCallback(async (reelId: string, servings: number | null = null) => {
    setSaving(true);
    try {
      await addShoppingRecipe(reelId, servings);
      await fetchShoppingList().then(setData);
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
    addRecipe,
    removeRecipe,
    patchItem,
    reload,
  };
}
