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

  return normalizeSignatureValue(item?.instruction || item?.text || '');
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
  const parsed = parseRecipePayload(recipe);

  if (!parsed || parsed.is_compilation) return false;

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
    parsed.method_sections,
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
}

export function recipeInstructionCount(recipe: any): number {
  const parsed = parseRecipePayload(recipe);

  if (!parsed) return 0;

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
    parsed.method_sections,
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
}

export function recipeIngredientCount(recipe: any): number {
  const parsed = parseRecipePayload(recipe);

  if (!parsed) return 0;

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
}

export function buildRecipeForCard(viewModelRecipeInput: any, rawVideoRecipeInput: any): any {
  const rawVideoRecipe = parseRecipePayload(rawVideoRecipeInput);
  const viewModelRecipe = parseRecipePayload(viewModelRecipeInput);

  return viewModelRecipe || rawVideoRecipe
    ? {
        ...(rawVideoRecipe || {}),
        ...(viewModelRecipe || {}),
        ingredients:
          firstNonEmptyArray(
            viewModelRecipe?.ingredients,
            rawVideoRecipe?.ingredients
          ),
        ingredient_sections:
          firstNonEmptyArray(
            viewModelRecipe?.ingredient_sections,
            rawVideoRecipe?.ingredient_sections,
            viewModelRecipe?.ingredients_sections,
            rawVideoRecipe?.ingredients_sections,
            viewModelRecipe?.ingredient_groups,
            rawVideoRecipe?.ingredient_groups,
            viewModelRecipe?.ingredients_groups,
            rawVideoRecipe?.ingredients_groups
          ),
        instructions:
          firstNonEmptyArray(
            viewModelRecipe?.instructions,
            rawVideoRecipe?.instructions,
            viewModelRecipe?.steps,
            rawVideoRecipe?.steps,
            viewModelRecipe?.directions,
            rawVideoRecipe?.directions,
            viewModelRecipe?.method,
            rawVideoRecipe?.method
          ),
        instructions_sections:
          firstNonEmptyArray(
            viewModelRecipe?.instructions_sections,
            rawVideoRecipe?.instructions_sections,
            viewModelRecipe?.instruction_sections,
            rawVideoRecipe?.instruction_sections,
            viewModelRecipe?.method_sections,
            rawVideoRecipe?.method_sections,
            viewModelRecipe?.step_sections,
            rawVideoRecipe?.step_sections,
            viewModelRecipe?.steps_sections,
            rawVideoRecipe?.steps_sections
          ),
        instructionSections:
          firstNonEmptyArray(
            viewModelRecipe?.instructionSections,
            rawVideoRecipe?.instructionSections,
            viewModelRecipe?.instructionsSections,
            rawVideoRecipe?.instructionsSections
          ),
      }
    : null;
}

export function normalizeIngredientSections(recipe: any): IngredientSection[] {
  const parsed = parseRecipePayload(recipe);

  if (!parsed) return [];

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

  return [];
}

export function normalizeInstructionSections(recipe: any): InstructionSection[] {
  const parsed = parseRecipePayload(recipe);

  if (!parsed) return [];

  const sectionSources = [
    parsed.instructionSections,
    parsed.instructionsSections,
    parsed.instruction_sections,
    parsed.instructions_sections,
    parsed.method_sections,
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

export function formatQty(qty: any, unit?: any) {
  if (qty === null || qty === undefined || qty === '') return '';

  const quantity = String(qty).trim();

  if (!unit) return quantity;

  return `${quantity} ${unit}`;
}

export function assumedLabel(name: string) {
  const normalized = String(name || '').toLowerCase();

  if (/salt|pepper|poivre|sel|seasoning|spice|paprika|cumin|oregano/.test(normalized)) return 'to taste';
  if (/stock|broth|water|bouillon|milk|cream|wine|oil|sauce|liquid/.test(normalized)) return 'as needed';
  if (/thyme|rosemary|bay|parsley|herb|basil|laurier|thym|sage/.test(normalized)) return 'a few sprigs';

  return 'to taste';
}
