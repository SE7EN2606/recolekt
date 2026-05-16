import React from 'react';

type Props = {
  children: React.ReactNode;
};

const RecipeDirections: React.FC<Props> = ({ children }) => {
  return (
    <div className="border-t border-gray-50 px-5 py-5">
      {children}
    </div>
  );
};

export default RecipeDirections;
