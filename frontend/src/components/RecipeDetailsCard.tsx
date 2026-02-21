// components/RecipeDetailsCard.tsx

import React from 'react';
import { ChefHat, Clock, Flame, Users, Lightbulb } from 'lucide-react';
import { useTranslation } from 'react-i18next'; // 🔥 IMPORT

type RawIngredient =
  | string
  | {
      quantity?: string | number | null;
      unit?: string | null;
      item?: string | null;
      name?: string | null;
      note?: string | null;
    };

export interface IngredientGroup {
  title: string;
  items: RawIngredient[];
}

export interface RecipeForCard {
  prep_time?: string | null;
  cook_time?: string | null;
  servings?: string | null;
  ingredients_groups?: IngredientGroup[] | null;
  ingredients?: RawIngredient[] | null;
  instructions: string[];
  tips?: string[];
  notes?: string[];
}

export interface RecipeDetailsCardProps {
  recipe: RecipeForCard;
  servingScale?: number;
  scaleQuantity?: (qty: string, scale: number) => string;
  onServingScaleChange?: (next: number) => void;
}

/* ------------ helpers ------------ */

function parseIngredientString(text: string) {
  let label = text.trim();
  let note = '';

  const noteMatch = label.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (noteMatch) {
    label = noteMatch[1].trim();
    note = noteMatch[2].trim();
  }

  const parts = label.split(/\s+/);
  let quantity = '';
  let unit = '';

  if (parts.length && /^\d/.test(parts[0])) {
    quantity = parts.shift() || '';
  }

  if (parts.length && !/^\d/.test(parts[0]) && parts[0].length <= 5) {
    unit = parts.shift() || '';
  }

  const item = parts.join(' ').trim();

  return {
    quantity: quantity || undefined,
    unit: unit || undefined,
    item: item || '',
    note: note || undefined,
  };
}

// Round numeric quantities to whole numbers
function formatQuantity(q: string): string {
  const n = parseFloat(q.replace(',', '.'));
  if (!Number.isFinite(n)) return q;
  return String(Math.round(n)); // nearest integer for clean display [web:576]
}

interface IngredientRowProps {
  id: string;
  raw: RawIngredient;
  servingScale: number;
  scaleQuantity?: (qty: string, scale: number) => string;
  checked: boolean;
  onToggle: (id: string) => void;
}

const IngredientRow: React.FC<IngredientRowProps> = ({
  id,
  raw,
  servingScale,
  scaleQuantity,
  checked,
  onToggle,
}) => {
  const base =
    typeof raw === 'string'
      ? parseIngredientString(raw)
      : {
          ...raw,
          ...(raw.item || raw.name
            ? {}
            : parseIngredientString(String(raw))),
        };

  const baseLabel = (base.item || base.name || '').trim();

  let mainLabel = baseLabel;
  let note = (base.note || '').trim();
  if (!note && baseLabel) {
    const m = baseLabel.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (m) {
      mainLabel = m[1].trim();
      note = m[2].trim();
    }
  }

  let quantity =
    base.quantity !== undefined && base.quantity !== null
      ? String(base.quantity).trim()
      : '';

  if (quantity && servingScale !== 1 && scaleQuantity) {
    const scaled = scaleQuantity(quantity, servingScale);
    if (scaled && !scaled.includes('NaN') && scaled.trim() !== '') {
      quantity = scaled.trim();
    }
  }

  if (quantity) {
    quantity = formatQuantity(quantity);
  }

  const unit =
    base.unit !== undefined && base.unit !== null
      ? String(base.unit).trim()
      : '';

  const rowClass =
    'recipe-ingredient-row flex items-start gap-3 py-1 cursor-pointer select-none' +
    (checked ? ' recipe-ingredient-row--checked' : '');

  const handleClick = () => onToggle(id);

  return (
    <li className={rowClass} onClick={handleClick}>
      <div className="mt-1.5 min-w-[16px]">
        <div className="recipe-ingredient-bullet" />
      </div>
      <div className="text-sm font-medium leading-relaxed">
        {quantity && (
          <span className="recipe-ingredient-qty mr-1">
            {quantity}
          </span>
        )}
        {unit && (
          <span className="recipe-ingredient-unit mr-1.5">
            {unit}
          </span>
        )}
        {mainLabel && (
          <span className="recipe-ingredient-text">
            {mainLabel}
          </span>
        )}
        {note && (
          <span className="recipe-ingredient-note ml-1">
            ({note})
          </span>
        )}
      </div>
    </li>
  );
};

