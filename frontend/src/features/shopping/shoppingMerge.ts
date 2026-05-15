import { normalizeIngredientSections } from '../recipe-core/recipePayload';
import {
  applyIngredientOverrides,
  normalizeOverrides,
} from '../recipe-editing/useRecipeEditing';
import type { IngredientSection } from '../recipe-core/recipePayload';
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
  quantityType: string;
  groceryForms: string[];
  interpretedCategory: string;
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
  if (isSemanticOnly(ingredient)) return false;
  if (target.quantity === null || ingredient.quantity === null) return false;
  if (!target.unit && !ingredient.unit) return true;
  return Boolean(target.unit && ingredient.unit && target.unit === ingredient.unit);
}

function displayNameForQuantity(key: string, quantity: number | null, fallback: string): string {
  return displayNameForKey(key, quantity, fallback);
}

function displayNameForKey(key: string, quantity: number | null, fallback: string): string {
  if (quantity === null) return fallback;
  if (key === 'onion') return quantity === 1 ? 'onion' : 'onions';
  if (key === 'lemon') return quantity === 1 ? 'lemon' : 'lemons';
  if (key === 'lime') return quantity === 1 ? 'lime' : 'limes';
  return fallback;
}

function mergeQuantityType(current: string, next: string): string {
  if (!current || current === 'unspecified') return next || 'unspecified';
  if (!next || next === 'unspecified' || next === current) return current;
  return current;
}

function isSemanticOnly(ingredient: NormalizedShoppingIngredient): boolean {
  if (ingredient.quantity !== null) return false;
  return ingredient.quantityType !== 'unspecified' || ['zest', 'juice', 'garnish', 'unspecified'].includes(ingredient.interpretation.groceryForm);
}

function reconcileProduceQuantity(item: MergedShoppingItem): void {
  if (item.quantity === null || item.unit) return;
  if (!['onion', 'lemon', 'lime'].includes(item.key)) return;

  const hasWholeOrPrepared = item.groceryForms.some((form) => ['whole', 'diced', 'minced'].includes(form));
  const hasCulinaryPart = item.groceryForms.some((form) => ['zest', 'juice'].includes(form));

  if (item.key === 'onion' && hasWholeOrPrepared) {
    item.quantity = Math.ceil(item.quantity);
  } else if ((item.key === 'lemon' || item.key === 'lime') && (hasWholeOrPrepared || hasCulinaryPart)) {
    item.quantity = Math.max(1, Math.ceil(item.quantity));
  }

  item.name = displayNameForKey(item.key, item.quantity, item.name);
}

function mergeGroceryForms(current: string[], next: string): string[] {
  return current.includes(next) ? current : [...current, next];
}

export function ingredientSectionsFromRecipe(recipe: any): IngredientSection[] {
  const candidates = [
    recipe?.recipe,
    recipe,
    recipe?.recipe?.english,
    recipe?.recipe?.original,
    recipe?.english,
    recipe?.original,
  ];

  for (const candidate of candidates) {
    const sections = normalizeIngredientSections(candidate);
    if (sections.length > 0) return sections;
  }

  return [];
}

function effectiveIngredientSections(recipe: any) {
  const sections = ingredientSectionsFromRecipe(recipe);
  const overrideResponse = recipe?.recipeUserOverrides || recipe?.recipe_user_overrides;

  if (!overrideResponse) return sections;

  return applyIngredientOverrides(sections, normalizeOverrides(overrideResponse));
}

export function shoppingBaseIngredientCount(recipe: any): number {
  return ingredientSectionsFromRecipe(recipe).reduce((total, section) => total + section.items.length, 0);
}

export function deriveMergedShoppingItems(
  entries: ShoppingRecipeEntry[],
  overrides: ShoppingItemOverride[]
): MergedShoppingItem[] {
  const overridesByKey = overrideMap(overrides);
  const byKey = new Map<string, MergedShoppingItem>();

  for (const entry of entries) {
    const sections = effectiveIngredientSections(entry.recipe);
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
          quantityType: ingredient.quantityType,
          groceryForms: [ingredient.interpretation.groceryForm],
          interpretedCategory: ingredient.interpretation.interpretedCategory,
          sources: [source],
          checked: Boolean(override?.checked),
          excluded: Boolean(override?.excluded),
        });
        reconcileProduceQuantity(byKey.get(ingredient.key)!);
        continue;
      }

      existing.sources.push(source);
      existing.groceryForms = mergeGroceryForms(existing.groceryForms, ingredient.interpretation.groceryForm);
      existing.quantityType = mergeQuantityType(existing.quantityType, ingredient.quantityType);
      if (canMergeQuantity(existing, ingredient)) {
        existing.quantity = Number((existing.quantity! + ingredient.quantity!).toFixed(3));
        existing.name = displayNameForQuantity(existing.key, existing.quantity, existing.name);
        reconcileProduceQuantity(existing);
      } else if (existing.quantity !== null && ingredient.quantity === null) {
        existing.name = displayNameForKey(existing.key, existing.quantity, existing.name);
        reconcileProduceQuantity(existing);
      } else if (existing.quantity === null && ingredient.quantity !== null) {
        existing.quantity = ingredient.quantity;
        existing.unit = ingredient.unit;
        existing.name = displayNameForKey(existing.key, existing.quantity, ingredient.name);
        reconcileProduceQuantity(existing);
      } else {
        if (existing.key !== ingredient.key || existing.interpretedCategory !== 'produce') {
          existing.quantity = null;
          existing.unit = null;
        }
      }
    }
  }

  return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name));
}
