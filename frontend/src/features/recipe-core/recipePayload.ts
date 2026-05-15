import { convertToImperial, convertToMetric } from "../../utils/conversionUtils";
import type { RawIngredient, RawInstruction } from './types';

export type IngredientSection = {
  title?: string;
  items: RawIngredient[];
};

export type InstructionSection = {
  title?: string;
  instructions: RawInstruction[];
};

export function parseRecipePayload(recipe: any): any {
  if (!recipe) return null;

  if (typeof recipe === 'string') {
    try {
      return JSON.parse(recipe);
    } catch {
      return null;
    }
  }

  if (typeof recipe.recipe === 'string') {
    try {
      return JSON.parse(recipe.recipe);
    } catch {
      return recipe;
    }
  }

  if (recipe.recipe && typeof recipe.recipe === 'object') {
    return recipe.recipe;
  }

  return recipe;
}

export function firstNonEmptyArray(...values: any[]): any[] | undefined {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0) return value;
  }

  return undefined;
}

function longestArray(...values: any[]): any[] | undefined {
  let best: any[] | undefined;

  for (const value of values) {
    if (!Array.isArray(value) || value.length === 0) continue;
    if (!best || value.length > best.length) best = value;
  }

  return best;
}

function sectionItemCount(sections: any): number {
  if (!Array.isArray(sections)) return 0;

  return sections.reduce((total, section) => {
    const items = [
      section?.items,
      section?.ingredients,
      section?.instructions,
      section?.steps,
      section?.children,
    ]
      .filter(Array.isArray)
      .flat();

    return total + items.length;
  }, 0);
}

function richestSectionArray(...values: any[]): any[] | undefined {
  let best: any[] | undefined;
  let bestCount = 0;

  for (const value of values) {
    const count = sectionItemCount(value);
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }

  return best;
}

function recipeContentCandidates(recipe: any): any[] {
  const parsed = parseRecipePayload(recipe);
  if (!parsed) return [];

  return [
    parsed,
    parsed.english,
    parsed.original,
  ].filter((candidate) => candidate && typeof candidate === 'object');
}

function hasItems(sections: any[], itemKeys: string[]): boolean {
  return sections.some((section: any) =>
    itemKeys.some((key) => Array.isArray(section?.[key]) && section[key].length > 0)
  );
}

function firstArrayValue(source: any, keys: string[]) {
  for (const key of keys) {
    if (Array.isArray(source?.[key])) return source[key];
  }

  return [];
}

