import React from 'react';
import { Plus, Minus } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const formatTime = (time: string): string => {
  if (!time) return '';

  return time
    .replace(/\s*hours?\s*/gi, 'h ')
    .replace(/\s*heures?\s*/gi, 'h ')
    .replace(/\s*minutes?\s*/gi, 'min')
    .replace(/\s*min\s*/gi, 'min')
    .trim();
};

const safeStr = (v: any): string => {
  if (typeof v === 'string') return v;
  if (v == null) return '';
  return String(v);
};

const lowerFirst = (s: string) => {
  const t = (s || '').trim();
  if (!t) return '';
  return t.charAt(0).toLowerCase() + t.slice(1);
};

const extractOptionalText = (s: string): { main: string; optional: string } => {
  const t = (s || '').trim();
  if (!t) return { main: '', optional: '' };
  
  const parenMatch = t.match(/^(.*?)\s*(\([^)]*\))\s*$/);
  if (parenMatch) {
    return { 
      main: parenMatch[1].trim(), 
      optional: parenMatch[2].trim() 
    };
  }
  
  return { main: t, optional: '' };
};

const splitParen = (s: string): { main: string; paren: string } => {
  const t = (s || '').trim();
  if (!t) return { main: '', paren: '' };
  const m = t.match(/^(.*?)(\s*\(.*\)\s*)$/);
  if (!m) return { main: t, paren: '' };
  return { main: (m[1] || '').trim(), paren: (m[2] || '').trim() };
};

const tokenizeQty = (qty: string): Array<{ type: 'num' | 'unit'; text: string }> => {
  const q = (qty || '').trim();
  if (!q) return [];

  const parts = q.split(/\s+/).filter(Boolean);

  const isNumericLike = (tok: string) => {
    return (
      /^[0-9]+([.,][0-9]+)?$/.test(tok) ||
      /^[0-9]+\/[0-9]+$/.test(tok) ||
      /^[0-9]+(\-|–)[0-9]+$/.test(tok) ||
      /[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/.test(tok)
    );
  };

  return parts.map((p) => ({
    type: isNumericLike(p) ? 'num' : 'unit',
    text: p,
  }));
};

interface RecipeMetaProps {
  recipe: any;
  servingScale: number;
  setServingScale: (scale: number) => void;
  mobile?: boolean;
  showOriginal?: boolean;
}

export const RecipeMeta: React.FC<RecipeMetaProps> = ({
  recipe,
  servingScale,
  setServingScale,
  mobile = false,
  showOriginal = false
}) => {
  const { t } = useLanguage();

  // ✅ Handle new bilingual structure
  const selectedRecipe = recipe?.english || recipe?.original || recipe || t(recipe);

  console.log('🔍 RecipeMeta selectedRecipe:', selectedRecipe);

  if (!selectedRecipe) return null;

  const prepTime = selectedRecipe.prep_time || selectedRecipe.prepTime || '25 min';
  const cookTime = selectedRecipe.cook_time || selectedRecipe.cookTime || '2h';
  const servingsRaw = selectedRecipe.servings || selectedRecipe.yield || '12';
  
  const numericServings = parseInt(String(servingsRaw).match(/\d+/)?.[0] || '12', 10);
  const scaledServings = Math.round(numericServings * servingScale);

  return (
    <div className={`bg-white border border-gray-200 rounded-xl ${mobile ? 'p-3' : 'p-6'}`}>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className={`font-bold text-gray-900 ${mobile ? 'text-base' : 'text-2xl'}`}>
            {formatTime(prepTime)}
          </p>
          <p className={`text-gray-600 mt-1 ${mobile ? 'text-xs' : 'text-sm'}`}>Prep</p>
        </div>

        <div>
          <p className={`font-bold text-gray-900 ${mobile ? 'text-base' : 'text-2xl'}`}>
            {formatTime(cookTime)}
          </p>
          <p className={`text-gray-600 mt-1 ${mobile ? 'text-xs' : 'text-sm'}`}>Cook</p>
        </div>

        <div>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setServingScale(Math.max(0.5, servingScale - 0.5))}
              className={`bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition ${
                mobile ? 'w-5 h-5' : 'w-7 h-7'
              }`}
              disabled={servingScale <= 0.5}
            >
              <Minus size={mobile ? 10 : 14} />
            </button>

            <p className={`font-bold text-gray-900 text-center ${mobile ? 'text-base min-w-[28px]' : 'text-2xl min-w-[40px]'}`}>
              {scaledServings}
            </p>

            <button
              onClick={() => setServingScale(servingScale + 0.5)}
              className={`bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition ${
                mobile ? 'w-5 h-5' : 'w-7 h-7'
              }`}
            >
              <Plus size={mobile ? 10 : 14} />
            </button>
          </div>

          <p className={`text-gray-600 mt-1 ${mobile ? 'text-xs' : 'text-sm'}`}>Servings</p>
        </div>
      </div>
    </div>
  );
};

