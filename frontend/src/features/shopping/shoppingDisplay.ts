import type { MergedShoppingItem } from './shoppingMerge';
import type { ShoppingPreferences } from './shoppingPreferences';

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}

function formatApproxNumber(value: number, rounding: ShoppingPreferences['rounding']): string {
  if (!Number.isFinite(value)) return '';
  if (rounding === 'exact') return Number(value.toFixed(2)).toString();
  if (value >= 100) return String(Math.round(value));
  if (value >= 10) return String(Math.round(value * 10) / 10);
  return String(Math.round(value * 100) / 100);
}

function formatUnit(unit: string, quantity: number): string {
  if (unit === 'clove') return quantity === 1 ? 'clove' : 'cloves';
  return unit;
}

type SecondaryEquivalent = {
  amountPerUnit: number;
  unit: 'g' | 'ml';
};

type DisplayQuantity = {
  text: string;
  converted: boolean;
};

const QUANTITY_TYPE_LABELS: Record<string, string> = {
  to_taste: 'to taste',
  as_needed: 'as needed',
  optional: 'optional',
  garnish: 'garnish',
  unspecified: 'quantity not specified',
};

export function quantityTypeLabel(quantityType: unknown): string {
  const key = String(quantityType || 'unspecified').trim().toLowerCase();
  return QUANTITY_TYPE_LABELS[key] || QUANTITY_TYPE_LABELS.unspecified;
}

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

function isMetric(preferences: ShoppingPreferences): boolean {
  return preferences.unitPreference === 'metric' || preferences.volumePreference === 'metric';
}

function metricMass(quantity: number, unit: string, rounding: ShoppingPreferences['rounding']): DisplayQuantity | null {
  const lower = unit.toLowerCase();
  const grams =
    lower === 'lb' || lower === 'lbs' || lower === 'pound' || lower === 'pounds'
      ? quantity * 453.592
      : lower === 'oz' || lower === 'ounce' || lower === 'ounces'
        ? quantity * 28.3495
        : null;

  if (grams === null) return null;

  if (grams >= 1000) {
    return { text: `${formatApproxNumber(grams / 1000, rounding)} kg`, converted: true };
  }

  return { text: `${formatApproxNumber(grams, rounding)} g`, converted: true };
}

function metricVolume(quantity: number, unit: string, item: MergedShoppingItem, rounding: ShoppingPreferences['rounding']): DisplayQuantity | null {
  const lower = unit.toLowerCase();
  const name = item.name.toLowerCase();
  const liquidCup = /\b(beef broth|beef stock|chicken broth|vegetable broth|stock|broth|heavy cream|dry red wine|burgundy wine|wine)\b/.test(name);

  const ml =
    lower === 'fl oz' || lower === 'floz' || lower === 'fluid ounce' || lower === 'fluid ounces'
      ? quantity * 29.5735
      : lower === 'cup' || lower === 'cups'
        ? liquidCup
          ? quantity * 240
          : null
        : null;

  if (ml === null) return null;

  if (ml >= 1000) {
    return { text: `${formatApproxNumber(ml / 1000, rounding)} L`, converted: true };
  }

  return { text: `${formatApproxNumber(ml, rounding)} ml`, converted: true };
}

function imperialMass(quantity: number, unit: string, rounding: ShoppingPreferences['rounding']): DisplayQuantity | null {
  const lower = unit.toLowerCase();
  const grams =
    lower === 'g' || lower === 'gram' || lower === 'grams'
      ? quantity
      : lower === 'kg' || lower === 'kilogram' || lower === 'kilograms'
        ? quantity * 1000
        : null;

  if (grams === null) return null;

  const pounds = grams / 453.592;
  if (pounds >= 1) return { text: `${formatApproxNumber(pounds, rounding)} lb`, converted: true };
  return { text: `${formatApproxNumber(grams / 28.3495, rounding)} oz`, converted: true };
}

function imperialVolume(quantity: number, unit: string, rounding: ShoppingPreferences['rounding']): DisplayQuantity | null {
  const lower = unit.toLowerCase();
  const ml =
    lower === 'ml' || lower === 'milliliter' || lower === 'milliliters'
      ? quantity
      : lower === 'l' || lower === 'liter' || lower === 'liters'
        ? quantity * 1000
        : null;

  if (ml === null) return null;

  const cups = ml / 240;
  if (cups >= 0.25) return { text: `${formatApproxNumber(cups, rounding)} cup`, converted: true };
  return { text: `${formatApproxNumber(ml / 29.5735, rounding)} fl oz`, converted: true };
}

function primaryDisplayQuantity(item: MergedShoppingItem, preferences: ShoppingPreferences): DisplayQuantity {
  if (item.quantity === null) {
    return { text: quantityTypeLabel(item.quantityType), converted: false };
  }

  if (!item.unit) return { text: formatNumber(item.quantity), converted: false };

  const original = `${formatNumber(item.quantity)} ${formatUnit(item.unit, item.quantity)}`;

  if (isMetric(preferences)) {
    const converted =
      metricMass(item.quantity, item.unit, preferences.rounding) ||
      metricVolume(item.quantity, item.unit, item, preferences.rounding);
    if (converted) return converted;

    const lower = item.unit.toLowerCase();
    const unsafeImperialVolume = ['cup', 'cups'].includes(lower);
    return { text: unsafeImperialVolume ? `${original} (original)` : original, converted: false };
  }

  return (
    imperialMass(item.quantity, item.unit, preferences.rounding) ||
    imperialVolume(item.quantity, item.unit, preferences.rounding) ||
    { text: original, converted: false }
  );
}

export function formatShoppingQuantity(
  item: MergedShoppingItem,
  preferences: ShoppingPreferences
): string {
  const primary = primaryDisplayQuantity(item, preferences);
  if (item.quantity === null) return primary.text;

  if (!preferences.showSecondaryMeasures) return primary.text;

  const equivalent = secondaryEquivalentPerUnit(item);
  if (!equivalent) return primary.text;
  if (primary.converted && isMetric(preferences)) return primary.text;

  const estimate = item.quantity * equivalent.amountPerUnit;
  if (!Number.isFinite(estimate) || estimate <= 0) return primary.text;

  return `${primary.text} (~${formatNumber(estimate)} ${equivalent.unit})`;
}
