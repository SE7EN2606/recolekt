import React, { useMemo, useState } from 'react';
import { ChefHat } from 'lucide-react';
import RecipeNutritionSummary from '../features/recipe-secondary/RecipeNutritionSummary';
import RecipeStepsPanel from '../features/recipe-core/panels/RecipeStepsPanel';
import RecipeAskPanel from '../features/recipe-core/panels/RecipeAskPanel';
import useRecipeAssistant from '../features/recipe-assistant/useRecipeAssistant';
import IngredientRow from '../features/recipe-core/rows/IngredientRow';
import RecipeCompilationCard from '../features/recipe-core/cards/RecipeCompilationCard';
import { useTranslation } from 'react-i18next';
import CookModeModal from './CookModeModal';

type RawInstruction =
  | string
  | {
      instruction?: string | null;
      text?: string | null;
      source?: string | null;
      confidence?: string | null;
      needs_review?: boolean | null;
      userEdited?: boolean | null;
    };

type RawIngredient =
  | string
  | {
      item?: string | null;
      name?: string | null;
      quantity?: number | string | null;
      unit?: string | null;
      emoji?: string | null;
      note?: string | null;
      source?: string | null;
      confidence?: string | null;
      needs_review?: boolean;
      missing_reason?: string | null;
      approximate?: boolean;
      quantityRange?: { min: number; max: number; unit?: string } | null;
    };

type IngredientSection = {
  title?: string;
  items: RawIngredient[];
};

type InstructionSection = {
  title?: string;
  instructions: RawInstruction[];
};

type RecipeTabKey = 'ingredients' | 'steps' | 'nutrition' | 'ask';

export interface RecipeDetailsCardProps {
  recipe?: any;
  recipeId?: string;
  recipeName?: string;
  servingScale?: number;
  scaleQuantity?: (qty: string, scale: number) => string;
  useMetric?: boolean;
  onToggleMetric?: (val: boolean) => void;
}

function parseRecipePayload(recipe: any): any {
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

function splitIngredientNote(label: string): { mainLabel: string; note: string } {
  const match = label.match(/^(.+?)\s*\(([^)]+)\)\s*$/);

  return match
    ? { mainLabel: match[1].trim(), note: match[2].trim() }
    : { mainLabel: label.trim(), note: '' };
}

