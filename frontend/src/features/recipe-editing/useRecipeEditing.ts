import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { IngredientSection, InstructionSection } from '../recipe-core/recipePayload';
import type { RawIngredient, RawInstruction } from '../recipe-core/types';
import { fetchRecipeOverrides, saveRecipeOverrides, type RecipeOverridesResponse } from './recipeOverridesApi';

export type RecipeOverrideLayer = {
  verifiedByUser: boolean;
  ingredients: {
    editedById: Record<string, RawIngredient>;
    removedIds: string[];
    added: Array<{
      id: string;
      sectionIndex: number;
      value: RawIngredient;
    }>;
  };
  steps: {
    editedById: Record<string, RawInstruction>;
  };
};

const createEmptyOverrides = (): RecipeOverrideLayer => ({
  verifiedByUser: false,
  ingredients: {
    editedById: {},
    removedIds: [],
    added: [],
  },
  steps: {
    editedById: {},
  },
});

function legacyIngredientRows(payload: any): RawIngredient[] {
  const direct = payload?.ingredients;
  if (Array.isArray(direct)) return direct;
  if (Array.isArray(direct?.items)) return direct.items;

  const sectionSources = [
    payload?.ingredient_sections,
    payload?.ingredients_sections,
    payload?.ingredientSections,
    payload?.ingredientsSections,
  ].filter(Array.isArray);

  return sectionSources
    .flat()
    .flatMap((section: any) =>
      [section?.items, section?.ingredients, section?.children]
        .filter(Array.isArray)
        .flat()
    );
}

export function normalizeOverrides(data?: RecipeOverridesResponse | null): RecipeOverrideLayer {
  const payload = data?.overridePayload || {};
  const legacyIngredientArray = legacyIngredientRows(payload);
  const ingredients = (
    payload.ingredients && typeof payload.ingredients === 'object' && !Array.isArray(payload.ingredients)
      ? payload.ingredients
      : (payload as any).editedById
        ? payload
        : {}
  ) as Partial<RecipeOverrideLayer['ingredients']>;
  const steps = (
    payload.steps && typeof payload.steps === 'object' && !Array.isArray(payload.steps)
      ? payload.steps
      : {}
  ) as Partial<RecipeOverrideLayer['steps']>;

  return {
    verifiedByUser: Boolean(data?.verifiedByUser),
    ingredients: {
      editedById: ingredients.editedById && typeof ingredients.editedById === 'object' ? ingredients.editedById : {},
      removedIds: Array.isArray(ingredients.removedIds) ? ingredients.removedIds.map(String) : [],
      added: Array.isArray(ingredients.added)
        ? ingredients.added.map((item: any) => ({
            id: String(item?.id || ''),
            sectionIndex: Number.isFinite(Number(item?.sectionIndex)) ? Number(item.sectionIndex) : 0,
            value: item?.value ?? '',
          })).filter((item) => item.id)
        : legacyIngredientArray.map((value: RawIngredient, index: number) => ({
            id: `legacy-added-ingredient-${index}`,
            sectionIndex: 0,
            value,
          })),
    },
    steps: {
      editedById: steps.editedById && typeof steps.editedById === 'object' ? steps.editedById : {},
    },
  };
}

export function getIngredientId(sectionIndex: number, itemIndex: number): string {
  return `section-${sectionIndex}-ingredient-${itemIndex}`;
}

export function getStepId(sectionIndex: number, stepIndex: number): string {
  return `section-${sectionIndex}-step-${stepIndex}`;
}

export function getIngredientEditText(raw: RawIngredient): string {
  if (typeof raw === 'string') return raw;

  const quantity = String(raw?.quantity ?? '').trim();
  const unit = String(raw?.unit ?? '').trim();
  const name = String(raw?.item ?? raw?.name ?? '').trim();
  const note = String(raw?.note ?? '').trim();

  return [quantity, unit, name].filter(Boolean).join(' ') + (note ? ` (${note})` : '');
}

export function getStepEditText(raw: RawInstruction): string {
  if (typeof raw === 'string') return raw;
  return String(
    raw?.instruction ??
    raw?.text ??
    (raw as any)?.step ??
    (raw as any)?.description ??
    (raw as any)?.body ??
    ''
  ).trim();
}

const KNOWN_UNITS = new Set([
  'g',
  'gram',
  'grams',
  'kg',
  'ml',
  'l',
  'oz',
  'ounce',
  'ounces',
  'lb',
  'lbs',
  'cup',
  'cups',
  'tbsp',
  'tablespoon',
  'tablespoons',
  'tsp',
  'teaspoon',
  'teaspoons',
]);

