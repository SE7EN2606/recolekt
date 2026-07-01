import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChefHat, ChevronDown, Pencil, Plus, ShoppingBasket, Trash2, X } from 'lucide-react';
import RecipeNutritionSummary from '../features/recipe-secondary/RecipeNutritionSummary';
import RecipeStepsPanel from '../features/recipe-core/panels/RecipeStepsPanel';
import RecipeAskPanel from '../features/recipe-core/panels/RecipeAskPanel';
import useRecipeAssistant from '../features/recipe-assistant/useRecipeAssistant';
import IngredientRow from '../features/recipe-core/rows/IngredientRow';
import RecipeCompilationCard from '../features/recipe-core/cards/RecipeCompilationCard';
import {
  assumedLabel,
  formatQty,
  normalizeIngredientSections,
  normalizeInstructionSections,
  parseRawIngredient,
} from '../features/recipe-core/recipePayload';
import CookModeModal from './CookModeModal';
import useRecipeCookSession from '../features/recipe-cook-session/useRecipeCookSession';
import {
  getIngredientEditText,
  getStepEditText,
  useRecipeEditing,
} from '../features/recipe-editing/useRecipeEditing';
import { markPerfStep } from '../lib/perf';

export type RecipeTabKey = 'ingredients' | 'steps' | 'nutrition' | 'ask' | 'source';

export interface RecipeDetailsCardProps {
  recipe?: any;
  recipeId?: string;
  recipeName?: string;
  servingScale?: number;
  onServingScaleChange?: (scale: number) => void;
  scaleQuantity?: (qty: string, scale: number) => string;
  useMetric?: boolean;
  onToggleMetric?: (val: boolean) => void;
  temperatureUnit?: 'celsius' | 'fahrenheit';
  recipeConversion?: 'do_not_convert' | 'smart' | 'always';
  volumePreference?: 'metric' | 'us';
  rounding?: 'rounded' | 'exact';
  onMarkCooked?: () => void;
  onAddCookingNote?: () => void;
  hasActiveSession?: boolean;
  cookStatusLoading?: boolean;
  openCookModeSignal?: number;
  secondaryAction?: React.ReactNode;
  showStartCookingButton?: boolean;
  showRecipeHeader?: boolean;
  headerContent?: React.ReactNode;
  activeTab?: RecipeTabKey;
  embedded?: boolean;
  askPlacement?: 'gated' | 'persistent' | 'hidden';
  askInitiallyCollapsed?: boolean;
  askVisible?: boolean;
  flatSections?: boolean;
  ingredientsHeaderContent?: React.ReactNode;
  ingredientsActionContent?: React.ReactNode;
  ingredientsServingContent?: React.ReactNode;
  ingredientsFooterContent?: React.ReactNode;
  stepsHeaderContent?: React.ReactNode;
  sourceContent?: React.ReactNode;
}

const RECIPE_LIST_MARKER_COLUMN = '40px';
const RECIPE_LIST_AMOUNT_COLUMN = '96px';
const RECIPE_LIST_MARKER_SIZE = 24;

function sectionCardClass(tone: 'default' | 'warm' = 'default') {
  if (tone === 'warm') {
    return 'overflow-hidden rounded-[26px] border border-white/75 bg-white/90 backdrop-blur-sm p-5 sm:p-6 shadow-[0_4px_18px_rgba(15,23,42,0.06)]';
  }
  return 'overflow-hidden rounded-[26px] border border-white/75 bg-white/90 backdrop-blur-sm p-5 sm:p-6 shadow-[0_4px_18px_rgba(15,23,42,0.06)]';
}

function sliceInstructionSections(sections: Array<{ title?: string; instructions: any[] }>, limit: number) {
  let remaining = limit;
  return sections
    .map((section) => {
      if (remaining <= 0) return null;
      const instructions = section.instructions.slice(0, remaining);
      remaining -= instructions.length;
      if (instructions.length === 0) return null;
      return { ...section, instructions };
    })
    .filter(Boolean) as Array<{ title?: string; instructions: any[] }>;
}

