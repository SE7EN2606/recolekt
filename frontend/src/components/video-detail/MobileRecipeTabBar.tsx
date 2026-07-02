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
    <div className="relative grid grid-cols-4 rounded-2xl bg-gray-100 p-1">
      <div
        className="pointer-events-none absolute top-1 bottom-1 left-1 rounded-xl bg-gradient-to-br from-primary-600 to-secondary-600 transition-transform duration-300 ease-out"
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
          className={`relative z-10 py-2.5 text-sm font-bold transition-colors ${
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
