# Recolekt Frontend Rules

## Stack assumptions

This is the Recolekt frontend. It is a mobile-first recipe/cookbook interface.

Always inspect package.json before assuming scripts.

## Core frontend priority

The UI must feel like a personal cookbook, not an AI analysis dashboard.

Visible by default:
- hero media
- title
- save/collection state
- large Cook CTA
- ingredients
- steps
- personal notes
- return-to-recipe status

Collapsed or secondary:
- caption
- transcript
- hashtags
- AI assumptions
- confidence details
- advanced nutrition details
- extraction diagnostics

## Important files

Frequently relevant files include:

- src/pages/VideoDetail.tsx
- src/components/RecipeDetailsCard.tsx
- src/components/CookModeModal.tsx
- src/features/recipe-core/types.ts
- src/features/recipe-core/panels/RecipeIngredientsPanel.tsx
- src/features/recipe-core/panels/RecipeStepsPanel.tsx
- src/features/recipe-core/panels/RecipeAskPanel.tsx
- src/features/recipe-core/rows/IngredientRow.tsx
- src/features/recipe-core/rows/StepRow.tsx
- src/features/recipe-core/cards/RecipeCompilationCard.tsx
- src/features/recipe-layout/RecipeHeaderShell.tsx
- src/features/recipe-layout/RecipeMainView.tsx
- src/features/recipe-secondary/RecipeNutritionSummary.tsx
- src/features/recipe-assistant/useRecipeAssistant.ts

## Current known UX issues

The Cook CTA regressed from a prominent full-width button to a tiny header pill.
The recipe page is too dense.
The Ask tab should not dominate the default recipe experience.
Transcript, hashtags, and metadata should not compete with ingredients/steps.
Fix double padding/wrapper issues when found.

## RecipeDetailsCard call pattern

The expected call from VideoDetail.tsx is:

```tsx
{showRecipeCard && stableRecipeForCard && (
  <div className="mb-5">
    <RecipeDetailsCard
      recipe={stableRecipeForCard}
      recipeId={currentVideoId}
      recipeName={viewModel.title ?? "Recipe"}
      servingScale={servingScale}
      scaleQuantity={scaleQuantity}
      useMetric={useMetric}
      onToggleMetric={setUseMetric}
    />
  </div>
)}