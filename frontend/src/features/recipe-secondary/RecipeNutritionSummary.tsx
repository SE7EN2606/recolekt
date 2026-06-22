import React from 'react';
import NutritionCard from '../../components/NutritionCard';

type Props = {
  ingredients: any[];
  servings?: number;
  recipeName?: string;
};

const RecipeNutritionSummary: React.FC<Props> = ({
  ingredients,
  servings,
  recipeName,
}) => {
  return (
    <div className="border-t border-gray-50 px-2 py-2 sm:px-3">
      <NutritionCard
        ingredients={ingredients}
        servings={servings}
        recipeName={recipeName}
      />
    </div>
  );
};

export default RecipeNutritionSummary;