function cloneIngredientObject(raw: Exclude<RawIngredient, string>): Exclude<RawIngredient, string> {
  return { ...raw };
}

function normalizedIngredientName(raw: RawIngredient): string {
  if (typeof raw === 'string') return raw.trim().toLowerCase().replace(/\s+/g, ' ');

  return String(
    raw?.item ||
    raw?.name ||
    (raw as any)?.label ||
    (raw as any)?.originalItem ||
    (raw as any)?.original_item ||
    ''
  )
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function explicitIngredientId(raw: RawIngredient): string {
  if (!raw || typeof raw === 'string') return '';

  return String(
    (raw as any).id ||
    (raw as any).ingredientId ||
    (raw as any).ingredient_id ||
    (raw as any).originalId ||
    (raw as any).original_id ||
    ''
  ).trim();
}

function ingredientIdAt(sectionIndex: number, itemIndex: number): string {
  return getIngredientId(sectionIndex, itemIndex);
}

function findFallbackIngredientId(
  sections: IngredientSection[],
  editedId: string,
  value: RawIngredient,
  blockedIds: Set<string>
): string | null {
  const explicitId = explicitIngredientId(value);

  if (explicitId) {
    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
      const section = sections[sectionIndex];
      for (let itemIndex = 0; itemIndex < section.items.length; itemIndex += 1) {
        const id = ingredientIdAt(sectionIndex, itemIndex);
        if (blockedIds.has(id)) continue;
        if (id === explicitId || explicitIngredientId(section.items[itemIndex]) === explicitId) {
          return id;
        }
      }
    }
  }

  const editedName = normalizedIngredientName(value);
  if (!editedName) return null;

  const matches: string[] = [];

  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const section = sections[sectionIndex];
    for (let itemIndex = 0; itemIndex < section.items.length; itemIndex += 1) {
      const id = ingredientIdAt(sectionIndex, itemIndex);
      if (blockedIds.has(id) || id === editedId) continue;
      if (normalizedIngredientName(section.items[itemIndex]) === editedName) {
        matches.push(id);
      }
    }
  }

  return matches.length === 1 ? matches[0] : null;
}

function findBaseIngredient(
  sections: IngredientSection[],
  id: string,
  current?: RecipeOverrideLayer
): RawIngredient | undefined {
  const added = current?.ingredients.added.find((item) => item.id === id);
  if (added) return added.value;

  const match = id.match(/^section-(\d+)-ingredient-(\d+)$/);
  if (!match) return undefined;

  const sectionIndex = Number(match[1]);
  const itemIndex = Number(match[2]);
  return sections[sectionIndex]?.items[itemIndex];
}

export function parseIngredientEditValue(value: string, base?: RawIngredient): RawIngredient {
  const text = value.trim();
  const baseObject = base && typeof base !== 'string' ? cloneIngredientObject(base) : null;

  if (!text) {
    return baseObject ? { ...baseObject, item: '', name: '', quantity: '', unit: '' } : '';
  }

  const parsed = text.match(/^(\d+(?:[.,]\d+)?|\d+\s+\d+\/\d+|\d+\/\d+)\s+([a-zA-Z]+)\s+(.+)$/);
  if (parsed && KNOWN_UNITS.has(parsed[2].toLowerCase())) {
    return {
      ...(baseObject || {}),
      quantity: parsed[1],
      unit: parsed[2],
      item: parsed[3].trim(),
      name: parsed[3].trim(),
    };
  }

  const parsedWithoutUnit = text.match(/^(\d+(?:[.,]\d+)?|\d+\s+\d+\/\d+|\d+\/\d+)\s+(.+)$/);
  if (parsedWithoutUnit && baseObject && !String(baseObject.unit ?? '').trim()) {
    return {
      ...baseObject,
      quantity: parsedWithoutUnit[1],
      item: parsedWithoutUnit[2].trim(),
      name: parsedWithoutUnit[2].trim(),
    };
  }

  if (baseObject) {
    return {
      ...baseObject,
      item: text,
      name: text,
    };
  }

  return {
    item: text,
    name: text,
  };
}

