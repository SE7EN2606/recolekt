import React from 'react';

interface MobileRecipeTabBarProps<TTabKey extends string> {
  tabs: Array<{ key: TTabKey; label: string }>;
  activeTab: TTabKey;
  activeIndex: number;
  onTabChange: (tab: TTabKey) => void;
}

export function MobileRecipeTabBar<TTabKey extends string>({
  tabs,
  activeTab,
  activeIndex,
  onTabChange,
}: MobileRecipeTabBarProps<TTabKey>) {
  return (
    <div className="relative grid grid-cols-4 rounded-[18px] border border-slate-200/80 bg-white/85 p-1">
      <div
        className="pointer-events-none absolute bottom-1 left-1 top-1 rounded-[14px] bg-gradient-to-br from-primary-600 to-secondary-600 transition-transform duration-300 ease-out"
        style={{
          width: 'calc((100% - 0.5rem) / 4)',
          transform: `translateX(${activeIndex * 100}%)`,
        }}
      />
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onTabChange(tab.key)}
          className={`relative z-10 min-w-0 rounded-[14px] px-2 py-2.5 text-center text-sm font-semibold transition-colors ${
            activeTab === tab.key
              ? 'text-white'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export default MobileRecipeTabBar;
