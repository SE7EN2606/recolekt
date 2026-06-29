import React from 'react';
import NutritionCard from '../../components/NutritionCard';

type Props = {
  ingredients: any[];
  servings?: number;
  recipeName?: string;
  embedded?: boolean;
};

const RecipeNutritionSummary: React.FC<Props> = ({
  ingredients,
  servings,
  recipeName,
  embedded = false,
}) => {
  return (
    <NutritionCard
      ingredients={ingredients}
      servings={servings}
      recipeName={recipeName}
      embedded={embedded}
    />
  );
};

export default RecipeNutritionSummary;