function parseRawIngredient(raw: any) {
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

function formatQty(qty: any, unit?: any) {
  if (qty === null || qty === undefined || qty === '') return '';

  const quantity = String(qty).trim();

  if (!unit) return quantity;

  return `${quantity} ${unit}`;
}

function assumedLabel(name: string) {
  const normalized = String(name || '').toLowerCase();

  if (/salt|pepper|poivre|sel|seasoning|spice|paprika|cumin|oregano/.test(normalized)) return 'to taste';
  if (/stock|broth|water|bouillon|milk|cream|wine|oil|sauce|liquid/.test(normalized)) return 'as needed';
  if (/thyme|rosemary|bay|parsley|herb|basil|laurier|thym|sage/.test(normalized)) return 'a few sprigs';

  return 'to taste';
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

function normalizeIngredientSections(recipe: any): IngredientSection[] {
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

<<<<<<< HEAD
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

function normalizeInstructionSections(recipe: any): InstructionSection[] {
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
=======
const TimeCell: React.FC<{ icon: React.ReactNode; label: string; value: string | null; accent?: string }> = ({ icon, label, value, accent }) => {
  if (!value) return null;
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-4 px-2 text-center">
      <div className={
        accent === 'tertiary-500' ? 'text-tertiary-500' :
        accent === 'amber-500' ? 'text-amber-500' :
        accent === 'purple-500' ? 'text-purple-500' :
        accent === 'gray-400' ? 'text-gray-400' :
        'text-gray-400'
      }>{icon}</div>
      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</span>
      <span className="text-[13px] font-black text-gray-900 leading-tight">{value}</span>
    </div>
>>>>>>> origin/main
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

function getServings(recipe: any) {
  if (typeof recipe?.servings === 'number') return recipe.servings;
  const parsed = Number(recipe?.servings);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export const RecipeDetailsCard: React.FC<RecipeDetailsCardProps> = ({
  recipe,
  recipeId = 'recipe',
  recipeName = 'Recipe',
  servingScale = 1,
  scaleQuantity,
  useMetric = true,
  onToggleMetric,
}) => {
  const { t } = useTranslation(['videoDetail']);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set());
  const [isCookModeOpen, setIsCookModeOpen] = useState(false);
  const [savedCookStep, setSavedCookStep] = useState<number | null>(null);
  const [activeRecipeTab, setActiveRecipeTab] = useState<RecipeTabKey>('ingredients');

  const {
    askQuestion,
    askAnswer,
    askLoading,
    handleAskRecipe,
  } = useRecipeAssistant({ recipeId });

  const ingredientSections = useMemo(
    () => (!recipe || recipe.is_compilation ? [] : normalizeIngredientSections(recipe)),
    [recipe]
  );

  const instructionSections = useMemo(
    () => (!recipe || recipe.is_compilation ? [] : normalizeInstructionSections(recipe)),
    [recipe]
  );

  const allIngredients = useMemo(() => ingredientSections.flatMap((section) => section.items), [ingredientSections]);
  const allInstructions = useMemo(() => instructionSections.flatMap((section) => section.instructions), [instructionSections]);
  const hasIngredients = allIngredients.length > 0;
  const hasSteps = allInstructions.length > 0;

  const recipeTabs = useMemo(() => {
    const tabs: { key: RecipeTabKey; label: string }[] = [];

    if (hasIngredients) tabs.push({ key: 'ingredients', label: 'Ingredients' });
    if (hasSteps) tabs.push({ key: 'steps', label: 'Steps' });
    if (hasIngredients) tabs.push({ key: 'nutrition', label: 'Macro' });

    tabs.push({ key: 'ask', label: 'Ask' });

    return tabs;
  }, [hasIngredients, hasSteps]);

  const visibleRecipeTab: RecipeTabKey = recipeTabs.some((tab) => tab.key === activeRecipeTab)
    ? activeRecipeTab
    : recipeTabs[0]?.key || 'ask';

  if (!recipe) return null;
  if (recipe.is_compilation) return <RecipeCompilationCard recipe={recipe} />;
  if (!hasIngredients && !hasSteps) return null;

  const toggleIngredient = (id: string) =>
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

<<<<<<< HEAD
  const toggleStep = (index: number) =>
    setCheckedSteps((prev) => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
=======
  // ── Render ───────────────────────────────────────────────────────────────

>>>>>>> origin/main

  return (
    <>
      <div className="bg-white border border-gray-100 rounded-[24px] shadow-sm overflow-hidden mt-4 mb-6">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-rose-100 bg-rose-50/70">
          <div className="flex items-center gap-2.5 min-w-0">
            <ChefHat size={18} className="text-rose-500 shrink-0" />
            <h3 className="font-bold text-gray-900 text-base tracking-tight truncate">
              {t('videoDetail:recipeDetails', 'Recipe Details')}
            </h3>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {hasSteps && (
              <button
                type="button"
                onClick={() => setIsCookModeOpen(true)}
                className="px-3 py-1.5 bg-gray-950 text-white rounded-xl text-[11px] font-black shadow-sm hover:bg-gray-800 transition-colors"
              >
                Cook
              </button>
            )}

            {onToggleMetric && hasIngredients && (
              <button
                type="button"
                onClick={() => onToggleMetric(!useMetric)}
                className="px-3 py-1.5 bg-white/90 border border-rose-100 text-gray-700 rounded-xl text-[11px] font-bold shadow-sm hover:bg-white transition-colors"
              >
                {useMetric ? 'Imperial' : 'Metric'}
              </button>
            )}
          </div>
<<<<<<< HEAD
=======

          {/* Ingredient rows */}
          <div className="divide-y divide-gray-50/80">
            {hasGroups
              ? groups.map((group, gi) => (
                  <div key={gi}>
                    {(group.title || group.group) && (
                      <div className="px-5 pt-3 pb-1.5">
                        <h5 className="text-[11px] font-black text-gray-400 uppercase tracking-widest">
                          {group.title || group.group}
                        </h5>
                      </div>
                    )}
                    <ul>
                      {(group.items ?? []).map((item, ii) => {
                        const id = `g${gi}-i${ii}`;
                        return (
                          <IngredientRow
                            key={id} id={id} raw={item}
                            servingScale={currentScale} scaleQuantity={scaleQuantity}
                            checked={checkedIds.has(id)} onToggle={toggleIngredient}
                            useMetric={useMetric}
                          />
                        );
                      })}
                    </ul>
                  </div>
                ))
              : <ul className="divide-y divide-gray-50/80">
                  {flat.map((item, i) => {
                    const id = `f${i}`;
                    return (
                      <IngredientRow
                        key={id} id={id} raw={item}
                        servingScale={currentScale} scaleQuantity={scaleQuantity}
                        checked={checkedIds.has(id)} onToggle={toggleIngredient}
                        useMetric={useMetric}
                      />
                    );
                  })}
                </ul>
            }
          </div>
>>>>>>> origin/main
        </div>

        {recipeTabs.length > 1 && (
          <div className="bg-gray-50 px-3 py-3">
            <div
              className="grid gap-1 rounded-2xl bg-gray-100 p-1 text-[12px] font-black"
              style={{ gridTemplateColumns: `repeat(${recipeTabs.length}, minmax(0, 1fr))` }}
            >
              {recipeTabs.map((tab) => {
                const active = visibleRecipeTab === tab.key;

                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveRecipeTab(tab.key)}
                    className={`rounded-xl px-2 py-2.5 transition-all ${
                      active
                        ? 'bg-white text-violet-600 shadow-sm'
                        : 'text-gray-500 hover:bg-white/50 hover:text-gray-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {visibleRecipeTab === 'ingredients' && hasIngredients && (
          <div className="py-3">
            <div className="space-y-4">
              {ingredientSections.map((section, sectionIndex) => (
                <div key={sectionIndex}>
                  {section.title && (
                    <h4 className="px-5 pb-1.5 text-[11px] font-black uppercase tracking-widest text-gray-400">
                      {section.title}
                    </h4>
                  )}

                  <ul className="divide-y divide-gray-50">
                    {section.items.map((item, itemIndex) => {
                      const id = `section-${sectionIndex}-ingredient-${itemIndex}`;

                      return (
                        <IngredientRow
                          key={id}
                          id={id}
                          raw={item}
                          servingScale={servingScale}
                          scaleQuantity={scaleQuantity}
                          checked={checkedIds.has(id)}
                          onToggle={toggleIngredient}
                          useMetric={useMetric}
                          parseRawIngredient={parseRawIngredient}
                          formatQty={formatQty}
                          assumedLabel={assumedLabel}
                        />
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {visibleRecipeTab === 'steps' && hasSteps && (
          <div className="px-5 py-5 border-t border-gray-50">
            <RecipeStepsPanel
              instructionSections={instructionSections}
              checkedSteps={checkedSteps}
              toggleStep={toggleStep}
            />
          </div>
        )}

        {visibleRecipeTab === 'nutrition' && hasIngredients && (
          <div className="px-5 py-5 border-t border-gray-50">
            <RecipeNutritionSummary
              ingredients={allIngredients}
              servings={getServings(recipe)}
              recipeName={recipeName}
            />
          </div>
        )}

        {visibleRecipeTab === 'ask' && (
          <div className="px-5 py-5 border-t border-gray-50">
            <RecipeAskPanel
              question={askQuestion}
              response={askAnswer}
              onAsk={handleAskRecipe}
              loading={askLoading}
            />
          </div>
        )}


      </div>

      {hasSteps && (
        <CookModeModal
          isOpen={isCookModeOpen}
          recipeId={recipeId}
          recipeName={recipeName}
          instructions={allInstructions}
          ingredients={allIngredients}
          initialStepIndex={savedCookStep || 0}
          onClose={() => setIsCookModeOpen(false)}
          onProgressChange={(stepIndex: number) => setSavedCookStep(stepIndex)}
          onComplete={() => setSavedCookStep(null)}
        />
      )}
    </>
  );
};

export default RecipeDetailsCard;
