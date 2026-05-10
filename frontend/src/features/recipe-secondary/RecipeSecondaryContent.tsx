import React from 'react';

type Props = {
  children: React.ReactNode;
};

export default function RecipeSecondaryContent({ children }: Props) {
  return (
    <div className="border-t border-gray-100 bg-gray-50/30">
      {children}
    </div>
  );
}
