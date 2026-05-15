import { parseRawIngredient } from '../recipe-core/recipePayload';

export type NormalizedShoppingIngredient = {
  key: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  quantityType: string;
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
  clove: 'clove',
  cloves: 'clove',
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

function knownUnit(unit: unknown): string | null {
  const text = String(unit ?? '').trim().toLowerCase();
  return text ? UNIT_ALIASES[text] || null : null;
}

function parseQuantityFromText(value: string): { quantity: number | null; unit: string | null; name: string } | null {
  const text = value.trim();
  const withUnit = text.match(/^(\d+(?:[.,]\d+)?|\d+\s+\d+\/\d+|\d+\/\d+)\s+([a-zA-Z]+)\s+(.+)$/);
  if (withUnit) {
    const unit = knownUnit(withUnit[2]);
    if (unit) {
      return {
        quantity: parseNumber(withUnit[1]),
        unit,
        name: withUnit[3].trim(),
      };
    }
  }

  const countOnly = text.match(/^(\d+(?:[.,]\d+)?|\d+\s+\d+\/\d+|\d+\/\d+)\s+(.+)$/);
  if (countOnly) {
    return {
      quantity: parseNumber(countOnly[1]),
      unit: null,
      name: countOnly[2].trim(),
    };
  }

  return null;
}

function canonicalIngredient(
  name: string,
  quantity: number | null,
  unit: string | null
): { keyName: string; displayName: string; unit: string | null } {
  const cleaned = cleanName(name);

  if (/\b(green onion|green onions|scallion|scallions)\b/.test(cleaned)) {
    return { keyName: cleaned, displayName: name.trim(), unit };
  }

  if (/\bgarlic\b/.test(cleaned) || /\bcloves? garlic\b/.test(cleaned)) {
    const usesClove = unit === 'clove' || /\bcloves?\b/.test(cleaned);
    return {
      keyName: 'garlic',
      displayName: 'garlic',
      unit: usesClove ? 'clove' : unit,
    };
  }

  if (/\b(yellow onion|white onion|red onion|onions?|bulb onion)\b/.test(cleaned)) {
    return {
      keyName: 'onion',
      displayName: quantity !== null && quantity !== 1 ? 'onions' : 'onion',
      unit,
    };
  }

  return {
    keyName: cleaned || name,
    displayName: name.trim(),
    unit,
  };
}

export function normalizeShoppingIngredient(raw: any): NormalizedShoppingIngredient | null {
  const parsed = parseRawIngredient(raw);
  let name = String(parsed?.name || parsed?.item || raw?.text || raw?.value || '').trim();
  let quantity = parseNumber(parsed?.quantity);
  let unit = normalizeUnit(parsed?.unit);
  const quantityType = String(parsed?.quantity_type || parsed?.quantityType || 'unspecified')
    .trim()
    .toLowerCase() || 'unspecified';

  if (!name && typeof raw === 'string') {
    name = raw.trim();
  }

  if (quantity === null) {
    const sourceText = typeof raw === 'string'
      ? raw.trim()
      : String(raw?.text || raw?.value || raw?.label || '').trim();
    const parsedText = parseQuantityFromText(sourceText);
    if (parsedText) {
      quantity = parsedText.quantity;
      unit = parsedText.unit;
      name = parsedText.name;
    }
  }

  if (!name) return null;
  const canonical = canonicalIngredient(name, quantity, unit);

  return {
    key: stableKey(canonical.keyName),
    name: canonical.displayName,
    quantity,
    unit: canonical.unit,
    quantityType,
    original: raw,
  };
}
