import React from 'react';

type Props = {};

const RecipeNutritionCard: React.FC<Props> = () => {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="space-y-0.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Estimated</p>
        <h3 className="text-lg font-semibold text-gray-950">Nutrition</h3>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          Nutrition could not be estimated yet because usable quantities are missing or incomplete.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-gray-400">
          Recolekt needs enough measurable ingredient amounts to calculate a reliable estimate.
        </p>
      </div>
    </section>
  );
};

export default RecipeNutritionCard;
