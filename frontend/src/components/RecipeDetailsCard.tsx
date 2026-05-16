import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChefHat, Pencil, Plus, Trash2, X } from 'lucide-react';
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
import { useTranslation } from 'react-i18next';
import CookModeModal from './CookModeModal';
import useRecipeCookSession from '../features/recipe-cook-session/useRecipeCookSession';
import {
  getIngredientEditText,
  getStepEditText,
  useRecipeEditing,
} from '../features/recipe-editing/useRecipeEditing';

type RecipeSecondaryTabKey = 'nutrition' | 'ask';

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
}) => {
  const { t } = useTranslation(['videoDetail']);
  const [isCookModeOpen, setIsCookModeOpen] = useState(false);
  const [activeSecondaryTab, setActiveSecondaryTab] = useState<RecipeSecondaryTabKey | null>(null);
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

  const secondaryTabs = useMemo(() => {
    const tabs: { key: RecipeSecondaryTabKey; label: string }[] = [];

    if (hasIngredients) tabs.push({ key: 'nutrition', label: 'Macro' });
    tabs.push({ key: 'ask', label: 'Ask' });

    return tabs;
  }, [hasIngredients]);

  const visibleSecondaryTab = secondaryTabs.some((tab) => tab.key === activeSecondaryTab)
    ? activeSecondaryTab
    : null;
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
    if (openCookModeSignal > 0 && hasSteps && !cookModeLoading) {
      setIsCookModeOpen(true);
    }
  }, [openCookModeSignal, hasSteps, cookModeLoading]);

  if (!recipe) return null;
  if (recipe.is_compilation) return <RecipeCompilationCard recipe={recipe} />;
  if (!hasIngredients && !hasSteps) return null;

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-[22px] shadow-sm overflow-hidden mt-3 mb-6">
        <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5 border-b border-gray-100 bg-white">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
              <ChefHat size={17} aria-hidden="true" />
            </span>
            <h3 className="font-bold text-gray-900 text-base tracking-tight truncate">
              {t('videoDetail:recipeDetails', 'Recipe Details')}
            </h3>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {recipeOverrides.verifiedByUser && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700 ring-1 ring-emerald-100">
                <CheckCircle2 size={13} aria-hidden="true" />
                Verified
              </span>
            )}
            <button
              type="button"
              onClick={() => setIsEditing((value) => !value)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-[11px] font-bold text-gray-700 transition-colors hover:bg-white"
            >
              {isEditing ? <X size={13} aria-hidden="true" /> : <Pencil size={13} aria-hidden="true" />}
              {isEditing ? 'Done' : 'Edit recipe'}
            </button>
            {onToggleMetric && hasIngredients && (
              <button
                type="button"
                onClick={() => onToggleMetric(!useMetric)}
                className="px-3 py-1.5 bg-gray-50 border border-gray-200 text-gray-700 rounded-xl text-[11px] font-bold hover:bg-white transition-colors"
              >
                {useMetric ? 'Imperial' : 'Metric'}
              </button>
            )}
          </div>
        </div>

        {hasSteps && (
          <div className="px-4 py-4 sm:px-5 bg-stone-50 border-b border-gray-100">
            <button
              type="button"
              onClick={() => setIsCookModeOpen(true)}
              disabled={cookModeLoading}
              className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-gray-950 px-5 py-4 text-[15px] font-black text-white shadow-sm transition-colors hover:bg-gray-800 active:bg-gray-900"
            >
              <ChefHat size={18} aria-hidden="true" />
              {cookModeLoading ? 'Loading recipe state...' : hasActiveSession ? 'Resume cooking' : 'Cook this recipe'}
            </button>
          </div>
        )}

        {isEditing && (
          <div className="border-b border-amber-100 bg-amber-50/55 px-4 py-3 sm:px-5">
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
                    ? 'bg-emerald-600 text-white'
                    : 'border border-emerald-100 bg-white text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                <CheckCircle2 size={15} aria-hidden="true" />
                {recipeOverrides.verifiedByUser ? 'Verified by me' : 'Mark verified by me'}
              </button>
            </div>
          </div>
        )}

        {recipeBodyLoading ? (
          <div className="space-y-5 px-4 py-5 sm:px-5" aria-label="Loading your recipe edits">
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
        ) : (
        <div className="divide-y divide-gray-100">
          {hasIngredients && (
            <section className="py-5">
              <div className="px-4 sm:px-5 pb-3 flex items-center justify-between gap-3">
                <h4 className="text-[15px] font-black tracking-tight text-gray-950">Ingredients</h4>
                <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-500">
                  {ingredientCountLabel}
                </span>
              </div>

              <div className="space-y-3">
                {(isEditing ? editableIngredientSections : ingredientSections).map((section, sectionIndex) => (
                  <div key={sectionIndex}>
                    {section.title && (
                      <h5 className="px-4 sm:px-5 pb-1.5 text-[11px] font-black uppercase tracking-widest text-gray-400">
                        {section.title}
                      </h5>
                    )}

                    {isEditing ? (
                      <div className="space-y-2 px-4 sm:px-5">
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
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
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
                      <ul className="divide-y divide-gray-100">
                        {section.items.map((item, itemIndex) => {
                          const id = `section-${sectionIndex}-ingredient-${itemIndex}`;

                          return (
                            <IngredientRow
                              key={id}
                              id={id}
                              raw={item}
                              servingScale={servingScale}
                              scaleQuantity={scaleQuantity}
                              checked={checkedIngredientIds.has(id)}
                              onToggle={toggleCheckedIngredientId}
                              useMetric={useMetric}
                              recipeConversion={recipeConversion}
                              volumePreference={volumePreference}
                              rounding={rounding}
                              parseRawIngredient={parseRawIngredient}
                              formatQty={formatQty}
                              assumedLabel={assumedLabel}
                            />
                          );
                        })}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {hasSteps && (
            <section className="bg-amber-50/45 px-4 py-5 sm:px-5">
              <div className="pb-4 flex items-center justify-between gap-3">
                <h4 className="text-[15px] font-black tracking-tight text-gray-950">Steps</h4>
                <span className="shrink-0 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-bold text-amber-700 ring-1 ring-amber-100">
                  {stepCountLabel}
                </span>
              </div>
              {isEditing ? (
                <div className="space-y-4 rounded-2xl bg-white/80 p-4 ring-1 ring-amber-100/80">
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
                            className="min-h-[74px] flex-1 resize-y rounded-2xl border border-amber-100 bg-white px-3 py-2 text-sm font-medium leading-relaxed text-gray-800 outline-none transition-colors focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                            placeholder="Edit step"
                          />
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl bg-white/80 p-4 ring-1 ring-amber-100/80">
                  <RecipeStepsPanel
                    instructionSections={instructionSections}
                    checkedSteps={checkedSteps}
                    toggleStep={toggleCompletedStepId}
                    temperatureUnit={temperatureUnit}
                  />
                </div>
              )}
            </section>
          )}
        </div>
        )}

        {!recipeBodyLoading && secondaryTabs.length > 0 && (
          <div className="bg-gray-50 px-3 py-3 border-t border-gray-100">
            <div
              className="grid gap-1 rounded-2xl bg-gray-100 p-1 text-[12px] font-bold"
              style={{ gridTemplateColumns: `repeat(${secondaryTabs.length}, minmax(0, 1fr))` }}
            >
              {secondaryTabs.map((tab) => {
                const active = visibleSecondaryTab === tab.key;

                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveSecondaryTab((current) => (current === tab.key ? null : tab.key))}
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

        {!recipeBodyLoading && visibleSecondaryTab === 'nutrition' && hasIngredients && (
          <div className="border-t border-gray-50">
            <RecipeNutritionSummary
              ingredients={allIngredients}
              servings={getServings(recipe)}
              recipeName={recipeName}
            />
          </div>
        )}

        {!recipeBodyLoading && visibleSecondaryTab === 'ask' && (
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
