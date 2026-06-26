import { useCallback, useEffect, useMemo, useState } from 'react';
import { isPerfModeEnabled } from '../../lib/perf';
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

function logShoppingPerf(
  action: 'add' | 'remove',
  reelId: string,
  rows: Array<Record<string, number | string | boolean | null>>
) {
  if (!isPerfModeEnabled()) return;

  console.log(`[perf] shopping action ${action} ${reelId}`);
  console.table(rows);
}

function buildShoppingPerfRows(
  action: 'add' | 'remove',
  reelId: string,
  clickStartedPerfMs: number,
  marks: {
    optimisticUpdate: boolean;
    apiStartedPerfMs: number;
    apiResponsePerfMs: number;
    localStateUpdatedPerfMs: number;
    renderAfterActionPerfMs: number;
  }
) {
  const rows = [
    { step: 'click received', msFromClick: 0, durationMs: null, optimisticUpdate: marks.optimisticUpdate },
    { step: 'optimistic update started', msFromClick: null, durationMs: null, optimisticUpdate: marks.optimisticUpdate },
    {
      step: 'API request started',
      msFromClick: Math.round((marks.apiStartedPerfMs - clickStartedPerfMs) * 10) / 10,
      durationMs: null,
      optimisticUpdate: marks.optimisticUpdate,
    },
    {
      step: 'API response received',
      msFromClick: Math.round((marks.apiResponsePerfMs - clickStartedPerfMs) * 10) / 10,
      durationMs: Math.round((marks.apiResponsePerfMs - marks.apiStartedPerfMs) * 10) / 10,
      optimisticUpdate: marks.optimisticUpdate,
    },
    {
      step: 'local state updated',
      msFromClick: Math.round((marks.localStateUpdatedPerfMs - clickStartedPerfMs) * 10) / 10,
      durationMs: Math.round((marks.localStateUpdatedPerfMs - marks.apiResponsePerfMs) * 10) / 10,
      optimisticUpdate: marks.optimisticUpdate,
    },
    {
      step: 'React render after action',
      msFromClick: Math.round((marks.renderAfterActionPerfMs - clickStartedPerfMs) * 10) / 10,
      durationMs: Math.round((marks.renderAfterActionPerfMs - marks.localStateUpdatedPerfMs) * 10) / 10,
      optimisticUpdate: marks.optimisticUpdate,
    },
    {
      step: 'total click-to-complete duration',
      msFromClick: Math.round((marks.renderAfterActionPerfMs - clickStartedPerfMs) * 10) / 10,
      durationMs: Math.round((marks.renderAfterActionPerfMs - clickStartedPerfMs) * 10) / 10,
      optimisticUpdate: marks.optimisticUpdate,
    },
  ];

  logShoppingPerf(action, reelId, rows);
}

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
    const clickStartedPerfMs = performance.now();
    setSaving(true);
    try {
      const apiStartedPerfMs = performance.now();
      await addShoppingRecipe(reelId, servings);
      const apiResponsePerfMs = performance.now();
      const next = await fetchShoppingList();
      const recipeEntries = await hydrateRecipeEntries(next.recipeEntries || []);
      setData({
        shoppingListId: next.shoppingListId,
        recipeEntries,
        itemOverrides: next.itemOverrides || [],
      });
      const localStateUpdatedPerfMs = performance.now();
      window.requestAnimationFrame(() => {
        buildShoppingPerfRows('add', reelId, clickStartedPerfMs, {
          optimisticUpdate: false,
          apiStartedPerfMs,
          apiResponsePerfMs,
          localStateUpdatedPerfMs,
          renderAfterActionPerfMs: performance.now(),
        });
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add recipe');
    } finally {
      setSaving(false);
    }
  }, []);

  const removeRecipe = useCallback(async (reelId: string) => {
    const clickStartedPerfMs = performance.now();
    setSaving(true);
    try {
      const apiStartedPerfMs = performance.now();
      await removeShoppingRecipe(reelId);
      const apiResponsePerfMs = performance.now();
      setData((current) => ({
        ...current,
        recipeEntries: current.recipeEntries.filter((entry) => entry.reelId !== reelId),
      }));
      const localStateUpdatedPerfMs = performance.now();
      window.requestAnimationFrame(() => {
        buildShoppingPerfRows('remove', reelId, clickStartedPerfMs, {
          optimisticUpdate: false,
          apiStartedPerfMs,
          apiResponsePerfMs,
          localStateUpdatedPerfMs,
          renderAfterActionPerfMs: performance.now(),
        });
      });
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
