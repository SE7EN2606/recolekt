import React from 'react';
import RecipeDetailsCard, { type RecipeDetailsCardProps } from '../RecipeDetailsCard';
import RecipeAiSummaryCard from './RecipeAiSummaryCard';
import MobileRecipeTabBar from './MobileRecipeTabBar';

interface MobileRecipeDetailLayoutProps<TTabKey extends string> {
  showSummary: boolean;
  summaryText?: string;
  summaryHeadlines: any[];
  tabs: Array<{ key: TTabKey; label: string }>;
  activeTab: TTabKey;
  activeIndex: number;
  overviewTabKey: TTabKey;
  onTabChange: (tab: TTabKey) => void;
  overviewContent: React.ReactNode;
  recipeDetailsCardProps: RecipeDetailsCardProps;
}

export function MobileRecipeDetailLayout<TTabKey extends string>({
  showSummary,
  summaryText,
  summaryHeadlines,
  tabs,
  activeTab,
  activeIndex,
  overviewTabKey,
  onTabChange,
  overviewContent,
  recipeDetailsCardProps,
}: MobileRecipeDetailLayoutProps<TTabKey>) {
  const showingOverview = activeTab === overviewTabKey;

  return (
    <>
      {showSummary && (
        <RecipeAiSummaryCard
          summaryText={summaryText}
          headlines={summaryHeadlines}
          collapsedByDefault={false}
        />
      )}

      <section className="mb-5 overflow-hidden rounded-[22px] border border-white/75 bg-white/90 shadow-[0_4px_18px_rgba(15,23,42,0.06)] supports-[backdrop-filter]:bg-white/70">
        <div className="pt-4">
          <MobileRecipeTabBar
            tabs={tabs}
            activeTab={activeTab}
            activeIndex={activeIndex}
            onTabChange={onTabChange}
          />
        </div>

        {showingOverview ? (
          <div className="py-4">
            {overviewContent}
          </div>
        ) : null}

        <div className={showingOverview ? 'hidden' : ''}>
          <RecipeDetailsCard {...recipeDetailsCardProps} />
        </div>
      </section>
    </>
  );
}

export default MobileRecipeDetailLayout;
