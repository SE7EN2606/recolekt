import React from 'react';

interface MobileRecipeOverviewTabProps {
  cookStatusCard: React.ReactNode;
  metaDetailsCard?: React.ReactNode;
  recipeMemoryCard: React.ReactNode;
  notesCard: React.ReactNode;
  sourceDetailsCard: React.ReactNode;
  originalLink?: React.ReactNode;
}

export const MobileRecipeOverviewTab: React.FC<MobileRecipeOverviewTabProps> = ({
  cookStatusCard,
  metaDetailsCard,
  recipeMemoryCard,
  notesCard,
  sourceDetailsCard,
  originalLink,
}) => {
  return (
    <div className="space-y-5">
      {cookStatusCard}
      {metaDetailsCard}
      {recipeMemoryCard}
      {notesCard}
      {sourceDetailsCard}
      {originalLink}
    </div>
  );
};

export default MobileRecipeOverviewTab;
