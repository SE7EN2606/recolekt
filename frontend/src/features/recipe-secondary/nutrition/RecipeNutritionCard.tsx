import React from 'react';

type Props = {};

const RecipeNutritionCard: React.FC<Props> = () => {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Estimated</p>
          <h3 className="text-lg font-semibold text-gray-950">Nutrition values</h3>
          <p className="mt-2 text-sm leading-relaxed text-gray-500">
            Not enough quantity data to calculate reliable nutrition for this recipe.
          </p>
          <p className="mt-3 text-xs text-gray-400">
            Key ingredient quantities are missing. Add quantities to improve the estimate.
          </p>
        </div>
      </section>
  );
};

export default RecipeNutritionCard;
