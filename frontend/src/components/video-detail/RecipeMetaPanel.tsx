import React from 'react';
import { RecipeMetaChip } from '../../features/recipe-detail/RecipeCookbookRail';

interface RecipeMetaPanelProps {
  chips: RecipeMetaChip[];
}

export function RecipeMetaPanel({ chips }: RecipeMetaPanelProps) {
  const readChip = (...labels: string[]) =>
    chips.find((chip) =>
      labels.includes(String(chip.label || '').trim().toLowerCase())
    )?.value || '';

  const cuisine = readChip('cuisine');
  const style = readChip('style');
  const method = readChip('method');

  const cuisineStyle = [cuisine, style].filter(Boolean).join(' · ');

  if (!cuisineStyle && !method) return null;

  return (
    <div className="flex gap-3">
      {cuisineStyle && (
        <div className="flex-1 bg-orange-50 border border-orange-100 rounded-xl p-4 flex flex-col items-center justify-center gap-1">
          <span className="text-[10px] font-semibold text-orange-700 text-center">
            Cuisine
          </span>
          <div className="text-sm font-bold text-orange-950 leading-snug text-center">
            {cuisineStyle}
          </div>
        </div>
      )}

      {method && (
        <div className="flex-1 bg-rose-50 border border-rose-100 rounded-xl p-4 flex flex-col items-center justify-center gap-1">
          <span className="text-[10px] font-semibold text-rose-700 text-center">
            Method
          </span>
          <div className="text-sm font-bold text-rose-950 leading-snug text-center">
            {method}
          </div>
        </div>
      )}
    </div>
  );
}

export default RecipeMetaPanel;
