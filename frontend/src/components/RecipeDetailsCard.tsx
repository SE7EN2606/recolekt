import React from 'react';
import { ChefHat, Clock, Flame, Users, Lightbulb, ShoppingCart, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// ============================================================
// TYPES
// ============================================================

type RawIngredient =
  | string
  | {
      quantity?: string | number | null;
      unit?: string | null;
      item?: string | null;
      name?: string | null;
      note?: string | null;
      emoji?: string | null;
    };

export interface IngredientGroup {
  title?: string;
  group?: string;
  items: RawIngredient[];
}

export interface RecipeForCard {
  is_compilation?: boolean;
  ideas?: { headline?: string; text?: string; emoji?: string }[];
  prep_time?: string | number | null;
  cook_time?: string | number | null;
  servings?: string | number | null;
  ingredients_groups?: IngredientGroup[] | null;
  ingredients?: RawIngredient[] | null;
  instructions: string[];
  tips?: string[];
  notes?: string[];
}

// Matches GroceryItem in your types file
export interface ShoppingListItem {
  id: string;
  name: string;
  quantity?: string;
  unit?: string;
  emoji?: string;
  recipeTitle?: string;
  checked: boolean;
}

export interface RecipeDetailsCardProps {
  recipe: RecipeForCard;
  recipeId?: string;
  recipeName?: string;
  servingScale?: number;
  scaleQuantity?: (qty: string, scale: number) => string;
  onServingScaleChange?: (next: number) => void;
  useMetric?: boolean;
  onToggleMetric?: (val: boolean) => void;
  onAddToShoppingList?: (items: ShoppingListItem[]) => void;
}

// ============================================================
// HELPERS
// ============================================================

const toStr = (val: string | number | null | undefined): string =>
  val !== undefined && val !== null ? String(val) : '';

const splitTrailingEmoji = (text: string): { body: string; emoji: string } => {
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u2600-\u27BF\uFE0F\u200D]+$/u;
  const match = text.match(emojiRegex);
  if (match) return { emoji: match[0].trim(), body: text.replace(emojiRegex, '').trim() };
  return { body: text.trim(), emoji: '' };
};

function parseIngredientString(text: string) {
  let label = text.trim();
  let note = '';
  const noteMatch = label.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (noteMatch) { label = noteMatch[1].trim(); note = noteMatch[2].trim(); }
  const parts = label.split(/\s+/);
  let quantity = '';
  let unit = '';
  if (parts.length && /^\d/.test(parts[0])) {
    quantity = parts.shift() || '';
    if (parts.length && !/^\d/.test(parts[0]) && parts[0].length <= 12) {
      unit = parts.shift() || '';
    }
  }
  return {
    quantity: quantity || undefined,
    unit: unit || undefined,
    item: parts.join(' ').trim() || '',
    note: note || undefined,
  };
}

function formatQuantity(q: string): string {
  const n = parseFloat(q.replace(',', '.'));
  if (!Number.isFinite(n)) return q;
  return String(Math.round(n * 100) / 100);
}

function convertUnits(qtyStr: string, unitStr: string, toMetric: boolean) {
  if (!qtyStr || !unitStr) return { q: qtyStr, u: unitStr };
  const qty = parseFloat(qtyStr.replace(',', '.'));
  if (isNaN(qty)) return { q: qtyStr, u: unitStr };
  const u = unitStr.toLowerCase().trim().replace(/s$/, '');
  if (toMetric) {
    if (u === 'cup') return { q: formatQuantity(String(qty * 240)), u: 'ml' };
    if (u === 'tbsp' || u === 'tablespoon') return { q: formatQuantity(String(qty * 15)), u: 'ml' };
    if (u === 'tsp' || u === 'teaspoon') return { q: formatQuantity(String(qty * 5)), u: 'ml' };
    if (u === 'oz' || u === 'ounce') return { q: formatQuantity(String(qty * 28.35)), u: 'g' };
    if (u === 'lb' || u === 'pound') return { q: formatQuantity(String(qty * 453.6)), u: 'g' };
  } else {
    if (u === 'ml' || u === 'milliliter') {
      if (qty >= 240) return { q: formatQuantity(String(qty / 240)), u: 'cups' };
      if (qty >= 15) return { q: formatQuantity(String(qty / 15)), u: 'tbsp' };
      return { q: formatQuantity(String(qty / 5)), u: 'tsp' };
    }
    if (u === 'l' || u === 'liter' || u === 'litre') return { q: formatQuantity(String(qty * 4.22675)), u: 'cups' };
    if (u === 'g' || u === 'gram') return { q: formatQuantity(String(qty / 28.35)), u: 'oz' };
    if (u === 'kg' || u === 'kilogram') return { q: formatQuantity(String(qty * 2.20462)), u: 'lbs' };
  }
  return { q: qtyStr, u: unitStr };
}