function firstStringValue(source: any, keys: string[]) {
  for (const key of keys) {
    const value = source?.[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function normalizeSignatureValue(value: any) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function ingredientSignature(item: RawIngredient) {
  if (typeof item === 'string') return normalizeSignatureValue(item);

  return [
    item?.item,
    item?.name,
    item?.quantity,
    item?.unit,
    item?.note,
  ]
    .map(normalizeSignatureValue)
    .join('|');
}

function instructionSignature(item: RawInstruction) {
  if (typeof item === 'string') return normalizeSignatureValue(item);

  return normalizeSignatureValue(
    item?.instruction ||
    item?.text ||
    (item as any)?.step ||
    (item as any)?.description ||
    (item as any)?.body ||
    ''
  );
}

function uniqueBy<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const key = getKey(item);

    if (!key || seen.has(key)) continue;

    seen.add(key);
    result.push(item);
  }

  return result;
}

export function hasUsableRecipeContent(recipe: any): boolean {
  const candidates = recipeContentCandidates(recipe);

  if (!candidates.length || candidates[0]?.is_compilation) return false;

  return candidates.some((parsed) => {
    const ingredientSectionSources = [
      parsed.ingredientSections,
      parsed.ingredientsSections,
      parsed.ingredient_sections,
      parsed.ingredients_sections,
      parsed.ingredient_groups,
      parsed.ingredients_groups,
    ].filter(Array.isArray) as any[][];

    const instructionSectionSources = [
      parsed.instructionSections,
      parsed.instructionsSections,
      parsed.instruction_sections,
      parsed.instructions_sections,
      parsed.methodSections,
      parsed.method_sections,
      parsed.stepSections,
      parsed.step_sections,
      parsed.steps_sections,
    ].filter(Array.isArray) as any[][];

    const hasSectionIngredients = ingredientSectionSources.some((sections) =>
      hasItems(sections, ['items', 'ingredients', 'children'])
    );

    const hasSectionInstructions = instructionSectionSources.some((sections) =>
      hasItems(sections, ['instructions', 'steps', 'items', 'children'])
    );

    const hasFlatIngredients = Array.isArray(parsed.ingredients) && parsed.ingredients.length > 0;
    const hasFlatInstructions = Array.isArray(parsed.instructions) && parsed.instructions.length > 0;
    const hasFlatSteps = Array.isArray(parsed.steps) && parsed.steps.length > 0;
    const hasFlatDirections = Array.isArray(parsed.directions) && parsed.directions.length > 0;
    const hasFlatMethod = Array.isArray(parsed.method) && parsed.method.length > 0;

    return hasSectionIngredients || hasSectionInstructions || hasFlatIngredients || hasFlatInstructions || hasFlatSteps || hasFlatDirections || hasFlatMethod;
  });
}

export function recipeInstructionCount(recipe: any): number {
  return Math.max(
    0,
    ...recipeContentCandidates(recipe).map((parsed) => {
      const flatCount = [
        parsed.instructions,
        parsed.steps,
        parsed.directions,
        parsed.method,
      ]
        .filter(Array.isArray)
        .flat().length;

      const sectionCount = [
        parsed.instructionSections,
        parsed.instructionsSections,
        parsed.instruction_sections,
        parsed.instructions_sections,
        parsed.methodSections,
        parsed.method_sections,
        parsed.stepSections,
        parsed.step_sections,
        parsed.steps_sections,
      ]
        .filter(Array.isArray)
        .flat()
        .reduce((total: number, section: any) => {
          const items = [
            section?.instructions,
            section?.steps,
            section?.items,
            section?.children,
          ]
            .filter(Array.isArray)
            .flat();

          return total + items.length;
        }, 0);

      return flatCount + sectionCount;
    })
  );
}

export function recipeIngredientCount(recipe: any): number {
  return Math.max(
    0,
    ...recipeContentCandidates(recipe).map((parsed) => {
      const flatCount = Array.isArray(parsed.ingredients) ? parsed.ingredients.length : 0;

      const sectionCount = [
        parsed.ingredientSections,
        parsed.ingredientsSections,
        parsed.ingredient_sections,
        parsed.ingredients_sections,
        parsed.ingredient_groups,
        parsed.ingredients_groups,
      ]
        .filter(Array.isArray)
        .flat()
        .reduce((total: number, section: any) => {
          const items = [
            section?.items,
            section?.ingredients,
            section?.children,
          ]
            .filter(Array.isArray)
            .flat();

          return total + items.length;
        }, 0);

      return Math.max(flatCount, sectionCount);
    })
  );
}

export function buildRecipeForCard(viewModelRecipeInput: any, rawVideoRecipeInput: any, extraRecipeInputs: any[] = []): any {
  const rawVideoRecipe = parseRecipePayload(rawVideoRecipeInput);
  const viewModelRecipe = parseRecipePayload(viewModelRecipeInput);
  const extraRecipes = extraRecipeInputs.map(parseRecipePayload).filter(Boolean);
  const candidates = [
    viewModelRecipe,
    rawVideoRecipe,
    viewModelRecipe?.english,
    rawVideoRecipe?.english,
    viewModelRecipe?.original,
    rawVideoRecipe?.original,
    ...extraRecipes,
    ...extraRecipes.map((recipe) => recipe?.english),
    ...extraRecipes.map((recipe) => recipe?.original),
  ];

  return viewModelRecipe || rawVideoRecipe || extraRecipes.length
    ? {
        ...(extraRecipes[0] || {}),
        ...(rawVideoRecipe || {}),
        ...(viewModelRecipe || {}),
        ingredients:
          longestArray(
            ...candidates.map((candidate) => candidate?.ingredients)
          ),
        ingredient_sections:
          richestSectionArray(
            ...candidates.flatMap((candidate) => [
              candidate?.ingredient_sections,
              candidate?.ingredients_sections,
              candidate?.ingredient_groups,
              candidate?.ingredients_groups,
            ])
          ),
        instructions:
          longestArray(
            ...candidates.flatMap((candidate) => [
              candidate?.instructions,
              candidate?.steps,
              candidate?.directions,
              candidate?.method,
            ])
          ),
        instructions_sections:
          richestSectionArray(
            ...candidates.flatMap((candidate) => [
              candidate?.instructions_sections,
              candidate?.instruction_sections,
              candidate?.methodSections,
              candidate?.method_sections,
              candidate?.stepSections,
              candidate?.step_sections,
              candidate?.steps_sections,
            ])
          ),
        instructionSections:
          richestSectionArray(
            ...candidates.flatMap((candidate) => [
              candidate?.instructionSections,
              candidate?.instructionsSections,
            ])
          ),
      }
    : null;
}

export function normalizeIngredientSections(recipe: any): IngredientSection[] {
  const candidates = recipeContentCandidates(recipe);

  for (const parsed of candidates) {
    const sectionSources = [
    parsed.ingredientSections,
    parsed.ingredientsSections,
    parsed.ingredient_sections,
    parsed.ingredients_sections,
    parsed.ingredient_groups,
    parsed.ingredients_groups,
  ].filter(Array.isArray) as any[][];

  const sections = sectionSources
    .flat()
    .map((section: any) => {
      const items = uniqueBy(
        firstArrayValue(section, ['items', 'ingredients', 'children']),
        ingredientSignature
      );

      return {
        title: firstStringValue(section, ['title', 'group', 'name', 'section', 'component']),
        items,
      };
    })
    .filter((section: IngredientSection) => section.items.length > 0);

  const dedupedSections = uniqueBy(
    sections,
    (section) => `${normalizeSignatureValue(section.title)}::${section.items.map(ingredientSignature).join('||')}`
  );

  const flatIngredients = Array.isArray(parsed.ingredients)
    ? uniqueBy(parsed.ingredients, ingredientSignature)
    : [];

  if (dedupedSections.length > 0) {
    const sectionItemKeys = new Set(
      dedupedSections.flatMap((section) => section.items.map(ingredientSignature))
    );

    const extras = flatIngredients.filter((item) => !sectionItemKeys.has(ingredientSignature(item)));

    if (extras.length > 0) {
      return [
        ...dedupedSections,
        {
          title: 'Other',
          items: extras,
        },
      ];
    }

    return dedupedSections;
  }

  if (flatIngredients.length > 0) {
    return [{ items: flatIngredients }];
  }
  }

  return [];
}

export function normalizeInstructionSections(recipe: any): InstructionSection[] {
  const candidates = recipeContentCandidates(recipe);

  for (const parsed of candidates) {
    const sectionSources = [
    parsed.instructionSections,
    parsed.instructionsSections,
    parsed.instruction_sections,
    parsed.instructions_sections,
    parsed.methodSections,
    parsed.method_sections,
    parsed.stepSections,
    parsed.step_sections,
    parsed.steps_sections,
  ].filter(Array.isArray) as any[][];

  const sections = sectionSources
    .flat()
    .map((section: any) => {
      const instructions = uniqueBy(
        firstArrayValue(section, ['instructions', 'steps', 'items', 'children']),
        instructionSignature
      );

      return {
        title: firstStringValue(section, ['title', 'group', 'name', 'section', 'phase', 'part']),
        instructions,
      };
    })
    .filter((section: InstructionSection) => section.instructions.length > 0);

  const dedupedSections = uniqueBy(
    sections,
    (section) => `${normalizeSignatureValue(section.title)}::${section.instructions.map(instructionSignature).join('||')}`
  );

  if (dedupedSections.length > 0) return dedupedSections;

  const flatInstructions = [
    parsed.instructions,
    parsed.steps,
    parsed.directions,
    parsed.method,
  ]
    .filter(Array.isArray)
    .flat();

  const dedupedInstructions = uniqueBy(flatInstructions, instructionSignature);

  if (dedupedInstructions.length > 0) {
    return [{ instructions: dedupedInstructions }];
  }
  }

  return [];
}

export function splitIngredientNote(label: string): { mainLabel: string; note: string } {
  const match = label.match(/^(.+?)\s*\(([^)]+)\)\s*$/);

  return match
    ? { mainLabel: match[1].trim(), note: match[2].trim() }
    : { mainLabel: label.trim(), note: '' };
}

