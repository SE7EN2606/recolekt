import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addShoppingRecipe,
  fetchShoppingRecipeStatus,
  removeShoppingRecipe,
} from './shoppingApi';

export default function useShoppingRecipeStatus(reelId: string, enabled: boolean) {
  const [inShoppingList, setInShoppingList] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);

  useEffect(() => {
    generationRef.current += 1;
    setInShoppingList(false);
    setLoading(false);
    setSaving(false);
    setError(null);
  }, [reelId]);

  useEffect(() => {
    if (!reelId || !enabled) return;

    let cancelled = false;
    const generation = generationRef.current;
    setLoading(true);

    fetchShoppingRecipeStatus(reelId)
      .then((data) => {
        if (!cancelled && generation === generationRef.current) {
          setInShoppingList(Boolean(data?.inShoppingList));
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled && generation === generationRef.current) {
          setError(err instanceof Error ? err.message : 'Could not load shopping status');
        }
      })
      .finally(() => {
        if (!cancelled && generation === generationRef.current) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, reelId]);

  const addRecipe = useCallback(async (servings: number | null = null) => {
    if (!reelId || saving) return;

    const previous = inShoppingList;
    setInShoppingList(true);
    setSaving(true);
    setError(null);

    try {
      await addShoppingRecipe(reelId, servings);
    } catch (err) {
      setInShoppingList(previous);
      setError(err instanceof Error ? err.message : 'Could not add recipe');
      throw err;
    } finally {
      setSaving(false);
    }
  }, [inShoppingList, reelId, saving]);

  const removeRecipe = useCallback(async () => {
    if (!reelId || saving) return;

    const previous = inShoppingList;
    setInShoppingList(false);
    setSaving(true);
    setError(null);

    try {
      await removeShoppingRecipe(reelId);
    } catch (err) {
      setInShoppingList(previous);
      setError(err instanceof Error ? err.message : 'Could not remove recipe');
      throw err;
    } finally {
      setSaving(false);
    }
  }, [inShoppingList, reelId, saving]);

  return {
    inShoppingList,
    loading,
    saving,
    error,
    addRecipe,
    removeRecipe,
  };
}