export function applyIngredientOverrides(
  baseIngredientSections: IngredientSection[],
  overrides: RecipeOverrideLayer
): IngredientSection[] {
  const removedIds = new Set(overrides.ingredients.removedIds);
  const appliedIds = new Set<string>();
  const fallbackEdits = new Map<string, RawIngredient>();
  const consumedEditIds = new Set<string>();

  Object.entries(overrides.ingredients.editedById).forEach(([id, value]) => {
    if (removedIds.has(id)) return;
    if (id.match(/^section-\d+-ingredient-\d+$/)) return;

    const fallbackId = findFallbackIngredientId(baseIngredientSections, id, value, removedIds);
    if (fallbackId && !overrides.ingredients.editedById[fallbackId]) {
      fallbackEdits.set(fallbackId, value);
      consumedEditIds.add(id);
    }
  });

  const sections = baseIngredientSections.map((section, sectionIndex) => ({
    ...section,
    items: section.items
      .map((item, itemIndex) => {
        const id = getIngredientId(sectionIndex, itemIndex);
        appliedIds.add(id);
        return overrides.ingredients.editedById[id] ?? fallbackEdits.get(id) ?? item;
      })
      .filter((_, itemIndex) => !removedIds.has(getIngredientId(sectionIndex, itemIndex))),
  }));

  Object.entries(overrides.ingredients.editedById).forEach(([id, value]) => {
    if (appliedIds.has(id) || removedIds.has(id) || consumedEditIds.has(id)) return;

    const match = id.match(/^section-(\d+)-ingredient-\d+$/);
    const targetIndex = match
      ? Math.min(Math.max(Number(match[1]), 0), Math.max(sections.length - 1, 0))
      : 0;

    if (!sections[targetIndex]) {
      sections.push({ items: [] });
    }

    sections[targetIndex].items.push(value);
  });

  overrides.ingredients.added.forEach((added) => {
    const targetIndex = Math.min(Math.max(added.sectionIndex, 0), Math.max(sections.length - 1, 0));

    if (!sections[targetIndex]) {
      sections.push({ items: [] });
    }

    if (!removedIds.has(added.id)) {
      sections[targetIndex].items.push(added.value);
    }
  });

  return sections.filter((section) => section.items.length > 0);
}

export function applyInstructionOverrides(
  baseInstructionSections: InstructionSection[],
  overrides: RecipeOverrideLayer
): InstructionSection[] {
  return baseInstructionSections
    .map((section, sectionIndex) => ({
      ...section,
      instructions: section.instructions.map((instruction, stepIndex) => {
        const id = getStepId(sectionIndex, stepIndex);
        return overrides.steps.editedById[id] ?? instruction;
      }),
    }))
    .filter((section) => section.instructions.length > 0);
}

