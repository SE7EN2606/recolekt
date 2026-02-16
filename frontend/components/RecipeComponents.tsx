import React from 'react';

interface RecipeMetaProps {
  recipe: any;
  servingScale: number;
  setServingScale: (v: number) => void;
  showOriginal: boolean;
}

interface IngredientsProps {
  recipe: any;
  servingScale: number;
  useMetric: boolean;
  setUseMetric: (v: boolean) => void;
  scaleQuantity: (qty: string, scale: number) => string;
  convertToMetric: (qty: string) => string;
  convertToImperial: (qty: string) => string;
  parseQuantity: (qty: string) => { val: string; unit: string };
  showOriginal: boolean;
  caption?: string;
  mobile?: boolean;
}

interface StepsProps {
  recipe: any;
  showOriginal: boolean;
  mobile?: boolean;
}

/**
 * Simple recipe meta panel: title + notes/tips counts + serving scale.
 */
export const RecipeMeta: React.FC<RecipeMetaProps> = ({
  recipe,
  servingScale,
  setServingScale,
}) => {
  const title = recipe?.title || '';
  const notes = Array.isArray(recipe?.notes) ? recipe.notes : [];
  const tips = Array.isArray(recipe?.tips) ? recipe.tips : [];

  console.log('🔍 RecipeMeta selectedRecipe:', recipe);

  const decrease = () => setServingScale(Math.max(0.25, servingScale - 0.25));
  const increase = () => setServingScale(Math.min(8, servingScale + 0.25));

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
      {title && (
        <h2 className="text-lg font-bold text-gray-900">
          {title}
        </h2>
      )}

      <div className="flex items-center gap-4 text-xs text-gray-600">
        <span>
          📝 Notes: <strong>{notes.length}</strong>
        </span>
        <span>
          💡 Tips: <strong>{tips.length}</strong>
        </span>
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Servings
        </span>
        <div className="inline-flex items-center gap-2">
          <button
            type="button"
            onClick={decrease}
            className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-300 text-gray-700 hover:bg-gray-100 text-sm"
          >
            −
          </button>
          <span className="min-w-[3rem] text-center text-sm font-medium text-gray-900">
            ×{servingScale.toFixed(2).replace(/\.00$/, '')}
          </span>
          <button
            type="button"
            onClick={increase}
            className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-300 text-gray-700 hover:bg-gray-100 text-sm"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Build ingredient sections from caption lines as a *fallback* when
 * the backend did not provide structured groups.
 */
const buildSectionsFromCaption = (
  caption: string | undefined,
): { title: string; lines: string[] }[] => {
  if (!caption) return [];

  const rawLines = caption
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const sections: { title: string; lines: string[] }[] = [];

  const isSectionHeader = (line: string) => {
    if (!/:$/.test(line)) return false;

    const clean = line.replace(/:\s*$/, '').trim();
    if (!clean) return false;

    const lower = clean.toLowerCase();

    // Skip generic "Ingrédients :" / "Ingredients :" headings
    if (
      lower.startsWith('ingrédient') ||
      lower.startsWith('ingrédients') ||
      lower.startsWith('ingredient') ||
      lower.startsWith('ingredients')
    ) {
      return false;
    }

    // Require at least two words so we don't pick up stray short labels.
    if (clean.split(/\s+/).length < 2) return false;

    return true;
  };

  const isIngredientLine = (line: string) =>
    /\d/.test(line) ||
    /(?:^|\s)(g|kg|mg|ml|cl|l)\b/i.test(line) ||
    /cuillère|cas\b|càs\b|tsp\b|tbsp\b|cup\b/i.test(line);

  let current: { title: string; lines: string[] } | null = null;

  for (const line of rawLines) {
    if (isSectionHeader(line)) {
      if (current && current.lines.length) {
        sections.push(current);
      }
      current = {
        title: line.replace(/:\s*$/, ''),
        lines: [],
      };
      continue;
    }

    if (current && isIngredientLine(line)) {
      current.lines.push(line);
      continue;
    }
  }

  if (current && current.lines.length) {
    sections.push(current);
  }

  return sections;
};

/**
 * Ingredients with:
 *  - FIRST priority: recipe.ingredients_groups from backend (authoritative).
 *  - SECOND priority: groups derived from caption (fallback for old data).
 */
export const Ingredients: React.FC<IngredientsProps> = ({
  recipe,
  servingScale,
  useMetric,
  setUseMetric,
  scaleQuantity,
  // convertToMetric,
  // convertToImperial,
  // parseQuantity,
  showOriginal,
  caption,
}) => {
  const ingredients: any[] = Array.isArray(recipe?.ingredients)
    ? recipe.ingredients
    : [];

  const captionLines = (caption || '')
    .split(/\r?\n/)
    .slice(0, 6)
    .map((l) => l.trim());

  const rawGroups = Array.isArray((recipe as any)?.ingredients_groups)
    ? (recipe as any).ingredients_groups
    : [];

  console.log('🔍 ING selectedRecipe:', recipe);
  console.log('🔍 ING.ingredients length:', ingredients.length);
  console.log('🔍 ING.ingredients_groups:', rawGroups);
  console.log('🔍 ING.caption (first lines):', captionLines);

  const sectionsFromCaption = React.useMemo(
    () => buildSectionsFromCaption(caption),
    [caption],
  );

  /**
   * Map backend-provided groups (if any) to {title, items[]} shape.
   * Supports:
   *  - { title, items: [ingredient, ...] }
   *  - { title, indices: [0,1,...] } referencing the flat ingredients array.
   */
  const mappedFromBackend = React.useMemo(() => {
    if (!rawGroups.length) return [] as { title: string; items: any[] }[];
    if (!ingredients.length) {
      // If backend sends full items inside groups, we can still use them.
      return rawGroups.map((g: any) => ({
        title: g.title || 'Ingredients',
        items: Array.isArray(g.items) ? g.items : [],
      }));
    }

    const groups: { title: string; items: any[] }[] = [];

    for (const g of rawGroups) {
      const title = g.title || 'Ingredients';

      if (Array.isArray(g.items) && g.items.length) {
        groups.push({ title, items: g.items });
      } else if (Array.isArray(g.indices) && g.indices.length) {
        const items = g.indices
          .map((i: number) =>
            i >= 0 && i < ingredients.length ? ingredients[i] : null,
          )
          .filter(Boolean);
        groups.push({ title, items });
      }
    }

    return groups;
  }, [rawGroups, ingredients]);

  /**
   * If backend groups exist, trust them. Otherwise, fall back to
   * coarse caption-based grouping for old data.
   */
  const mappedGroups = React.useMemo(() => {
    if (mappedFromBackend.length) {
      const countBackend = mappedFromBackend.reduce(
        (sum, g) => sum + g.items.length,
        0,
      );
      console.log('ℹ️ ING: using BACKEND groups', {
        groupTitles: mappedFromBackend.map((g) => g.title),
        groupSizes: mappedFromBackend.map((g) => g.items.length),
        ingredientCount: ingredients.length,
      });
      return mappedFromBackend;
    }

    if (!sectionsFromCaption.length || !ingredients.length) {
      console.log('ℹ️ ING: no groups; using flat list', {
        ingredientCount: ingredients.length,
      });
      return [] as { title: string; items: any[] }[];
    }

    let idx = 0;
    const groups: { title: string; items: any[] }[] = [];

    for (const sec of sectionsFromCaption) {
      const count = Math.min(
        sec.lines.length || 0,
        ingredients.length - idx,
      );
      if (count <= 0) continue;
      const items = ingredients.slice(idx, idx + count);
      idx += count;
      groups.push({ title: sec.title, items });
    }

    // Leftovers go to last group to avoid dropping anything
    if (idx < ingredients.length) {
      if (groups.length) {
        groups[groups.length - 1].items = [
          ...groups[groups.length - 1].items,
          ...ingredients.slice(idx),
        ];
      } else {
        groups.push({
          title: 'Ingredients',
          items: ingredients.slice(idx),
        });
      }
    }

    console.log('ℹ️ ING: built groups from CAPTION', {
      sectionTitles: sectionsFromCaption.map((s) => s.title),
      groupSizes: groups.map((g) => g.items.length),
      ingredientCount: ingredients.length,
    });

    return groups;
  }, [mappedFromBackend, sectionsFromCaption, ingredients]);

  const hasGroups = mappedGroups.length > 0;
  const groupedCount = hasGroups
    ? mappedGroups.reduce((sum, g) => sum + g.items.length, 0)
    : 0;

  const formatQuantity = (ing: any) => {
    const qty = String(ing.quantity ?? '').trim();
    const unit = String(ing.unit ?? '').trim();

    if (!qty && !unit) return { main: '', rest: '' };

    const base = unit ? `${qty} ${unit}` : qty;
    const scaled = servingScale !== 1 ? scaleQuantity(base, servingScale) : base;

    const parts = scaled.split(/\s+/);
    const main = parts[0] || '';
    const rest = parts.slice(1).join(' ');

    return { main, rest };
  };

  const renderIngredient = (ing: any, key: React.Key) => {
    const emoji = ing.emoji || '';
    const name =
      ing.item || ing.name || ing.description || 'Ingredient';
    const { main, rest } = formatQuantity(ing);

    return (
      <li
        key={key}
        className="flex items-baseline gap-3 flex-wrap"
      >
        {emoji && (
          <span className="text-lg leading-none select-none">
            {emoji}
          </span>
        )}

        {(main || rest) && (
          <span className="text-base whitespace-nowrap">
            {main && (
              <span className="text-purple-600 font-extrabold">
                {main}
              </span>
            )}
            {rest && (
              <span className="text-gray-900 font-extrabold">
                {' '}
                {rest}
              </span>
            )}
          </span>
        )}

        <span className="text-base text-gray-900 font-normal">
          {name}
        </span>
      </li>
    );
  };

  console.log('ℹ️ ING DEBUG STATE', {
    flatCount: ingredients.length,
    groupedCount,
    showOriginal,
    backendGroups: mappedFromBackend.length,
  });

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-bold text-gray-900 text-xl">
            Ingredients
          </h2>
          <div className="mt-1 text-[10px] text-gray-500 bg-gray-50 px-2 py-1 rounded">
            ING DEBUG · flat={ingredients.length} · groups=
            {groupedCount} · showOriginal={String(showOriginal)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setUseMetric(!useMetric)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition border ${
            useMetric
              ? 'bg-primary-100 text-primary-700 border-primary-300'
              : 'bg-white text-gray-700 border-gray-300'
          }`}
        >
          <span className="text-sm font-medium">
            {useMetric ? 'Metric' : 'Imperial'}
          </span>
        </button>
      </div>

      <div className="space-y-6">
        {hasGroups ? (
          mappedGroups.map((group, idx) => (
            <div key={idx}>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                {group.title}
              </h3>
              <ul className="space-y-3">
                {group.items.map((ing, i) =>
                  renderIngredient(ing, `${idx}-${i}`),
                )}
              </ul>
            </div>
          ))
        ) : (
          <div>
            <ul className="space-y-3">
              {ingredients.map((ing, idx) =>
                renderIngredient(ing, idx),
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Simple ordered list of instructions.
 */
export const Steps: React.FC<StepsProps> = ({
  recipe,
}) => {
  const instructions: string[] = Array.isArray(
    recipe?.instructions,
  )
    ? recipe.instructions
    : [];

  console.log('🔍 Steps selectedRecipe:', recipe);

  if (!instructions.length) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <h2 className="text-bold text-gray-900 text-xl mb-4">
        Steps
      </h2>
      <ol className="space-y-3 list-decimal list-inside text-gray-800 text-sm">
        {instructions.map((step, index) => (
          <li key={index} className="leading-relaxed">
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
};
