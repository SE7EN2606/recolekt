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
    <NutritionCard
      ingredients={ingredients}
      servings={servings}
      recipeName={recipeName}
    />
  );
};

export default RecipeNutritionSummary;
