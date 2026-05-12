import React, { useMemo, useState } from 'react';
import { ChefHat } from 'lucide-react';
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

type RecipeSecondaryTabKey = 'nutrition' | 'ask';

export interface RecipeDetailsCardProps {
  recipe?: any;
  recipeId?: string;
  recipeName?: string;
  servingScale?: number;
  scaleQuantity?: (qty: string, scale: number) => string;
  useMetric?: boolean;
  onToggleMetric?: (val: boolean) => void;
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
  const [isCookModeOpen, setIsCookModeOpen] = useState(false);
  const [activeSecondaryTab, setActiveSecondaryTab] = useState<RecipeSecondaryTabKey | null>(null);
  const cookSessionEnabled = Boolean(recipeId && recipeId !== 'recipe');
  const {
    currentStepIndex,
    checkedIngredientIds,
    completedStepIds,
    setCurrentStepIndex,
    toggleCheckedIngredientId,
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
  const ingredientCountLabel = `${allIngredients.length} ${allIngredients.length === 1 ? 'item' : 'items'}`;
  const stepCountLabel = `${allInstructions.length} ${allInstructions.length === 1 ? 'step' : 'steps'}`;

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
              className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-gray-950 px-5 py-4 text-[15px] font-black text-white shadow-sm transition-colors hover:bg-gray-800 active:bg-gray-900"
            >
              <ChefHat size={18} aria-hidden="true" />
              Cook this recipe
            </button>
          </div>
        )}

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
                {ingredientSections.map((section, sectionIndex) => (
                  <div key={sectionIndex}>
                    {section.title && (
                      <h5 className="px-4 sm:px-5 pb-1.5 text-[11px] font-black uppercase tracking-widest text-gray-400">
                        {section.title}
                      </h5>
                    )}

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
              <div className="rounded-2xl bg-white/80 p-4 ring-1 ring-amber-100/80">
                <RecipeStepsPanel
                  instructionSections={instructionSections}
                  checkedSteps={checkedSteps}
                  toggleStep={toggleCompletedStepId}
                />
              </div>
            </section>
          )}
        </div>

        {secondaryTabs.length > 0 && (
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

        {visibleSecondaryTab === 'nutrition' && hasIngredients && (
          <div className="border-t border-gray-50">
            <RecipeNutritionSummary
              ingredients={allIngredients}
              servings={getServings(recipe)}
              recipeName={recipeName}
            />
          </div>
        )}

        {visibleSecondaryTab === 'ask' && (
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
          initialStepIndex={currentStepIndex}
          onClose={() => setIsCookModeOpen(false)}
          onProgressChange={setCurrentStepIndex}
          onStepComplete={markCompletedStepId}
          onComplete={completeSession}
        />
      )}
    </>
  );
};

export default RecipeDetailsCard;
