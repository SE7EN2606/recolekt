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

      <section className="mb-5">
        <MobileRecipeTabBar
          tabs={tabs}
          activeTab={activeTab}
          activeIndex={activeIndex}
          onTabChange={onTabChange}
        />

        {showingOverview ? overviewContent : null}

        <div className={showingOverview ? 'hidden' : ''}>
          <RecipeDetailsCard {...recipeDetailsCardProps} />
        </div>
      </section>
    </>
  );
}

export default MobileRecipeDetailLayout;