interface IngredientsProps {
  recipe: any;
  servingScale: number;
  useMetric: boolean;
  setUseMetric: (value: boolean) => void;
  scaleQuantity: (qty: string, scale: number) => string;
  convertToMetric: (qty: string) => string;
  convertToImperial?: (qty: string) => string;
  parseQuantity: (qty: string) => { val: string; unit: string };
  mobile?: boolean;
  showOriginal?: boolean;
}

type NormalizedIngredientItem = {
  emoji: string;
  quantity: string;
  item: string;
  notes: string;
  optional: string;
};

type NormalizedIngredientGroup = {
  groupName: string;
  items: NormalizedIngredientItem[];
};

export const Ingredients: React.FC<IngredientsProps> = ({
  recipe,
  servingScale,
  useMetric,
  setUseMetric,
  scaleQuantity,
  convertToMetric,
  convertToImperial,
  parseQuantity,
  mobile = false,
  showOriginal = false,
}) => {
  const { t } = useLanguage();

  // ✅ Handle new bilingual structure
  const selectedRecipe = recipe?.english || recipe?.original || recipe || t(recipe);

  console.log('🔍 Ingredients selectedRecipe:', selectedRecipe);
  console.log('🔍 Ingredients selectedRecipe.ingredients:', selectedRecipe?.ingredients);

  const normalizeIngredientItem = (ing: any): NormalizedIngredientItem => {
    if (typeof ing === 'string') {
      const text = ing.trim();
      const { main, optional } = extractOptionalText(text);
      return { emoji: '🔸', quantity: '', item: main, notes: '', optional };
    }

    if (ing && typeof ing === 'object') {
      const emoji = safeStr(ing.emoji).trim() || '🔸';
      const quantity = safeStr(ing.quantity).trim();
      const unit = safeStr(ing.unit).trim();
      const itemRaw = safeStr(ing.item).trim() || safeStr(ing.name).trim();
      const notesRaw = safeStr(ing.notes).trim();
      
      const isShortUnit = unit.length <= 2 || ['cup', 'cups', 'tsp', 'tbsp', 'oz', 'lb', 'lbs'].includes(unit.toLowerCase());
      const fullQuantity = (unit && !isShortUnit) ? `${quantity} ${unit}` : quantity;
      
      const { main: itemMain, optional: itemOptional } = extractOptionalText(itemRaw);
      const { main: notesMain, optional: notesOptional } = extractOptionalText(notesRaw);
      
      const allOptional = [itemOptional, notesOptional].filter(Boolean).join(' ');
      
      return { 
        emoji, 
        quantity: fullQuantity, 
        item: itemMain, 
        notes: notesMain,
        optional: allOptional
      };
    }

    return { emoji: '🔸', quantity: '', item: '', notes: '', optional: '' };
  };

  const rawIngredients = Array.isArray(selectedRecipe?.ingredients) ? selectedRecipe.ingredients : [];

  const looksGrouped =
    rawIngredients.length > 0 &&
    typeof rawIngredients[0] === 'object' &&
    rawIngredients[0] !== null &&
    Array.isArray((rawIngredients[0] as any).items);

  let groups: NormalizedIngredientGroup[] = [];

  if (looksGrouped) {
    groups = rawIngredients
      .map((g: any) => {
        const groupName = safeStr(g?.name).trim();
        const itemsRaw = Array.isArray(g?.items) ? g.items : [];
        const items = itemsRaw
          .map(normalizeIngredientItem)
          .filter((it) => (it.item || it.quantity || it.notes || it.optional).trim().length > 0);

        return { groupName, items };
      })
      .filter((g) => (g.groupName || g.items.length > 0));
  } else {
    const items = rawIngredients
      .map(normalizeIngredientItem)
      .filter((it) => (it.item || it.quantity || it.notes || it.optional).trim().length > 0);

    groups = items.length ? [{ groupName: '', items }] : [];
  }

  const totalItemsCount = groups.reduce((acc, g) => acc + g.items.length, 0);
  if (totalItemsCount === 0) return null;

  const rowTextSize = mobile ? 'text-xs' : 'text-base';

  return (
    <div className={`bg-white border border-gray-200 rounded-xl ${mobile ? 'p-3' : 'p-6'}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className={`font-bold text-gray-900 ${mobile ? 'text-sm' : 'text-xl'}`}>Ingredients</h2>

        <button
          onClick={() => setUseMetric(!useMetric)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition border ${
            useMetric 
              ? 'bg-primary-100 text-primary-700 border-primary-300' 
              : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
          }`}
        >
          <span className={mobile ? 'text-xs font-medium' : 'text-sm font-medium'}>
            {useMetric ? 'Metric' : 'Imperial'}
          </span>
        </button>
      </div>

      <div className={mobile ? 'space-y-5' : 'space-y-6'}>
        {groups.map((group, gIdx) => (
          <div key={gIdx}>
            {group.groupName && (
              <div className={mobile ? 'mb-3' : 'mb-4'}>
                <div className={`font-bold text-gray-900 ${mobile ? 'text-sm' : 'text-lg'} leading-tight`}>
                  {group.groupName}
                </div>
                <div className="h-px bg-gray-100 mt-2" />
              </div>
            )}

            <ul className={mobile ? 'space-y-2' : 'space-y-3'}>
              {group.items.map((ing, idx) => {
                let displayQty = ing.quantity;

                if (displayQty && servingScale !== 1) {
                  displayQty = scaleQuantity(displayQty, servingScale);
                }

                if (displayQty) {
                  if (useMetric) {
                    displayQty = convertToMetric(displayQty);
                  } else if (convertToImperial) {
                    displayQty = convertToImperial(displayQty);
                  }
                }

                const qtyTokens = tokenizeQty(displayQty || '');
                const { main: itemMainRaw, paren } = splitParen(ing.item || '');
                const itemMain = lowerFirst(itemMainRaw);

                return (
                  <li key={idx} className={`flex items-baseline ${mobile ? 'gap-2' : 'gap-3'} flex-wrap`}>
                    <span className={`${mobile ? 'text-base' : 'text-lg'} leading-none`}>
                      {ing.emoji || '🔸'}
                    </span>

                    {qtyTokens.length > 0 && (
                      <span className={`${rowTextSize} whitespace-nowrap`}>
                        {qtyTokens.map((tok, i) => (
                          <span
                            key={i}
                            className={
                              tok.type === 'num'
                                ? 'text-purple-600 font-extrabold'
                                : 'text-gray-900 font-extrabold'
                            }
                          >
                            {i === 0 ? tok.text : ` ${tok.text}`}
                          </span>
                        ))}
                      </span>
                    )}

                    {itemMain && (
                      <span className={`${rowTextSize} text-gray-900 font-normal`}>
                        {itemMain}
                      </span>
                    )}

                    {paren && (
                      <span className={`${rowTextSize} text-gray-400 italic font-normal`}>
                        {paren}
                      </span>
                    )}

                    {ing.notes && (
                      <span className={`${rowTextSize} text-gray-400 italic font-normal`}>
                        {ing.notes}
                      </span>
                    )}

                    {ing.optional && (
                      <span className={`${rowTextSize} text-gray-400 italic font-normal`}>
                        {ing.optional}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
};

interface StepsProps {
  recipe: any;
  mobile?: boolean;
  showOriginal?: boolean;
}

export const Steps: React.FC<StepsProps> = ({
  recipe,
  mobile = false,
  showOriginal = false
}) => {
  const { t } = useLanguage();

  // ✅ Handle new bilingual structure
  const selectedRecipe = recipe?.english || recipe?.original || recipe || t(recipe);

  console.log('🔍 Steps selectedRecipe:', selectedRecipe);

  const steps = Array.isArray(selectedRecipe?.steps)
    ? selectedRecipe.steps
    : Array.isArray(selectedRecipe?.instructions)
      ? selectedRecipe.instructions
      : [];

  if (!steps.length) return null;

  return (
    <div className={`bg-white border border-gray-200 rounded-xl ${mobile ? 'p-3' : 'p-6'}`}>
      <h2 className={`font-bold text-gray-900 mb-4 ${mobile ? 'text-sm' : 'text-xl'}`}>Directions</h2>
      <ol className={mobile ? 'space-y-2' : 'space-y-4'}>
        {steps.map((step: string, idx: number) => {
          const stepText = typeof step === 'string' ? step : String(step ?? '');
          if (!stepText.trim()) return null;

          return (
            <li key={idx} className={`flex items-start ${mobile ? 'gap-2' : 'gap-4'}`}>
              <span
                className={`flex-shrink-0 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold ${
                  mobile ? 'w-5 h-5 text-xs' : 'w-7 h-7 text-xs mt-1'
                }`}
              >
                {idx + 1}
              </span>
              <p className={`text-gray-700 leading-relaxed flex-1 ${mobile ? 'text-xs' : 'text-base'}`}>
                {stepText}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