export function useRecipeEditing(
  recipeId: string,
  baseIngredientSections: IngredientSection[],
  baseInstructionSections: InstructionSection[]
) {
  const [isEditing, setIsEditing] = useState(false);
  const [overrides, setOverrides] = useState<RecipeOverrideLayer>(() => createEmptyOverrides());
  const [loadingOverrides, setLoadingOverrides] = useState(false);
  const [savingOverrides, setSavingOverrides] = useState(false);
  const [overridesSaved, setOverridesSaved] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const dirtyRef = useRef(false);
  const versionRef = useRef(0);
  const canPersist = Boolean(recipeId && recipeId !== 'recipe');

  useEffect(() => {
    setIsEditing(false);
    setOverrides(createEmptyOverrides());
    setOverridesSaved(false);
    setOverrideError(null);
    hasLoadedRef.current = false;
    dirtyRef.current = false;
    versionRef.current = 0;
  }, [recipeId]);

  useEffect(() => {
    let cancelled = false;

    if (!canPersist) {
      hasLoadedRef.current = true;
      return undefined;
    }

    setLoadingOverrides(true);
    fetchRecipeOverrides(recipeId)
      .then((data) => {
        if (cancelled) return;
        if (!dirtyRef.current) {
          setOverrides(normalizeOverrides(data));
        }
        setOverrideError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setOverrideError(error instanceof Error ? error.message : 'Recipe edits could not load');
      })
      .finally(() => {
        if (cancelled) return;
        hasLoadedRef.current = true;
        setLoadingOverrides(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canPersist, recipeId]);

  useEffect(() => {
    if (!canPersist || !hasLoadedRef.current || !dirtyRef.current) return undefined;

    const saveVersion = versionRef.current;
    const timeout = window.setTimeout(() => {
      setSavingOverrides(true);
      setOverridesSaved(false);
      saveRecipeOverrides(recipeId, overrides)
        .then(() => {
          if (versionRef.current === saveVersion) {
            dirtyRef.current = false;
            setOverridesSaved(true);
          }
          setOverrideError(null);
        })
        .catch((error) => {
          setOverrideError(error instanceof Error ? error.message : 'Recipe edits could not save');
        })
        .finally(() => {
          if (versionRef.current === saveVersion) {
            setSavingOverrides(false);
          }
        });
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [canPersist, overrides, recipeId]);

  const updateOverrides = useCallback((updater: (current: RecipeOverrideLayer) => RecipeOverrideLayer) => {
    versionRef.current += 1;
    dirtyRef.current = true;
    setOverridesSaved(false);
    setOverrides(updater);
  }, []);

  const editedIngredientSections = useMemo<IngredientSection[]>(() => {
    return applyIngredientOverrides(baseIngredientSections, overrides);
  }, [baseIngredientSections, overrides.ingredients]);

  const editableIngredientSections = useMemo(() => {
    const removedIds = new Set(overrides.ingredients.removedIds);

    const sections = baseIngredientSections.map((section, sectionIndex) => ({
      title: section.title,
      items: section.items
        .map((item, itemIndex) => {
          const id = getIngredientId(sectionIndex, itemIndex);
          return {
            id,
            value: overrides.ingredients.editedById[id] ?? item,
          };
        })
        .filter((item) => !removedIds.has(item.id)),
    }));

    overrides.ingredients.added.forEach((added) => {
      const targetIndex = Math.min(Math.max(added.sectionIndex, 0), Math.max(sections.length - 1, 0));

      if (!sections[targetIndex]) {
        sections.push({ title: undefined, items: [] });
      }

      if (!removedIds.has(added.id)) {
        sections[targetIndex].items.push({ id: added.id, value: added.value });
      }
    });

    return sections.filter((section) => section.items.length > 0 || baseIngredientSections.length === 0);
  }, [baseIngredientSections, overrides.ingredients]);

  const editedInstructionSections = useMemo<InstructionSection[]>(() => {
    return applyInstructionOverrides(baseInstructionSections, overrides);
  }, [baseInstructionSections, overrides]);

  const editableInstructionSections = useMemo(() => {
    return baseInstructionSections.map((section, sectionIndex) => ({
      title: section.title,
      instructions: section.instructions.map((instruction, stepIndex) => {
        const id = getStepId(sectionIndex, stepIndex);
        return {
          id,
          value: overrides.steps.editedById[id] ?? instruction,
        };
      }),
    }));
  }, [baseInstructionSections, overrides.steps.editedById]);

  const updateIngredient = (id: string, value: string) => {
    updateOverrides((current) => {
      const baseIngredient = findBaseIngredient(baseIngredientSections, id, current);
      const nextValue = parseIngredientEditValue(value, baseIngredient);
      const added = current.ingredients.added.map((item) =>
        item.id === id ? { ...item, value: nextValue } : item
      );

      return {
        ...current,
        ingredients: {
          ...current.ingredients,
          added,
          editedById: current.ingredients.added.some((item) => item.id === id)
            ? current.ingredients.editedById
            : { ...current.ingredients.editedById, [id]: nextValue },
        },
      };
    });
  };

  const addIngredient = (sectionIndex = 0) => {
    updateOverrides((current) => ({
      ...current,
      ingredients: {
        ...current.ingredients,
        added: [
          ...current.ingredients.added,
          {
            id: `added-ingredient-${Date.now()}-${current.ingredients.added.length}`,
            sectionIndex,
            value: { item: '', name: '' },
          },
        ],
      },
    }));
  };

  const removeIngredient = (id: string) => {
    updateOverrides((current) => ({
      ...current,
      ingredients: {
        ...current.ingredients,
        added: current.ingredients.added.filter((item) => item.id !== id),
        removedIds: current.ingredients.removedIds.includes(id)
          ? current.ingredients.removedIds
          : [...current.ingredients.removedIds, id],
      },
    }));
  };

  const updateStep = (id: string, value: string) => {
    updateOverrides((current) => ({
      ...current,
      steps: {
        ...current.steps,
        editedById: {
          ...current.steps.editedById,
          [id]: value,
        },
      },
    }));
  };

  const toggleVerified = () => {
    updateOverrides((current) => ({
      ...current,
      verifiedByUser: !current.verifiedByUser,
    }));
  };

  return {
    isEditing,
    setIsEditing,
    overrides,
    loadingOverrides,
    savingOverrides,
    overridesSaved,
    overrideError,
    editedIngredientSections,
    editedInstructionSections,
    editableIngredientSections,
    editableInstructionSections,
    updateIngredient,
    addIngredient,
    removeIngredient,
    updateStep,
    toggleVerified,
  };
}