// ============================================================
// INGREDIENT ROW (unchanged from original)
// ============================================================

interface IngredientRowProps {
  id: string;
  raw: RawIngredient;
  servingScale: number;
  scaleQuantity?: (qty: string, scale: number) => string;
  checked: boolean;
  onToggle: (id: string) => void;
  useMetric: boolean;
}

const IngredientRow: React.FC<IngredientRowProps> = ({
  id, raw, servingScale, scaleQuantity, checked, onToggle, useMetric,
}) => {
  let base: any = {};
  let emoji = '';

  if (typeof raw === 'string') {
    const { body, emoji: extractedEmoji } = splitTrailingEmoji(raw);
    base = parseIngredientString(body);
    emoji = extractedEmoji;
  } else {
    base = { ...raw };
    emoji = String(base.emoji || '');
    if (!base.item && !base.name) Object.assign(base, parseIngredientString(String(raw)));
  }

  const baseLabel = (base.item || base.name || '').trim();
  let mainLabel = baseLabel;
  let note = (base.note || '').trim();
  if (!note && baseLabel) {
    const m = baseLabel.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (m) { mainLabel = m[1].trim(); note = m[2].trim(); }
  }

  let quantity = base.quantity !== undefined && base.quantity !== null ? String(base.quantity).trim() : '';
  let unit = base.unit !== undefined && base.unit !== null ? String(base.unit).trim() : '';

  if (quantity && servingScale !== 1 && scaleQuantity) {
    const scaled = scaleQuantity(quantity, servingScale);
    if (scaled && !scaled.includes('NaN') && scaled.trim() !== '') quantity = scaled.trim();
  }

  if (quantity && unit) {
    const converted = convertUnits(quantity, unit, useMetric);
    quantity = converted.q;
    unit = converted.u;
  } else if (quantity) {
    quantity = formatQuantity(quantity);
  }

  const rowClass =
    'recipe-ingredient-row flex items-start gap-3 py-1 cursor-pointer select-none' +
    (checked ? ' recipe-ingredient-row--checked opacity-60 line-through' : '');

  return (
    <li className={rowClass} onClick={() => onToggle(id)}>
      <div className="w-6 flex justify-center flex-shrink-0 mt-1.5">
        <div className="recipe-ingredient-bullet" />
      </div>
      <div className="text-sm font-medium leading-relaxed flex flex-wrap items-baseline flex-1">
        {emoji && <span className="mr-1.5 text-base leading-none select-none">{emoji}</span>}
        {quantity && <span className="recipe-ingredient-qty mr-1">{quantity}</span>}
        {unit && <span className="recipe-ingredient-unit mr-1.5">{unit}</span>}
        {mainLabel && <span className="recipe-ingredient-text">{mainLabel}</span>}
        {note && <span className="recipe-ingredient-note ml-1">({note})</span>}
      </div>
    </li>
  );
};

// ============================================================
// COMPILATION VIEW
// ============================================================

