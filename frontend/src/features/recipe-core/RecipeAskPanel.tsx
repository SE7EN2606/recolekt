import React from 'react';

type Props = {
  children: React.ReactNode;
};

export default function RecipeAskPanel({ children }: Props) {
  return (
    <div className="border-t border-gray-50 px-5 py-5">
      <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
        {children}
      </div>
    </div>
  );
}
