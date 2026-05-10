import React from 'react';
import { ChefHat } from 'lucide-react';

type TimeCellType = {
  label: string;
  value: string | null;
  icon: React.ReactNode;
};

type RecipeTab = {
  key: string;
  label: string;
};

type Props = {
  isTechnique: boolean;
  title: string;
  useMetric: boolean;
  onToggleMetric?: (v: boolean) => void;
  timeCells: TimeCellType[];
  activeRecipeTab: string;
  setActiveRecipeTab: (v: any) => void;
  recipeTabs: RecipeTab[];
  children: React.ReactNode;
};

const RecipeHeaderShell: React.FC<Props> = ({
  isTechnique,
  title,
  useMetric,
  onToggleMetric,
  timeCells,
  activeRecipeTab,
  setActiveRecipeTab,
  recipeTabs,
  children,
}) => {
  return (
    <div className="bg-white border border-gray-100 rounded-[24px] shadow-sm overflow-hidden mt-4 mb-6">

      <div className="flex items-center justify-between px-5 py-4 border-b border-rose-100 bg-rose-50/70">
        <div className="flex items-center gap-2.5">
          <ChefHat size={18} className="text-rose-500" />

          <h3 className="font-bold text-gray-900 text-base tracking-tight">
            {isTechnique ? 'Cooking Technique' : title}
          </h3>
        </div>

        {onToggleMetric && (
          <button
            onClick={() => onToggleMetric(!useMetric)}
            className="px-3 py-1.5 bg-white/90 border border-rose-100 text-gray-700 rounded-xl text-[11px] font-bold shadow-sm hover:bg-white transition-colors"
          >
            {useMetric ? 'Imperial' : 'Metric'}
          </button>
        )}
      </div>

      {timeCells.length > 0 && (
        <div
          className="grid border-b border-gray-50"
          style={{ gridTemplateColumns: `repeat(${timeCells.length}, 1fr)` }}
        >
          {timeCells.map((cell, i) => (
            <div key={i} className={i > 0 ? 'border-l border-gray-50' : ''}>
              {cell.icon}
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-gray-100 bg-gray-50 px-3 py-3">
        <div
          className="grid gap-1 rounded-2xl bg-gray-100 p-1 text-[12px] font-black"
          style={{
            gridTemplateColumns: `repeat(${recipeTabs.length}, minmax(0, 1fr))`
          }}
        >
          {recipeTabs.map((tab) => {
            const active = activeRecipeTab === tab.key;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveRecipeTab(tab.key)}
                className={`rounded-xl px-2 py-2.5 transition-all ${
                  active
                    ? 'bg-white text-violet-600 shadow-sm'
                    : 'text-gray-500 hover:bg-white/50 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {children}
    </div>
  );
};

export default RecipeHeaderShell;