const RecipeCompilationCard: React.FC<{ recipe: RecipeForCard }> = ({ recipe }) => {
  const ideas = recipe.ideas ?? [];
  if (!ideas.length) return null;
  return (
    <div className="mt-4 pt-4 border-t border-primary-100/50 space-y-2">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-base leading-none">🍽️</span>
        <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest">Dishes featured</h4>
      </div>
      {ideas.map((idea, i) => (
        <div key={i} className="bg-white border border-gray-100 rounded-xl p-3.5 flex items-start gap-3 shadow-sm">
          {idea.emoji && <span className="text-xl leading-none flex-shrink-0 mt-0.5">{idea.emoji}</span>}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-sm leading-snug">{idea.headline}</p>
            {idea.text && <p className="text-xs text-gray-500 leading-relaxed mt-0.5">{idea.text}</p>}
          </div>
        </div>
      ))}
    </div>
  );
};

// ============================================================
// MAIN COMPONENT
// ============================================================

export const RecipeDetailsCard: React.FC<RecipeDetailsCardProps> = ({
  recipe,
  recipeId = 'recipe',
  recipeName = 'Recipe',
  servingScale = 1,
  scaleQuantity,
  onServingScaleChange,
  useMetric = true,
  onToggleMetric,
  onAddToShoppingList,
}) => {
  const { t } = useTranslation(['videoDetail']);

  const [checkedIds, setCheckedIds] = React.useState<Set<string>>(() => new Set());
  const [checkedSteps, setCheckedSteps] = React.useState<Set<number>>(() => new Set());
  // "added" flips to true for 3s after tapping the button as lightweight feedback
  const [added, setAdded] = React.useState(false);

  const flat: RawIngredient[] = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const groups: IngredientGroup[] = Array.isArray(recipe.ingredients_groups) ? recipe.ingredients_groups : [];
  const hasGroups = groups.length > 0;
  const hasFlat = !hasGroups && flat.length > 0;

  const allIngredients = React.useMemo(() => {
    const list: { id: string; raw: RawIngredient }[] = [];
    if (hasGroups) {
      groups.forEach((group, groupIdx) => {
        (group.items ?? []).forEach((item, itemIdx) => {
          list.push({ id: `g${groupIdx}-i${itemIdx}`, raw: item });
        });
      });
    } else {
      flat.forEach((item, idx) => {
        list.push({ id: `f${idx}`, raw: item });
      });
    }
    return list;
  }, [flat, groups, hasGroups]);

  const handleAddToShoppingList = () => {
    if (!onAddToShoppingList || allIngredients.length === 0) return;

    const items: ShoppingListItem[] = allIngredients.map(({ id, raw }) => {
      let name = '';
      let quantity: string | undefined;
      let unit: string | undefined;
      let emoji: string | undefined;

      if (typeof raw === 'string') {
        const { body, emoji: e } = splitTrailingEmoji(raw);
        const parsed = parseIngredientString(body);
        name = parsed.item || body;
        quantity = parsed.quantity;
        unit = parsed.unit;
        emoji = e || undefined;
      } else {
        const base = raw as any;
        name = (base.item || base.name || '').trim();
        quantity = base.quantity !== undefined && base.quantity !== null
          ? String(base.quantity).trim()
          : undefined;
        unit = base.unit ? String(base.unit).trim() : undefined;
        emoji = base.emoji ? String(base.emoji) : undefined;

        // Apply current serving scale
        if (quantity && servingScale !== 1 && scaleQuantity) {
          const scaled = scaleQuantity(quantity, servingScale);
          if (scaled && !scaled.includes('NaN')) quantity = scaled.trim();
        }

        // Apply unit conversion matching what the card currently shows
        if (quantity && unit) {
          const converted = convertUnits(quantity, unit, useMetric);
          quantity = converted.q;
          unit = converted.u;
        } else if (quantity) {
          quantity = formatQuantity(quantity);
        }
      }

      return {
        id: `${recipeId}_${id}`,
        name,
        quantity: quantity || undefined,
        unit: unit || undefined,
        emoji: emoji || undefined,
        recipeTitle: recipeName,
        checked: false,
      };
    });

    onAddToShoppingList(items);
    setAdded(true);
    setTimeout(() => setAdded(false), 3000);
  };

  // Serving scale
  const baseServings = React.useMemo(() => {
    const raw = toStr(recipe.servings);
    const m = raw.match(/(\d+(\.\d+)?)/);
    if (!m) return 1;
    const n = parseFloat(m[1]);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }, [recipe.servings]);

  const currentScale = servingScale || 1;
  const currentServings = Math.max(1, Math.round(baseServings * currentScale));

  const handleServingsDelta = (delta: number) => {
    if (!onServingScaleChange) return;
    const nextServings = Math.max(1, currentServings + delta);
    onServingScaleChange(Number((nextServings / baseServings).toFixed(3)));
  };

  const handleToggle = (id: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleStepToggle = (index: number) => {
    setCheckedSteps(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };

  const instructions = Array.isArray(recipe.instructions) ? recipe.instructions : [];
  const tips = Array.isArray(recipe.tips) ? recipe.tips : [];
  const notes = Array.isArray(recipe.notes) ? recipe.notes : [];

  if (recipe.is_compilation) return <RecipeCompilationCard recipe={recipe} />;

  const prep = toStr(recipe.prep_time).trim() || '—';
  const cook = toStr(recipe.cook_time).trim() || '—';

  let globalIndex = 0;
  const totalGroupItems = groups.reduce((acc, g) => acc + (g.items?.length || 0), 0);
  const canSequentialMap = totalGroupItems === flat.length && flat.length > 0;

  return (
    <div className="bg-white border border-gray-100 rounded-[24px] shadow-sm overflow-hidden mt-4 mb-6">

      {/* Header */}
      <div className="bg-tertiary-50/50 p-4 md:p-5 border-b border-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ChefHat className="recipe-header-icon" size={20} />
          <h3 className="font-bold text-gray-900 text-lg">
            {t('videoDetail:recipeDetails')}
          </h3>
        </div>
        {onToggleMetric && (
          <button
            onClick={() => onToggleMetric(!useMetric)}
            className="px-3 py-1.5 bg-white/60 backdrop-blur-md border border-white/60 text-gray-700 rounded-xl text-xs font-bold shadow-sm hover:bg-white/90 hover:shadow transition-all"
          >
            {useMetric ? 'Imperial' : 'Metric'}
          </button>
        )}
      </div>

      {/* Prep / Cook / Servings */}
      <div className="grid grid-cols-3 divide-x divide-gray-50 border-b border-gray-50">
        <div className="p-4 flex flex-col items-center justify-center text-center gap-1">
          <Clock className="recipe-meta-icon mb-1" size={16} />
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            {t('videoDetail:prep')}
          </span>
          <span className="text-sm font-bold text-gray-900">{prep}</span>
        </div>
        <div className="p-4 flex flex-col items-center justify-center text-center gap-1">
          <Flame className="recipe-meta-icon mb-1" size={16} />
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            {t('videoDetail:cook')}
          </span>
          <span className="text-sm font-bold text-gray-900">{cook}</span>
        </div>
        <div className="p-4 flex flex-col items-center justify-center text-center gap-1">
          <Users className="recipe-meta-icon mb-1" size={16} />
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            {t('videoDetail:servings')}
          </span>
          <div className="flex flex-row items-center justify-center gap-2 mt-0.5 whitespace-nowrap w-full">
            <button
              type="button"
              onClick={() => handleServingsDelta(-1)}
              className="w-7 h-7 flex-shrink-0 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center text-sm font-bold hover:bg-gray-200 transition"
            >
              {'\u2212'}
            </button>
            <span className="text-sm font-extrabold text-gray-900 tabular-nums text-center min-w-[20px]">
              {currentServings}
            </span>
            <button
              type="button"
              onClick={() => handleServingsDelta(1)}
              className="w-7 h-7 flex-shrink-0 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center text-sm font-bold hover:bg-gray-200 transition"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Ingredients */}
      <div className="p-6 border-b border-gray-50">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">
            {t('videoDetail:ingredients')}
          </h4>

          {onAddToShoppingList && allIngredients.length > 0 && (
            <button
              type="button"
              onClick={handleAddToShoppingList}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95"
              style={{
                background: added ? 'rgba(21,128,61,0.08)' : 'rgba(124,58,237,0.08)',
                color: added ? '#15803d' : '#7c3aed',
                border: added
                  ? '1px solid rgba(21,128,61,0.2)'
                  : '1px solid rgba(124,58,237,0.2)',
              }}
            >
              {added ? (
                <>
                  <Check size={13} strokeWidth={2.5} />
                  Added
                </>
              ) : (
                <>
                  <ShoppingCart size={13} strokeWidth={2} />
                  Add to list
                </>
              )}
            </button>
          )}
        </div>

        <div className="space-y-6">
          {hasGroups && groups.map((group, groupIdx) => (
            <div key={groupIdx} className="relative">
              {groupIdx > 0 && (
                <div className="absolute -top-3 left-0 right-0 border-t border-dashed border-gray-100" />
              )}
              <h5 className="font-bold text-gray-900 text-sm mb-3 bg-gray-50 inline-block px-2 py-1 rounded-lg">
                {group.title || group.group}
              </h5>
              <ul className="space-y-1">
                {(group.items ?? []).map((it, itemIdx) => {
                  const id = `g${groupIdx}-i${itemIdx}`;
                  let enriched = it;
                  if (typeof it === 'string' && flat.length > 0) {
                    if (canSequentialMap) {
                      enriched = flat[globalIndex];
                    } else {
                      const found = flat.find((f: any) => {
                        if (typeof f === 'string') return false;
                        const n = String(f.item || f.name || '').toLowerCase();
                        return n.includes(it.toLowerCase()) || it.toLowerCase().includes(n);
                      });
                      if (found) enriched = found;
                    }
                  }
                  globalIndex++;
                  return (
                    <IngredientRow
                      key={id} id={id} raw={enriched} servingScale={currentScale}
                      scaleQuantity={scaleQuantity} checked={checkedIds.has(id)}
                      onToggle={handleToggle} useMetric={useMetric}
                    />
                  );
                })}
              </ul>
            </div>
          ))}
          {hasFlat && (
            <ul className="space-y-1">
              {flat.map((it, idx) => {
                const id = `f${idx}`;
                return (
                  <IngredientRow
                    key={id} id={id} raw={it} servingScale={currentScale}
                    scaleQuantity={scaleQuantity} checked={checkedIds.has(id)}
                    onToggle={handleToggle} useMetric={useMetric}
                  />
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Directions */}
      {instructions.length > 0 && (
        <div className="p-6 bg-gray-50/30">
          <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">
            {t('videoDetail:directions')}
          </h4>
          <div className="space-y-6">
            {instructions.map((step, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 cursor-pointer select-none transition-opacity ${checkedSteps.has(i) ? 'opacity-60' : ''}`}
                onClick={() => handleStepToggle(i)}
              >
                <div className="w-6 flex justify-center flex-shrink-0 pt-[0.1rem]">
                  <div className="recipe-step-number-circle">
                    <span className="recipe-step-number">{i + 1}</span>
                  </div>
                </div>
                <p className={`text-sm font-medium text-gray-600 leading-relaxed pt-[2px] ${checkedSteps.has(i) ? 'line-through' : ''}`}>
                  {step}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chef's Notes */}
      {(tips.length > 0 || notes.length > 0) && (
        <div className="bg-yellow-50/50 border-t border-yellow-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb size={18} className="text-yellow-600" />
            <h4 className="text-xs font-black text-yellow-700 uppercase tracking-widest">
              {t('videoDetail:chefsNotes')}
            </h4>
          </div>
          <div className="space-y-4">
            {tips.length > 0 && (
              <ul className="space-y-2">
                {tips.map((tip, i) => (
                  <li key={`tip-${i}`} className="flex items-start gap-3 text-sm text-gray-700">
                    <div className="w-6 flex justify-center flex-shrink-0 mt-0.5">
                      <span className="text-yellow-500 font-bold text-lg leading-none">•</span>
                    </div>
                    <span className="italic flex-1 pt-[1px]">{tip}</span>
                  </li>
                ))}
              </ul>
            )}
            {notes.length > 0 && (
              <div className="pt-2">
                {notes.map((note, i) => (
                  <p key={`note-${i}`} className="text-sm text-gray-500 leading-relaxed">
                    <span className="font-bold text-gray-600">{t('videoDetail:noteLabel')}</span>{' '}
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
