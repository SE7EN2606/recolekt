import { parseRawIngredient } from '../recipe-core/recipePayload';

export type NormalizedShoppingIngredient = {
  key: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  original: any;
};

const UNIT_ALIASES: Record<string, string> = {
  g: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  ml: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  l: 'l',
  liter: 'l',
  liters: 'l',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  cup: 'cup',
  cups: 'cup',
  tbsp: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
};

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (/^\d+\/\d+$/.test(text)) {
    const [a, b] = text.split('/').map(Number);
    return b ? a / b : null;
  }
  const mixed = text.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const numerator = Number(mixed[2]);
    const denominator = Number(mixed[3]);
    return denominator ? whole + numerator / denominator : null;
  }
  const parsed = Number(text.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(chopped|diced|minced|fresh|large|small|medium|optional|to taste)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stableKey(name: string): string {
  const cleaned = cleanName(name);
  return cleaned.replace(/\s+/g, '-').slice(0, 80) || 'ingredient';
}

function normalizeUnit(unit: unknown): string | null {
  const text = String(unit ?? '').trim().toLowerCase();
  if (!text) return null;
  return UNIT_ALIASES[text] || text;
}

export function normalizeShoppingIngredient(raw: any): NormalizedShoppingIngredient | null {
  const parsed = parseRawIngredient(raw);
  let name = String(parsed?.name || parsed?.item || '').trim();
  let quantity = parseNumber(parsed?.quantity);
  let unit = normalizeUnit(parsed?.unit);

  if (!name && typeof raw === 'string') {
    name = raw.trim();
  }

  if (typeof raw === 'string' && quantity === null) {
    const match = raw.trim().match(/^(\d+(?:[.,]\d+)?|\d+\s+\d+\/\d+|\d+\/\d+)\s+([a-zA-Z]+)\s+(.+)$/);
    if (match) {
      quantity = parseNumber(match[1]);
      unit = normalizeUnit(match[2]);
      name = match[3].trim();
    }
  }

  if (!name) return null;

  return {
    key: stableKey(name),
    name,
    quantity,
    unit,
    original: raw,
  };
}
