import { normalizeIngredientSections } from '../recipe-core/recipePayload';
import { normalizeShoppingIngredient, type NormalizedShoppingIngredient } from './ingredientNormalizer';
import type { ShoppingItemOverride, ShoppingRecipeEntry } from './shoppingApi';

export type ShoppingIngredientSource = {
  reelId: string;
  recipeTitle: string;
  recipeThumbnail?: string;
  ingredient: NormalizedShoppingIngredient;
};

export type MergedShoppingItem = {
  key: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  sources: ShoppingIngredientSource[];
  checked: boolean;
  excluded: boolean;
};

function recipeTitle(recipe: any): string {
  return String(recipe?.title || recipe?.summary_title || recipe?.summaryTitle || recipe?.caption?.split?.('\n')?.[0] || 'Recipe').trim();
}

function recipeThumbnail(recipe: any): string {
  return String(recipe?.posterUrl || recipe?.thumbnailUrl || recipe?.gcs_urls?.preview_thumbnail || recipe?.gcsurls?.previewthumbnail || '');
}

function overrideMap(overrides: ShoppingItemOverride[]) {
  return new Map(overrides.map((override) => [override.ingredientKey, override]));
}

function canMergeQuantity(target: MergedShoppingItem, ingredient: NormalizedShoppingIngredient): boolean {
  if (target.quantity === null || ingredient.quantity === null) return false;
  if (!target.unit && !ingredient.unit) return true;
  return Boolean(target.unit && ingredient.unit && target.unit === ingredient.unit);
}

export function deriveMergedShoppingItems(
  entries: ShoppingRecipeEntry[],
  overrides: ShoppingItemOverride[]
): MergedShoppingItem[] {
  const overridesByKey = overrideMap(overrides);
  const byKey = new Map<string, MergedShoppingItem>();

  for (const entry of entries) {
    const sections = normalizeIngredientSections(entry.recipe?.recipe || entry.recipe);
    const sourceBase = {
      reelId: entry.reelId,
      recipeTitle: recipeTitle(entry.recipe),
      recipeThumbnail: recipeThumbnail(entry.recipe),
    };

    for (const raw of sections.flatMap((section) => section.items)) {
      const ingredient = normalizeShoppingIngredient(raw);
      if (!ingredient) continue;

      const existing = byKey.get(ingredient.key);
      const source: ShoppingIngredientSource = { ...sourceBase, ingredient };

      if (!existing) {
        const override = overridesByKey.get(ingredient.key);
        byKey.set(ingredient.key, {
          key: ingredient.key,
          name: ingredient.name,
          quantity: ingredient.quantity,
          unit: ingredient.unit,
          sources: [source],
          checked: Boolean(override?.checked),
          excluded: Boolean(override?.excluded),
        });
        continue;
      }

      existing.sources.push(source);
      if (canMergeQuantity(existing, ingredient)) {
        existing.quantity = Number((existing.quantity! + ingredient.quantity!).toFixed(3));
      } else {
        existing.quantity = null;
        existing.unit = null;
      }
    }
  }

  return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name));
}
