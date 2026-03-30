import { API_BASE } from "../utils/api";
// src/components/RecipeComponents.tsx

import React from 'react';
import { ChefHat, Clock, Flame, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// ============================================================
// TYPES
// ============================================================

export interface RecipeIngredient {
  quantity?: string | number | null;
  unit?: string | null;
  item?: string | null;
  name?: string | null;
  note?: string | null;
  emoji?: string | null;
}

export interface RecipeIngredientGroup {
  title: string;
  items: RecipeIngredient[];
}

export interface Recipe {
  title?: string;
  servings?: string | null;
  prep_time?: string | null;
  cook_time?: string | null;
  total_time?: string | null;
  ingredients?: RecipeIngredient[];
  ingredients_groups?: RecipeIngredientGroup[] | null;
  instructions: string[];
  tips?: string[];
  notes?: string[];
}

// Props as used in VideoDetailDesktop.tsx
interface RecipeMetaProps {
  recipe: Recipe;
  servingScale: number;
  setServingScale: (v: number) => void;
  showOriginal: boolean;
}

interface IngredientsProps {
  recipe: Recipe;
  servingScale: number;
  useMetric: boolean;
  setUseMetric: (v: boolean) => void;
  scaleQuantity: (qty: string, scale: number) => string;
  convertToMetric: (qty: string) => string;
  convertToImperial: (qty: string) => string;
  parseQuantity: (qty: string) => { val: string; unit: string };
  showOriginal: boolean;
  caption?: string;
}

interface StepsProps {
  recipe: Recipe;
  showOriginal: boolean;
}

// ============================================================
// HELPER: Ingredient Row (color + NaN-safe)
// ============================================================

interface IngredientRowProps {
  ingredient: RecipeIngredient;
  servingScale: number;
  scaleQuantity: (qty: string, scale: number) => string;
}

const IngredientRow: React.FC<IngredientRowProps> = ({
  ingredient,
  servingScale,
  scaleQuantity,
}) => {
  // Base label: prefer item, fall back to name
  const baseLabel = (ingredient.item || ingredient.name || '').trim();

  // Optional note, either explicit or from (...) in label
  let mainLabel = baseLabel;
  let note = (ingredient.note || '').trim();
  if (!note && baseLabel) {
    const m = baseLabel.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (m) {
      mainLabel = m[1].trim();
      note = m[2].trim();
    }
  }

  // Quantity: keep as plain string, but allow scaling if safe
  const rawQuantity =
    ingredient.quantity !== undefined && ingredient.quantity !== null
      ? String(ingredient.quantity).trim()
      : '';

  let quantityToShow = rawQuantity;
  if (rawQuantity && servingScale !== 1) {
    const scaled = scaleQuantity(rawQuantity, servingScale);
    // NaN guard: if scaling fails, fall back to original
    if (scaled && !scaled.includes('NaN') && scaled.trim() !== '') {
      quantityToShow = scaled;
    }
  }

  const unitToShow = (ingredient.unit || '').toString().trim();

  return (
    <li className="flex items-start gap-3 group py-1">
      <div className="mt-1.5 min-w-[16px]">
        <div className="w-3 h-3 rounded-full border border-gray-300 group-hover:border-tertiary-400 group-hover:bg-tertiary-100 transition-colors" />
      </div>
      <div className="text-sm font-medium leading-relaxed">
        {quantityToShow && (
          <span className="text-primary-600 font-bold mr-1">
            {quantityToShow}
          </span>
        )}
        {unitToShow && (
          <span className="text-gray-900 font-bold mr-1.5">
            {unitToShow}
          </span>
        )}
        {mainLabel && (
          <span className="text-gray-700">
            {mainLabel}
          </span>
        )}
        {note && (
          <span className="text-gray-400 italic ml-1">
            ({note})
          </span>
        )}
      </div>
    </li>
  );
};

// ============================================================
// RECIPE META (top details block)
// ============================================================

export const RecipeMeta: React.FC<RecipeMetaProps> = ({
  recipe,
  servingScale,
  setServingScale,
  showOriginal,
}) => {
  const { t } = useTranslation(['videoDetail']);
  const prepTimeRaw = (recipe.prep_time || '').trim();
  const cookTimeRaw = (recipe.cook_time || '').trim();
  const servingsRaw = (recipe.servings || '').trim();

  const displayPrepTime = prepTimeRaw || '—';
  const displayCookTime = cookTimeRaw || '—';
  const displayServings = servingsRaw || '—';

  // Keep the console signature you already have in logs
  console.log('🔍 RecipeMeta selectedRecipe:', {
    recipe,
    prepTimeRaw,
    cookTimeRaw,
    displayPrepTime,
    displayCookTime,
    servingScale,
    showOriginal,
  });

  return (
    <div className="bg-white border border-gray-100 rounded-[24px] shadow-sm overflow-hidden mb-6">
      {/* Header */}
      <div className="bg-tertiary-50/50 p-5 border-b border-gray-50 flex items-center gap-3">
        <ChefHat className="text-tertiary-600" size={20} />
        <h3 className="font-bold text-gray-900 text-lg">
          {t('videoDetail:recipeDetails', 'Recipe Details')}
        </h3>
      </div>

      {/* Grid: Prep / Cook / Yields */}
      <div className="grid grid-cols-3 divide-x divide-gray-50 border-b border-gray-50">
        <div className="p-4 flex flex-col items-center justify-center text-center gap-1">
          <Clock className="text-tertiary-500 mb-1" size={16} />
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            {t('videoDetail:prep', 'Prep')}
          </span>
          <span className="text-sm font-bold text-gray-900">
            {displayPrepTime}
          </span>
        </div>

        <div className="p-4 flex flex-col items-center justify-center text-center gap-1">
          <Flame className="text-tertiary-500 mb-1" size={16} />
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            {t('videoDetail:cook', 'Cook')}
          </span>
          <span className="text-sm font-bold text-gray-900">
            {displayCookTime}
          </span>
        </div>

        <div className="p-4 flex flex-col items-center justify-center text-center gap-1">
          <Users className="text-tertiary-500 mb-1" size={16} />
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            {t('videoDetail:servings', 'Servings')}
          </span>
          <span className="text-sm font-bold text-gray-900">
            {displayServings}
          </span>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// INGREDIENTS (center block inside details card)
// ============================================================

export const Ingredients: React.FC<IngredientsProps> = ({
  recipe,
  servingScale,
  useMetric,
  setUseMetric,
  scaleQuantity,
  convertToMetric,
  convertToImperial,
  parseQuantity,
  showOriginal,
  caption,
}) => {
  const { t } = useTranslation(['videoDetail']);
  const groups = Array.isArray(recipe.ingredients_groups)
    ? recipe.ingredients_groups
    : [];
  const flat = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];

  console.log('🔍 ING selectedRecipe:', {
    title: recipe.title,
    servings: recipe.servings,
    prep_time: recipe.prep_time,
    cook_time: recipe.cook_time,
    total_time: recipe.total_time,
  });
  console.log('🔍 ING.ingredients length:', flat.length);
  console.log('🔍 ING.ingredients_groups:', groups);
  console.log(
    '🔍 ING.caption (first lines):',
    (caption || '').split('\n').slice(0, 6),
  );

  const hasGroups = groups.length > 0;
  const hasFlat = flat.length > 0;

  if (!hasGroups && !hasFlat) {
    return null;
  }

  return (
    <div className="p-6 border-b border-gray-50">
      <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">
        {t('videoDetail:ingredients', 'Ingredients')}
      </h4>

      <div className="space-y-6">
        {hasGroups
          ? groups.map((group, idx) => (
              <div key={idx} className="relative">
                {idx > 0 && (
                  <div className="absolute -top-3 left-0 right-0 border-t border-dashed border-gray-100" />
                )}
                <h5 className="font-bold text-gray-900 text-sm mb-3 bg-gray-50 inline-block px-2 py-1 rounded-lg">
                  {group.title}
                </h5>
                <ul className="space-y-1">
                  {group.items.map((ing, i) => (
                    <IngredientRow
                      key={i}
                      ingredient={ing}
                      servingScale={servingScale}
                      scaleQuantity={scaleQuantity}
                    />
                  ))}
                </ul>
              </div>
            ))
          : (
            <ul className="space-y-1">
              {flat.map((ing, i) => (
                <IngredientRow
                  key={i}
                  ingredient={ing}
                  servingScale={servingScale}
                  scaleQuantity={scaleQuantity}
                />
              ))}
            </ul>
          )}
      </div>
    </div>
  );
};

// ============================================================
// STEPS (method block)
// ============================================================

export const Steps: React.FC<StepsProps> = ({ recipe }) => {
  const { t } = useTranslation(['videoDetail']);
  console.log('🔍 Steps selectedRecipe:', {
    title: recipe.title,
    servings: recipe.servings,
    prep_time: recipe.prep_time,
    cook_time: recipe.cook_time,
    total_time: recipe.total_time,
  });

  const steps = Array.isArray(recipe.instructions)
    ? recipe.instructions
    : [];

  if (!steps.length) {
    return null;
  }

  return (
    <div className="p-6 bg-gray-50/30">
      <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">
        {t('videoDetail:method', 'Method')}
      </h4>
      <div className="space-y-6">
        {steps.map((step, i) => (
          <div key={i} className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-xs font-bold text-tertiary-600">
                {i + 1}
              </div>
            </div>
            <p className="text-sm font-medium text-gray-600 leading-relaxed pt-1.5">
              {step}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};