function sliceIngredientSections(sections: Array<{ title?: string; items: any[] }>, limit: number) {
  let remaining = limit;
  return sections
    .map((section) => {
      if (remaining <= 0) return null;
      const items = section.items.slice(0, remaining);
      remaining -= items.length;
      if (items.length === 0) return null;
      return { ...section, items };
    })
    .filter(Boolean) as Array<{ title?: string; items: any[] }>;
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
  onServingScaleChange,
  scaleQuantity,
  useMetric = true,
  onToggleMetric,
  temperatureUnit = 'celsius',
  recipeConversion = 'smart',
  volumePreference = 'metric',
  rounding = 'rounded',
  onMarkCooked,
  onAddCookingNote,
  hasActiveSession = false,
  cookStatusLoading = false,
  openCookModeSignal = 0,
  secondaryAction,
  showStartCookingButton = true,
  showRecipeHeader = true,
  headerContent,
  activeTab,
  embedded = false,
  askPlacement = 'gated',
  askInitiallyCollapsed = false,
  askVisible = true,
  flatSections = false,
  ingredientsHeaderContent,
  ingredientsActionContent,
  ingredientsServingContent,
  ingredientsFooterContent,
  stepsHeaderContent,
  sourceContent,
}) => {
  const [isCookModeOpen, setIsCookModeOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(!askInitiallyCollapsed);
  const cookSessionEnabled = Boolean(recipeId && recipeId !== 'recipe');
  const {
    currentStepIndex,
    checkedIngredientIds,
    completedStepIds,
    setCurrentStepIndex,
    toggleCheckedIngredientId,
    setCheckedIngredientIds,
    toggleCompletedStepId,
    markCompletedStepId,
    completeSession,
  } = useRecipeCookSession(recipeId, cookSessionEnabled);

  const {
    askQuestion,
    askAnswer,
    askLoading,
    handleAskRecipe,
  } = useRecipeAssistant({ recipeId });

  const showStartCooking = showStartCookingButton;

  const baseIngredientSections = useMemo(
    () => (!recipe || recipe.is_compilation ? [] : normalizeIngredientSections(recipe)),
    [recipe]
  );

  const baseInstructionSections = useMemo(
    () => (!recipe || recipe.is_compilation ? [] : normalizeInstructionSections(recipe)),
    [recipe]
  );

  const {
    isEditing,
    setIsEditing,
    overrides: recipeOverrides,
    loadingOverrides,
    savingOverrides,
    overridesSaved,
    overrideError,
    editedIngredientSections: ingredientSections,
    editedInstructionSections: instructionSections,
    editableIngredientSections,
    editableInstructionSections,
    updateIngredient,
    addIngredient,
    removeIngredient,
    updateStep,
    toggleVerified,
  } = useRecipeEditing(recipeId, baseIngredientSections, baseInstructionSections);

  const allIngredients = useMemo(() => ingredientSections.flatMap((section) => section.items), [ingredientSections]);
  const cookModeIngredients = useMemo(
    () =>
      ingredientSections.flatMap((section, sectionIndex) =>
        section.items.map((item, itemIndex) => {
          const id = `section-${sectionIndex}-ingredient-${itemIndex}`;
          return typeof item === 'string' ? { item, id } : { ...item, id };
        })
      ),
    [ingredientSections]
  );
  const cookModeIngredientSections = useMemo(
    () =>
      ingredientSections.map((section, sectionIndex) => ({
        title: section.title,
        items: section.items.map((item, itemIndex) => {
          const id = `section-${sectionIndex}-ingredient-${itemIndex}`;
          return typeof item === 'string' ? { item, id } : { ...item, id };
        }),
      })),
    [ingredientSections]
  );
  const allInstructions = useMemo(() => instructionSections.flatMap((section) => section.instructions), [instructionSections]);
  const hasIngredients = allIngredients.length > 0;
  const hasSteps = allInstructions.length > 0;
  const ingredientCountLabel = `${allIngredients.length} ${allIngredients.length === 1 ? 'item' : 'items'}`;
  const stepCountLabel = `${allInstructions.length} ${allInstructions.length === 1 ? 'step' : 'steps'}`;
  const recipeBodyLoading = loadingOverrides && !isEditing;
  const cookModeLoading = recipeBodyLoading || cookStatusLoading;
  const [ingredientsExpanded, setIngredientsExpanded] = useState(false);
  const [stepsExpanded, setStepsExpanded] = useState(false);
  const previewIngredientSections = useMemo(
    () => sliceIngredientSections(ingredientSections, 4),
    [ingredientSections]
  );
  const previewInstructionSections = useMemo(
    () => sliceInstructionSections(instructionSections, 4),
    [instructionSections]
  );
  const displayedIngredientSections = isEditing || ingredientsExpanded ? ingredientSections : previewIngredientSections;
  const displayedInstructionSections = isEditing || stepsExpanded ? instructionSections : previewInstructionSections;
  const hasHiddenIngredients = !isEditing && allIngredients.length > 4;
  const hasHiddenSteps = !isEditing && allInstructions.length > 4;
  const showIngredientsSection = !activeTab || activeTab === 'ingredients';
  const showStepsSection = !activeTab || activeTab === 'steps';
  const showNutritionSection = hasIngredients && (!activeTab || activeTab === 'nutrition');
  const showAskSection = askPlacement === 'persistent'
    ? true
    : askPlacement === 'gated'
      ? (!activeTab || activeTab === 'ask')
      : false;
  const ingredientLayoutClass =
    !isEditing
      ? 'space-y-0'
      : 'space-y-4';
  const sharedListBodyClass = 'border-y border-gray-100';
  const checkedIngredientCount = useMemo(
    () =>
      ingredientSections.reduce((total, section, sectionIndex) => (
        total + section.items.reduce((sectionTotal, _item, itemIndex) => (
          sectionTotal + (checkedIngredientIds.has(`section-${sectionIndex}-ingredient-${itemIndex}`) ? 1 : 0)
        ), 0)
      ), 0),
    [ingredientSections, checkedIngredientIds]
  );

  const checkedSteps = useMemo(
    () =>
      new Set(
        [...completedStepIds]
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value))
      ),
    [completedStepIds]
  );

  const handleCookModeComplete = () => {
    completeSession();
    onMarkCooked?.();
  };

  useEffect(() => {
    markPerfStep('RecipeDetailsCard first rendered');
  }, []);

  useEffect(() => {
    if (openCookModeSignal > 0 && hasSteps && !cookModeLoading) {
      setIsCookModeOpen(true);
    }
  }, [openCookModeSignal, hasSteps, cookModeLoading]);

  useEffect(() => {
    setAskOpen(!askInitiallyCollapsed);
  }, [askInitiallyCollapsed, recipeId]);

  if (!recipe) return null;
  if (recipe.is_compilation) return <RecipeCompilationCard recipe={recipe} />;
  if (!hasIngredients && !hasSteps) return null;

  const sectionClass = flatSections
    ? 'py-4 sm:px-5 sm:py-5'
    : sectionCardClass();
  const flatSectionCardClass = 'rounded-[20px] border border-white/75 bg-white/90 px-4 py-4 shadow-[0_4px_18px_rgba(15,23,42,0.06)]';

  return (
    <>
      <div className={embedded ? 'space-y-5' : 'mt-3 mb-6 space-y-5'}>
        {hasSteps && showStartCooking && (
          <section className="rounded-[26px] border border-green-100/80 bg-gradient-to-br from-green-50 to-emerald-50 p-4 shadow-[0_8px_26px_rgba(22,163,74,0.10)] sm:p-5">
            <button
              type="button"
              onClick={() => setIsCookModeOpen(true)}
              disabled={cookModeLoading}
              className="flex min-h-[58px] w-full items-center justify-center gap-2 rounded-2xl bg-green-600 px-5 py-4 text-[15px] font-bold text-white shadow-sm transition-colors hover:bg-green-700 active:bg-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ChefHat size={18} aria-hidden="true" />
              {cookModeLoading ? 'Loading recipe state...' : hasActiveSession ? 'Resume cooking' : 'Start cooking'}
            </button>
            {secondaryAction && <div className="mt-3">{secondaryAction}</div>}
          </section>
        )}

        {(showRecipeHeader || isEditing || headerContent) && (
          <section className={sectionClass}>
            {showRecipeHeader && (
              <div className="-mx-5 -mt-5 mb-4 flex items-start justify-between gap-3 border-b border-gray-100/80 bg-gradient-to-br from-primary-50/80 to-secondary-50/50 px-5 pt-5 pb-4 sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-6">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-100 to-secondary-100 text-secondary-600">
                      <ChefHat size={18} aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">Recipe details</p>
                      <h3 className="mt-1 text-[16px] font-bold tracking-tight text-gray-900">Times and setup</h3>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing((value) => !value)}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-600 shadow-sm ring-1 ring-rose-100 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                    aria-label={isEditing ? 'Done editing recipe' : 'Edit recipe'}
                  >
                    {isEditing ? <X size={14} aria-hidden="true" /> : <Pencil size={14} aria-hidden="true" />}
                  </button>
                  {onToggleMetric && hasIngredients && (
                    <button
                      type="button"
                      onClick={() => onToggleMetric(!useMetric)}
                      className="rounded-full border border-rose-100 bg-white px-3 py-1.5 text-xs font-bold text-gray-800 shadow-sm transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                    >
                      {useMetric ? 'Imperial' : 'Metric'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {isEditing && (
              <div className={`${showRecipeHeader ? 'mt-4' : ''} rounded-2xl border border-amber-100 bg-amber-50/65 px-4 py-3`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[12px] font-black uppercase tracking-widest text-amber-700">Personal recipe edits</p>
                    <p className="mt-0.5 text-xs font-medium text-amber-800/75">
                      {loadingOverrides
                        ? 'Loading your recipe edits...'
                        : overrideError
                          ? overrideError
                          : savingOverrides
                            ? 'Saving edits...'
                            : overridesSaved
                              ? 'Saved. The extracted recipe stays unchanged.'
                              : 'Your changes save as personal overrides. The extracted recipe stays unchanged.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={toggleVerified}
                    className={`inline-flex items-center justify-center gap-2 rounded-2xl px-3.5 py-2 text-xs font-black transition-colors ${
                      recipeOverrides.verifiedByUser
                        ? 'border border-gray-200 bg-white text-gray-800 hover:bg-gray-50'
                        : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    <CheckCircle2 size={15} aria-hidden="true" />
                    {recipeOverrides.verifiedByUser ? 'Verified by me' : 'Mark verified by me'}
                  </button>
                </div>
              </div>
            )}

            {headerContent && (
              <div className={showRecipeHeader || isEditing ? 'mt-3' : ''}>
                {headerContent}
              </div>
            )}
          </section>
        )}

        {recipeBodyLoading ? (
          <div className={sectionCardClass()} aria-label="Loading your recipe edits">
            <div className="space-y-5">
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="h-4 w-24 animate-pulse rounded-full bg-gray-100" />
                  <div className="h-6 w-16 animate-pulse rounded-full bg-gray-100" />
                </div>
                <div className="space-y-2">
                  {[0, 1, 2].map((item) => (
                    <div key={item} className="h-11 animate-pulse rounded-2xl bg-gray-100" />
                  ))}
                </div>
              </div>
              <div className="rounded-2xl bg-amber-50/60 p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="h-4 w-16 animate-pulse rounded-full bg-amber-100" />
                  <div className="h-6 w-14 animate-pulse rounded-full bg-white/80" />
                </div>
                <div className="space-y-3">
                  {[0, 1].map((item) => (
                    <div key={item} className="h-16 animate-pulse rounded-2xl bg-white/80" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
          {hasIngredients && showIngredientsSection && (
            <section className={sectionClass}>
              <div className={flatSections ? flatSectionCardClass : ''}>
                {ingredientsHeaderContent && (
                  <div className={`mb-4 ${flatSections ? '' : 'border-b border-slate-100 pb-4'}`}>
                    {ingredientsHeaderContent}
                  </div>
                )}
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h4 className="text-[19px] font-bold tracking-tight text-gray-950">Ingredients</h4>
                      <span className="rounded-full bg-primary-50 px-2.5 py-1 text-[11px] font-bold text-primary-700 ring-1 ring-primary-100">
                        {`${checkedIngredientCount}/${allIngredients.length}`}
                      </span>
                    </div>
                  </div>

                  {ingredientsActionContent ?? (onServingScaleChange && (
                    <div className="flex shrink-0 items-center gap-2 rounded-full border border-gray-200 bg-white px-2.5 py-1.5 shadow-sm">
                      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-gray-400">Yields</span>
                      <button
                        type="button"
                        onClick={() => {
                          const base = getServings(recipe);
                          const next = Math.max(1, Math.round(base * servingScale) - 1);
                          onServingScaleChange(next / base);
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-[15px] font-black text-gray-700 transition hover:bg-gray-100"
                        aria-label="Decrease yield"
                      >
                        −
                      </button>
                      <span className="min-w-[2ch] text-center text-[16px] font-black tabular-nums text-gray-950">
                        {Math.round(getServings(recipe) * servingScale)}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const base = getServings(recipe);
                          const next = Math.round(base * servingScale) + 1;
                          onServingScaleChange(next / base);
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-[15px] font-black text-gray-700 transition hover:bg-gray-100"
                        aria-label="Increase yield"
                      >
                        +
                      </button>
                    </div>
                  ))}
                </div>

                {ingredientsServingContent && (
                  <div className="mb-4">
                    {ingredientsServingContent}
                  </div>
                )}

                <div className="space-y-5">
                  {(isEditing ? editableIngredientSections : displayedIngredientSections).map((section, sectionIndex) => (
                    <div key={sectionIndex}>
                      {section.title && (
                        <h5 className={isEditing ? 'pb-2 text-[11px] font-black uppercase tracking-widest text-gray-400' : 'pb-2.5 text-[11px] font-black uppercase tracking-[0.12em] text-gray-400'}>
                          {section.title}
                        </h5>
                      )}

                      {isEditing ? (
                        <div className="space-y-2">
                          {section.items.map((entry: any) => (
                            <div key={entry.id} className="flex items-center gap-2 rounded-2xl border border-gray-100 bg-gray-50/70 p-2">
                              <input
                                value={getIngredientEditText(entry.value)}
                                onChange={(event) => updateIngredient(entry.id, event.target.value)}
                                className="min-w-0 flex-1 rounded-xl border border-transparent bg-white px-3 py-2 text-sm font-medium text-gray-800 outline-none transition-colors focus:border-amber-200 focus:ring-2 focus:ring-amber-100"
                                placeholder="Add ingredient"
                              />
                              <button
                                type="button"
                                onClick={() => removeIngredient(entry.id)}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-rose-700 transition-colors hover:bg-rose-50"
                                aria-label="Remove ingredient"
                              >
                                <Trash2 size={15} aria-hidden="true" />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => addIngredient(sectionIndex)}
                            className="inline-flex items-center gap-2 rounded-2xl border border-dashed border-amber-200 bg-white px-3.5 py-2 text-xs font-black text-amber-700 transition-colors hover:bg-amber-50"
                          >
                            <Plus size={14} aria-hidden="true" />
                            Add ingredient
                          </button>
                        </div>
                      ) : (
                        <ul className={`${ingredientLayoutClass} ${sharedListBodyClass}`}>
                          {section.items.map((item, itemIndex) => (
                            <IngredientRow
                              key={'section-' + sectionIndex + '-ingredient-' + itemIndex}
                              id={'section-' + sectionIndex + '-ingredient-' + itemIndex}
                              raw={item}
                              servingScale={servingScale}
                              scaleQuantity={scaleQuantity}
                              checked={checkedIngredientIds.has('section-' + sectionIndex + '-ingredient-' + itemIndex)}
                              onToggle={toggleCheckedIngredientId}
                              useMetric={useMetric}
                              recipeConversion={recipeConversion}
                              volumePreference={volumePreference}
                              rounding={rounding}
                              parseRawIngredient={parseRawIngredient}
                              formatQty={formatQty}
                              assumedLabel={assumedLabel}
                              markerColumnWidth={RECIPE_LIST_MARKER_COLUMN}
                              amountColumnWidth={RECIPE_LIST_AMOUNT_COLUMN}
                              markerSize={RECIPE_LIST_MARKER_SIZE}
                            />
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
                {hasHiddenIngredients && (
                  <button
                    type="button"
                    onClick={() => setIngredientsExpanded((value) => !value)}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-primary-100 bg-primary-50/70 py-3 text-sm font-bold text-primary-700 transition-colors hover:bg-primary-100"
                  >
                    {ingredientsExpanded ? 'Show fewer ingredients' : 'View all ' + allIngredients.length + ' ingredients'}
                  </button>
                )}
                {ingredientsFooterContent && (
                  <div className="mt-5">
                    {ingredientsFooterContent}
                  </div>
                )}
              </div>
            </section>
          )}

          {hasSteps && showStepsSection && (
            <section className={sectionClass}>
              {flatSections && stepsHeaderContent ? (
                <div className={`mb-4 ${flatSectionCardClass}`}>
                  {stepsHeaderContent}
                </div>
              ) : stepsHeaderContent ? (
                <div className="mb-4 border-b border-slate-100 pb-4">
                  {stepsHeaderContent}
                </div>
              ) : null}
              <div className={flatSections ? flatSectionCardClass : ''}>
                <div className="mb-4">
                  <div className="flex items-center gap-2.5">
                    <h4 className="text-[19px] font-bold tracking-tight text-gray-950">Directions</h4>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-500">
                      {stepCountLabel}
                    </span>
                  </div>
                </div>
              {isEditing ? (
                <div className="space-y-4">
                  {editableInstructionSections.map((section, sectionIndex) => (
                    <div key={sectionIndex} className="space-y-3">
                      {section.title && (
                        <h5 className="text-[11px] font-black uppercase tracking-widest text-gray-400">
                          {section.title}
                        </h5>
                      )}
                      {section.instructions.map((entry: any, stepIndex: number) => (
                        <label key={entry.id} className="flex gap-3">
                          <span className="mt-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[11px] font-black text-amber-700">
                            {stepIndex + 1}
                          </span>
                          <textarea
                            value={getStepEditText(entry.value)}
                            onChange={(event) => updateStep(entry.id, event.target.value)}
                            className="min-h-[74px] flex-1 resize-y rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium leading-relaxed text-gray-800 outline-none transition-colors focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                            placeholder="Edit step"
                          />
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <RecipeStepsPanel
                    instructionSections={displayedInstructionSections}
                    checkedSteps={checkedSteps}
                    toggleStep={toggleCompletedStepId}
                    temperatureUnit={temperatureUnit}
                    markerColumnWidth={RECIPE_LIST_MARKER_COLUMN}
                    markerSize={RECIPE_LIST_MARKER_SIZE}
                    bodyClass={flatSections ? '' : sharedListBodyClass}
                    lineFree={flatSections}
                  />
                  {hasHiddenSteps && (
                    <button
                      type="button"
                      onClick={() => setStepsExpanded((value) => !value)}
                      className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-primary-100 bg-primary-50/70 py-3 text-sm font-bold text-primary-700 transition-colors hover:bg-primary-100"
                    >
                      {stepsExpanded ? 'Show fewer steps' : 'View all ' + allInstructions.length + ' steps'}
                    </button>
                  )}
                </>
              )}
              </div>
            </section>
          )}

          {!recipeBodyLoading && showAskSection && (
            <section
              className={`relative overflow-hidden ${flatSections ? 'mb-4 rounded-[22px]' : 'rounded-[26px]'} bg-gradient-to-br from-primary-600 to-secondary-600 p-5 shadow-[0_20px_44px_-14px_rgba(15,23,42,0.28)] sm:p-6 ${
                askVisible ? '' : 'hidden'
              }`}
              aria-hidden={!askVisible}
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(130%_90%_at_100%_0%,rgba(255,255,255,0.22),rgba(255,255,255,0)_58%)]" />
              {askPlacement === 'persistent' || askInitiallyCollapsed ? (
                <>
                  <button
                    type="button"
                    onClick={() => setAskOpen((value) => !value)}
                    className="relative flex w-full items-center justify-between gap-3 text-left"
                    aria-expanded={askOpen}
                  >
                    <div className="min-w-0">
                      <div className="mb-4 flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white/20">
                          <ChefHat size={17} aria-hidden="true" className="text-white" />
                        </span>
                        <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Recipe Assistant</span>
                        <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10.5px] font-black text-white">AI</span>
                      </div>
                      <h4 className="relative mb-1.5 text-xl font-black tracking-tight text-white sm:text-2xl">Tweak it, make it yours</h4>
                      <p className="relative text-sm font-medium leading-relaxed text-white/80">
                        Ask for swaps, scaling help, or ways to adapt it to how you cook.
                      </p>
                    </div>
                    <ChevronDown
                      size={18}
                      className={`shrink-0 text-white/80 transition-transform duration-200 ${askOpen ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                  {askOpen && (
                    <div className="relative mt-4">
                      <RecipeAskPanel
                        question={askQuestion}
                        response={askAnswer}
                        onAsk={handleAskRecipe}
                        loading={askLoading}
                      />
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="relative mb-4 flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white/20">
                      <ChefHat size={17} aria-hidden="true" className="text-white" />
                    </span>
                    <span className="text-[11px] font-black uppercase tracking-widest text-white/90">Recipe Assistant</span>
                    <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10.5px] font-black text-white">AI</span>
                  </div>
                  <h4 className="relative mb-1.5 text-xl font-black tracking-tight text-white sm:text-2xl">Tweak it, make it yours</h4>
                  <p className="relative mb-4 text-sm font-medium leading-relaxed text-white/80">
                    Ask for swaps, scaling help, or ways to adapt it to how you cook.
                  </p>
                  <RecipeAskPanel
                    question={askQuestion}
                    response={askAnswer}
                    onAsk={handleAskRecipe}
                    loading={askLoading}
                  />
                </>
              )}
            </section>
          )}

          {!recipeBodyLoading && showNutritionSection && (
            <div className={flatSections ? 'py-4 sm:px-5 sm:py-5' : ''}>
              <RecipeNutritionSummary
                ingredients={allIngredients}
                servings={getServings(recipe)}
                recipeName={recipeName}
                embedded={flatSections}
              />
            </div>
          )}
          {sourceContent && activeTab === 'source' && (
            <section className={sectionClass}>
              {sourceContent}
            </section>
          )}
          </>
        )}
      </div>

      {hasSteps && (
        <CookModeModal
          isOpen={isCookModeOpen}
          recipeId={recipeId}
          recipeName={recipeName}
          instructions={allInstructions}
          ingredients={cookModeIngredients}
          ingredientSections={cookModeIngredientSections}
          checkedIngredientIds={checkedIngredientIds}
          initialStepIndex={currentStepIndex}
          servingScale={servingScale}
          onServingScaleChange={onServingScaleChange}
          scaleQuantity={scaleQuantity}
          useMetric={useMetric}
          onToggleMetric={onToggleMetric}
          temperatureUnit={temperatureUnit}
          recipeConversion={recipeConversion}
          volumePreference={volumePreference}
          rounding={rounding}
          onClose={() => setIsCookModeOpen(false)}
          onIngredientToggle={toggleCheckedIngredientId}
          onIngredientSelectAll={setCheckedIngredientIds}
          onProgressChange={setCurrentStepIndex}
          onStepComplete={markCompletedStepId}
          onComplete={handleCookModeComplete}
          onAddCookingNote={onAddCookingNote}
        />
      )}
    </>
  );
};

export default RecipeDetailsCard;
