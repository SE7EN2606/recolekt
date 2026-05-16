import React from 'react';

type Props = {
  recipe: any;
};

const RecipeCompilationCard: React.FC<Props> = ({ recipe }) => {
  const ideas = recipe.ideas ?? [];

  if (!ideas.length) return null;

  return (
    <div className="mt-4 space-y-2">
      {ideas.map((idea: any, i: number) => (
        <div
          key={i}
          className="bg-white border border-gray-100 rounded-xl p-3.5 flex items-start gap-3 shadow-sm"
        >
          {idea.emoji && (
            <span className="text-xl leading-none flex-shrink-0 mt-0.5">
              {idea.emoji}
            </span>
          )}

          <div>
            <p className="font-bold text-gray-900 text-sm leading-snug">
              {idea.headline}
            </p>

            {idea.text && (
              <p className="text-xs text-gray-500 leading-relaxed mt-0.5">
                {idea.text}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default RecipeCompilationCard;
