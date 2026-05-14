import type { MergedShoppingItem } from './shoppingMerge';
import type { ShoppingPreferences } from './shoppingPreferences';

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}

function formatUnit(unit: string, quantity: number): string {
  if (unit === 'clove') return quantity === 1 ? 'clove' : 'cloves';
  return unit;
}

type SecondaryEquivalent = {
  amountPerUnit: number;
  unit: 'g' | 'ml';
};

function secondaryEquivalentPerUnit(item: MergedShoppingItem): SecondaryEquivalent | null {
  const name = item.name.toLowerCase();
  const unit = String(item.unit || '').toLowerCase();

  const tablespoonUnits = new Set(['tbsp', 'tablespoon', 'tablespoons']);
  const teaspoonUnits = new Set(['tsp', 'teaspoon', 'teaspoons']);
  const cupUnits = new Set(['cup', 'cups']);

  if (cupUnits.has(unit) && /\b(beef broth|beef stock|chicken broth|vegetable broth|stock|broth|heavy cream|dry red wine|burgundy wine|wine)\b/.test(name)) {
    return { amountPerUnit: 240, unit: 'ml' };
  }

  const multiplier = tablespoonUnits.has(unit) ? 1 : teaspoonUnits.has(unit) ? 1 / 3 : null;
  if (multiplier === null) return null;

  if (/tomato paste/.test(name)) return { amountPerUnit: 15 * multiplier, unit: 'g' };
  if (/\bhoney\b/.test(name)) return { amountPerUnit: 21 * multiplier, unit: 'g' };
  if (/\b(olive oil|oil)\b/.test(name)) return { amountPerUnit: 13.5 * multiplier, unit: 'g' };
  if (/\bbutter\b/.test(name)) return { amountPerUnit: 14 * multiplier, unit: 'g' };
  if (/\bsugar\b/.test(name)) return { amountPerUnit: 12.5 * multiplier, unit: 'g' };
  if (/\b(dijon mustard|mustard)\b/.test(name)) return { amountPerUnit: 15 * multiplier, unit: 'g' };

  if (/\b(worcestershire sauce|soy sauce|balsamic vinegar|vinegar|lemon juice|lime juice|vanilla extract)\b/.test(name)) {
    return { amountPerUnit: 15 * multiplier, unit: 'ml' };
  }

  return null;
}

export function formatShoppingQuantity(
  item: MergedShoppingItem,
  preferences: ShoppingPreferences
): string {
  if (item.quantity === null) return '';

  const primary = item.unit
    ? `${formatNumber(item.quantity)} ${formatUnit(item.unit, item.quantity)}`
    : formatNumber(item.quantity);

  if (!preferences.showSecondaryMeasures) return primary;

  const equivalent = secondaryEquivalentPerUnit(item);
  if (!equivalent) return primary;

  const estimate = item.quantity * equivalent.amountPerUnit;
  if (!Number.isFinite(estimate) || estimate <= 0) return primary;

  return `${primary} (~${formatNumber(estimate)} ${equivalent.unit})`;
}
