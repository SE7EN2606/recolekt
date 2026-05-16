import React from 'react';

type Props = {
  children: React.ReactNode;
};

export const RecipeIngredients: React.FC<Props> = ({ children }) => {
  return (
    <div className="border-t border-gray-50 pt-5 pb-4">
      {children}
    </div>
  );
};
