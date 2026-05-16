import { parseRawIngredient } from '../recipe-core/recipePayload';

export type NormalizedShoppingIngredient = {
  key: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  quantityType: string;
  interpretation: GroceryIngredientInterpretation;
  original: any;
};

export type GroceryIngredientInterpretation = {
  originalName: string;
  normalizedName: string;
  groceryKey: string;
  groceryForm: 'whole' | 'juice' | 'zest' | 'diced' | 'minced' | 'clove' | 'prepared' | 'unspecified';
  quantityType: string;
  interpretedCategory: 'produce' | 'herb' | 'protein' | 'dairy' | 'pantry' | 'seasoning' | 'other';
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
  'fl oz': 'fl oz',
  floz: 'fl oz',
  'fluid ounce': 'fl oz',
  'fluid ounces': 'fl oz',
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
  if (/^(?:a\s+)?half$/i.test(text)) return 0.5;
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
  const halfOnly = text.match(/^(?:a\s+)?half\s+(.+)$/i);
  if (halfOnly) {
    return {
      quantity: 0.5,
      unit: null,
      name: halfOnly[1].trim(),
    };
  }

  const unitPattern = Object.keys(UNIT_ALIASES)
    .sort((a, b) => b.length - a.length)
    .map((unit) => unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const withUnit = text.match(new RegExp(`^(\\d+(?:[.,]\\d+)?|\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+)\\s+(${unitPattern})\\s+(.+)$`, 'i'));
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

function inferGroceryForm(cleaned: string, unit: string | null): GroceryIngredientInterpretation['groceryForm'] {
  if (/\bzest\b/.test(cleaned)) return 'zest';
  if (/\bjuice\b/.test(cleaned)) return 'juice';
  if (/\b(diced|chopped|sliced|halved|half|quarter(?:ed)?|wedges?)\b/.test(cleaned)) return 'diced';
  if (/\bminced\b/.test(cleaned)) return 'minced';
  if (unit === 'clove' || /\bcloves?\b/.test(cleaned)) return 'clove';
  if (/\b(ground|powder|paste|sauce|stock|broth|extract)\b/.test(cleaned)) return 'prepared';
  return 'whole';
}

function interpretedCategory(cleaned: string): GroceryIngredientInterpretation['interpretedCategory'] {
  if (/\b(lemon|lime|onion|garlic|tomato|potato|carrot|mushroom|zucchini|cucumber|avocado|apple|banana)\b/.test(cleaned)) return 'produce';
  if (/\b(parsley|cilantro|basil|dill|mint|herb)\b/.test(cleaned)) return 'herb';
  if (/\b(chicken|beef|pork|salmon|fish|shrimp|turkey|lamb)\b/.test(cleaned)) return 'protein';
  if (/\b(milk|cream|butter|cheese|yogurt|egg)\b/.test(cleaned)) return 'dairy';
  if (/\b(salt|pepper|spice|seasoning|paprika|cumin|cinnamon|oregano|thyme|rosemary)\b/.test(cleaned)) return 'seasoning';
  if (/\b(flour|sugar|rice|pasta|oil|vinegar|mustard|honey|almond|bean|lentil)\b/.test(cleaned)) return 'pantry';
  return 'other';
}

function interpretIngredient(
  originalName: string,
  quantityType: string,
  unit: string | null
): GroceryIngredientInterpretation {
  const normalizedName = cleanName(originalName);
  const formName = originalName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  let groceryKey = normalizedName;

  if (/\b(lemon zest|lemon juice|lemons?|half lemon)\b/.test(normalizedName)) {
    groceryKey = 'lemon';
  } else if (/\b(lime zest|lime juice|limes?|half lime)\b/.test(normalizedName)) {
    groceryKey = 'lime';
  } else if (/\b(yellow onion|white onion|red onion|onions?|bulb onion|half onion)\b/.test(normalizedName)) {
    groceryKey = 'onion';
  } else if (/\bgarlic\b/.test(normalizedName) || /\bcloves? garlic\b/.test(normalizedName)) {
    groceryKey = 'garlic';
  }

  return {
    originalName: originalName.trim(),
    normalizedName,
    groceryKey: groceryKey || normalizedName || originalName.trim().toLowerCase(),
    groceryForm: inferGroceryForm(formName, unit),
    quantityType,
    interpretedCategory: interpretedCategory(normalizedName),
  };
}

function canonicalIngredient(
  name: string,
  quantity: number | null,
  unit: string | null
): { keyName: string; displayName: string; unit: string | null; interpretation: GroceryIngredientInterpretation } {
  const cleaned = cleanName(name);
  const baseInterpretation = interpretIngredient(name, 'unspecified', unit);

  if (/\b(green onion|green onions|scallion|scallions)\b/.test(cleaned)) {
    return { keyName: cleaned, displayName: name.trim(), unit, interpretation: baseInterpretation };
  }

  if (/\bgarlic\b/.test(cleaned) || /\bcloves? garlic\b/.test(cleaned)) {
    const usesClove = unit === 'clove' || /\bcloves?\b/.test(cleaned);
    return {
      keyName: 'garlic',
      displayName: 'garlic',
      unit: usesClove ? 'clove' : unit,
      interpretation: {
        ...baseInterpretation,
        groceryKey: 'garlic',
        groceryForm: usesClove ? 'clove' : baseInterpretation.groceryForm,
        interpretedCategory: 'produce',
      },
    };
  }

  if (/\b(yellow onion|white onion|red onion|onions?|bulb onion)\b/.test(cleaned)) {
    return {
      keyName: 'onion',
      displayName: quantity !== null && quantity !== 1 ? 'onions' : 'onion',
      unit,
      interpretation: {
        ...baseInterpretation,
        groceryKey: 'onion',
        interpretedCategory: 'produce',
      },
    };
  }

  if (/\b(lemon zest|lemon juice|lemons?)\b/.test(cleaned)) {
    return {
      keyName: 'lemon',
      displayName: quantity !== null && quantity !== 1 ? 'lemons' : 'lemon',
      unit,
      interpretation: {
        ...baseInterpretation,
        groceryKey: 'lemon',
        interpretedCategory: 'produce',
      },
    };
  }

  if (/\b(lime zest|lime juice|limes?)\b/.test(cleaned)) {
    return {
      keyName: 'lime',
      displayName: quantity !== null && quantity !== 1 ? 'limes' : 'lime',
      unit,
      interpretation: {
        ...baseInterpretation,
        groceryKey: 'lime',
        interpretedCategory: 'produce',
      },
    };
  }

  return {
    keyName: cleaned || name,
    displayName: name.trim(),
    unit,
    interpretation: baseInterpretation,
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
  const interpretation = {
    ...canonical.interpretation,
    quantityType,
  };
  const keyName =
    ['lemon', 'lime'].includes(interpretation.groceryKey) &&
    interpretation.groceryForm === 'juice' &&
    canonical.unit
      ? `${interpretation.groceryKey} juice`
      : interpretation.groceryKey || canonical.keyName;
  const displayName = keyName.endsWith(' juice') ? name.trim() : canonical.displayName;

  return {
    key: stableKey(keyName),
    name: displayName,
    quantity,
    unit: canonical.unit,
    quantityType,
    interpretation,
    original: raw,
  };
}