export function parseRawIngredient(raw: any) {
  if (typeof raw === 'string') {
    const { mainLabel, note } = splitIngredientNote(raw);

    return {
      name: mainLabel,
      item: mainLabel,
      note,
      quantity: null,
      unit: null,
      emoji: '',
      needsReview: false,
      isApprox: false,
      qtyRange: null,
    };
  }

  const base = raw || {};
  const label = String(base.item || base.name || base.label || '').trim();
  const { mainLabel, note } = splitIngredientNote(label);

  return {
    ...base,
    name: mainLabel,
    item: mainLabel,
    note: base.note || note || '',
    quantity: base.quantity ?? null,
    unit: base.unit ?? null,
    emoji: base.emoji || '',
    needsReview: Boolean(base.needsReview || base.needs_review),
    isApprox: Boolean(base.isApprox || base.approximate),
    qtyRange: base.qtyRange || base.quantityRange || null,
  };
}

export function formatQty(
  qty: string | null,
  unit: string | null,
  scale: number = 1,
  scaleQty: ((q: string, s: number) => string) | undefined = undefined,
  useMetric: boolean = true,
  recipeConversion: 'do_not_convert' | 'smart' | 'always' = 'smart',
  volumePreference: 'metric' | 'us' = 'metric',
  rounding: 'rounded' | 'exact' = 'rounded',
  _name?: string
): string {
  if (qty === null || qty === undefined || (qty as any) === '') return '';

  const scaledQty = scaleQty ? scaleQty(String(qty).trim(), scale) : String(qty).trim();
  const raw = unit ? `${scaledQty} ${unit}` : scaledQty;

  if (recipeConversion === 'do_not_convert') return raw;

  const normalizedUnit = String(unit || '').trim().toLowerCase();
  const isVolume = [
    'ml', 'milliliter', 'milliliters',
    'l', 'liter', 'liters',
    'cup', 'cups',
    'tablespoon', 'tablespoons', 'tbsp',
    'teaspoon', 'teaspoons', 'tsp',
  ].includes(normalizedUnit);
  const preferMetric = isVolume ? volumePreference === 'metric' : useMetric;

  return preferMetric ? convertToMetric(raw, rounding) : convertToImperial(raw, rounding);
}

export function assumedLabel(name: string) {
  const normalized = String(name || '').toLowerCase();

  if (/salt|pepper|poivre|sel|seasoning|spice|paprika|cumin|oregano/.test(normalized)) return 'to taste';
  if (/stock|broth|water|bouillon|milk|cream|wine|oil|sauce|liquid/.test(normalized)) return 'as needed';
  if (/thyme|rosemary|bay|parsley|herb|basil|laurier|thym|sage/.test(normalized)) return 'a few sprigs';

  return 'to taste';
}
