import React from 'react';

type Props = {};

const RecipeNutritionCard: React.FC<Props> = () => {
  return (
    <section className="rounded-[26px] border border-white/75 bg-white/90 p-5 shadow-[0_4px_18px_rgba(15,23,42,0.06)] backdrop-blur-sm sm:p-6">
      <div className="flex items-end justify-between gap-3">
        <h3 className="text-[20px] font-extrabold tracking-tight text-slate-950">Nutrition</h3>
        <span className="text-[12px] font-medium text-slate-400">per serving</span>
      </div>
      <div className="mt-5 space-y-0.5">
        <p className="text-sm leading-relaxed text-gray-500">
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
