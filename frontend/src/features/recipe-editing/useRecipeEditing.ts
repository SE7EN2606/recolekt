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

function normalizeOverrides(data?: RecipeOverridesResponse | null): RecipeOverrideLayer {
  const payload = data?.overridePayload || {};
  const ingredients = (payload.ingredients || {}) as Partial<RecipeOverrideLayer['ingredients']>;
  const steps = (payload.steps || {}) as Partial<RecipeOverrideLayer['steps']>;

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
        : [],
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
  return String(raw?.instruction ?? raw?.text ?? '').trim();
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
    const removedIds = new Set(overrides.ingredients.removedIds);

    const sections = baseIngredientSections.map((section, sectionIndex) => ({
      ...section,
      items: section.items
        .map((item, itemIndex) => {
          const id = getIngredientId(sectionIndex, itemIndex);
          return overrides.ingredients.editedById[id] ?? item;
        })
        .filter((_, itemIndex) => !removedIds.has(getIngredientId(sectionIndex, itemIndex))),
    }));

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
    return baseInstructionSections
      .map((section, sectionIndex) => ({
        ...section,
        instructions: section.instructions.map((instruction, stepIndex) => {
          const id = getStepId(sectionIndex, stepIndex);
          return overrides.steps.editedById[id] ?? instruction;
        }),
      }))
      .filter((section) => section.instructions.length > 0);
  }, [baseInstructionSections, overrides.steps.editedById]);

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
      const added = current.ingredients.added.map((item) =>
        item.id === id ? { ...item, value } : item
      );

      return {
        ...current,
        ingredients: {
          ...current.ingredients,
          added,
          editedById: current.ingredients.added.some((item) => item.id === id)
            ? current.ingredients.editedById
            : { ...current.ingredients.editedById, [id]: value },
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
            value: '',
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