/* ------------ main component ------------ */

export const RecipeDetailsCard: React.FC<RecipeDetailsCardProps> = ({
  recipe,
  servingScale = 1,
  scaleQuantity,
  onServingScaleChange,
}) => {
  const { t } = useTranslation(['videoDetail']); // 🔥 HOOK

  const prep = (recipe.prep_time || '').trim() || '—';
  const cook = (recipe.cook_time || '').trim() || '—';

  const groups: IngredientGroup[] =
    (recipe.ingredients_groups as IngredientGroup[] | null) || [];
  const flat: RawIngredient[] = recipe.ingredients || [];

  const hasGroups = groups.length > 0;
  const hasFlat = !hasGroups && flat.length > 0;

  const baseServings = React.useMemo(() => {
    const raw = (recipe.servings || '').toString();
    const m = raw.match(/(\d+(\.\d+)?)/);
    if (!m) return 1;
    const n = parseFloat(m[1]);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }, [recipe.servings]);

  const currentScale = servingScale || 1;
  const currentServings = Math.max(
    1,
    Math.round(baseServings * currentScale),
  );

  const [checkedIds, setCheckedIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [checkedSteps, setCheckedSteps] = React.useState<Set<number>>(
    () => new Set(),
  );

  const handleToggle = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleServingsDelta = (delta: number) => {
    if (!onServingScaleChange) return;
    const nextServings = Math.max(1, currentServings + delta);
    const nextScale = nextServings / baseServings;
    onServingScaleChange(Number(nextScale.toFixed(3)));
  };

  const handleStepToggle = (index: number) => {
    setCheckedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <div className="bg-white border border-gray-100 rounded-[24px] shadow-sm overflow-hidden mb-6">
      {/* Header */}
      <div className="bg-tertiary-50/50 p-5 border-b border-gray-50 flex items-center gap-3">
        <ChefHat className="recipe-header-icon" size={20} />
        <h3 className="font-bold text-gray-900 text-lg">
          {t('videoDetail:recipeDetails')}
        </h3>
      </div>

      {/* Meta grid with icons */}
      <div className="grid grid-cols-3 divide-x divide-gray-50 border-b border-gray-50">
        {/* Prep */}
        <div className="p-4 flex flex-col items-center justify-center text-center gap-1">
          <Clock className="recipe-meta-icon mb-1" size={16} />
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            {t('videoDetail:prep')}
          </span>
          <span className="text-sm font-bold text-gray-900">
            {prep}
          </span>
        </div>

        {/* Cook */}
        <div className="p-4 flex flex-col items-center justify-center text-center gap-1">
          <Flame className="recipe-meta-icon mb-1" size={16} />
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            {t('videoDetail:cook')}
          </span>
          <span className="text-sm font-bold text-gray-900">
            {cook}
          </span>
        </div>

        {/* Servings */}
        <div className="p-4 flex flex-col items-center justify-center text-center gap-1">
          <Users className="recipe-meta-icon mb-1" size={16} />
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            {t('videoDetail:servings')}
          </span>
          <div className="flex items-center gap-2 mt-0.5">
            <button
              type="button"
              onClick={() => handleServingsDelta(-1)}
              className="w-7 h-7 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center text-sm font-bold hover:bg-gray-200 transition"
            >
              −
            </button>
            <span className="text-sm font-extrabold text-gray-900 tabular-nums">
              {currentServings}
            </span>
            <button
              type="button"
              onClick={() => handleServingsDelta(1)}
              className="w-7 h-7 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center text-sm font-bold hover:bg-gray-200 transition"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Ingredients */}
      <div className="p-6 border-b border-gray-50">
        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">
          {t('videoDetail:ingredients')}
        </h4>
        <div className="space-y-6">
          {hasGroups &&
            groups.map((group, groupIdx) => (
              <div key={groupIdx} className="relative">
                {groupIdx > 0 && (
                  <div className="absolute -top-3 left-0 right-0 border-t border-dashed border-gray-100" />
                )}
                <h5 className="font-bold text-gray-900 text-sm mb-3 bg-gray-50 inline-block px-2 py-1 rounded-lg">
                  {group.title}
                </h5>
                <ul className="space-y-1">
                  {group.items.map((it, itemIdx) => {
                    const id = `g${groupIdx}-i${itemIdx}`;
                    return (
                      <IngredientRow
                        key={id}
                        id={id}
                        raw={it}
                        servingScale={currentScale}
                        scaleQuantity={scaleQuantity}
                        checked={checkedIds.has(id)}
                        onToggle={handleToggle}
                      />
                    );
                  })}
                </ul>
              </div>
            ))}

          {hasFlat && (
            <div className="relative">
              <ul className="space-y-1">
                {flat.map((it, idx) => {
                  const id = `f${idx}`;
                  return (
                    <IngredientRow
                      key={id}
                      id={id}
                      raw={it}
                      servingScale={currentScale}
                      scaleQuantity={scaleQuantity}
                      checked={checkedIds.has(id)}
                      onToggle={handleToggle}
                    />
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Directions – clickable, strikethrough */}
      {Array.isArray(recipe.instructions) &&
        recipe.instructions.length > 0 && (
          <div className="p-6 bg-gray-50/30">
            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">
              {t('videoDetail:directions')}
            </h4>
            <div className="space-y-6">
              {recipe.instructions.map((step, i) => {
                const isChecked = checkedSteps.has(i);
                return (
                  <div
                    key={i}
                    className={`flex gap-4 items-start cursor-pointer select-none transition-opacity ${
                      isChecked ? 'opacity-60' : ''
                    }`}
                    onClick={() => handleStepToggle(i)}
                  >
                    <div className="flex-shrink-0 pt-[0.1rem]">
                      <div className="recipe-step-number-circle">
                        <span className="recipe-step-number">
                          {i + 1}
                        </span>
                      </div>
                    </div>
                    <p
                      className={`text-sm font-medium text-gray-600 leading-relaxed ${
                        isChecked ? 'line-through' : ''
                      }`}
                    >
                      {step}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      {/* Tips & Notes */}
      {(recipe.tips?.length || recipe.notes?.length) && (
        <div className="bg-yellow-50/50 border-t border-yellow-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb size={18} className="text-yellow-600" />
            <h4 className="text-xs font-black text-yellow-700 uppercase tracking-widest">
              {t('videoDetail:chefsNotes')}
            </h4>
          </div>

          <div className="space-y-4">
            {recipe.tips && recipe.tips.length > 0 && (
              <ul className="space-y-2">
                {recipe.tips.map((tip, i) => (
                  <li
                    key={`tip-${i}`}
                    className="flex items-start gap-2 text-sm text-gray-700"
                  >
                    <span className="text-yellow-500 font-bold">
                      •
                    </span>
                    <span className="italic">{tip}</span>
                  </li>
                ))}
              </ul>
            )}

            {recipe.notes && recipe.notes.length > 0 && (
              <div className="pt-2">
                {recipe.notes.map((note, i) => (
                  <p
                    key={`note-${i}`}
                    className="text-sm text-gray-500 leading-relaxed"
                  >
                    <span className="font-bold text-gray-600">
                      {t('videoDetail:noteLabel')}
                    </span>{' '}
                    {note}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RecipeDetailsCard;