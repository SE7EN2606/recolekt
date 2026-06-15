import assert from 'node:assert/strict';
import {
  buildViewModel,
  filterDisplayHeadlines,
  hasBilingualRecipeContent,
  hasUsableLocalizedRecipeBranch,
  mergeVideoPayload,
  recipeBranchesMeaningfullyDifferent,
  selectLocalizedRecipe,
} from '../src/pages/VideoDetailViewModel';
import { hasUsableRecipeContent } from '../src/features/recipe-core/recipePayload';

const testRecipe = {
  english: {
    title: 'Creamy baked fennel',
    ingredients: [{ item: 'fennel', quantity: '2' }],
    instructions: [{ instruction: 'Bake until golden.' }],
  },
  original: {
    title: 'Sformato di finocchi',
    ingredients: [{ item: 'finocchi', quantity: '2' }],
    instructions: [{ instruction: 'Cuocere fino a doratura.' }],
  },
};

const completedSummary = {
  english: {
    title: 'Creamy baked fennel',
    summary: 'A warm baked fennel dish with a creamy finish.',
    headlines: [{ headline: 'Golden fennel', description: 'The dish is baked until browned.' }],
  },
  original: {
    title: 'Sformato di finocchi cremoso',
    summary: 'Uno sformato caldo e cremoso di finocchi.',
    headlines: [{ headline: 'Finocchi dorati', description: 'Il piatto cuoce fino a doratura.' }],
  },
};

const fallbackSummary = {
  english: {
    title: 'Fallback title',
    summary: 'Fallback summary',
    headlines: [{ headline: 'Key detail', description: 'A concrete detail shown in the clip.' }],
  },
};

const completedVideo = mergeVideoPayload(
  {
    id: 'test-reel',
    process_id: 'test-reel',
    status: 'done',
    content_type: 'recipe',
    detected_language: 'it',
    summary: completedSummary,
    recipe: testRecipe,
    summary_title: 'Creamy baked fennel',
  },
  {
    status: 'done',
    summary: completedSummary,
    recipe: JSON.stringify(testRecipe),
  },
);

assert.equal(completedVideo.status, 'done', 'incoming done status should remain terminal');

const englishRecipe = selectLocalizedRecipe(testRecipe, false);
assert.equal(englishRecipe.title, 'Creamy baked fennel', 'English recipe is selected by default');
assert.deepEqual(englishRecipe.instructions, testRecipe.english.instructions);

const originalRecipe = selectLocalizedRecipe(testRecipe, true);
assert.equal(originalRecipe.title, 'Sformato di finocchi', 'Original recipe is selected when toggled');
assert.deepEqual(originalRecipe.ingredients, testRecipe.original.ingredients);

assert.equal(hasBilingualRecipeContent(testRecipe), true, 'bilingual recipe wrapper should be recognized');
assert.equal(hasUsableLocalizedRecipeBranch(testRecipe, 'english'), true);
assert.equal(hasUsableLocalizedRecipeBranch(testRecipe, 'original'), true);
assert.equal(hasUsableRecipeContent(testRecipe), true, 'recipe card should treat bilingual wrappers as usable');
assert.equal(recipeBranchesMeaningfullyDifferent(testRecipe), true, 'English and Italian branches should count as a real translation');

const englishViewModel = buildViewModel(completedVideo, false, undefined);
assert.equal(englishViewModel.title, 'Creamy baked fennel');
assert.equal(englishViewModel.recipe.title, 'Creamy baked fennel');
assert.equal(englishViewModel.contentType, 'recipe');

const originalViewModel = buildViewModel(completedVideo, true, undefined);
assert.equal(originalViewModel.title, 'Sformato di finocchi cremoso');
assert.equal(originalViewModel.recipe.title, 'Sformato di finocchi');

const duplicateItalianRecipe = {
  english: testRecipe.original,
  original: testRecipe.original,
};
const duplicateRecipeViewModel = buildViewModel({
  id: 'duplicate-recipe',
  status: 'done',
  content_type: 'recipe',
  detected_language: 'it',
  summary: completedSummary,
  recipe: duplicateItalianRecipe,
}, false, undefined);
assert.equal(recipeBranchesMeaningfullyDifferent(duplicateItalianRecipe), false, 'duplicate Italian branches should not count as a translation');
assert.equal(duplicateRecipeViewModel.hasTranslation, false, 'translation toggle should be hidden for duplicate branches');

const originalOnlyRecipe = {
  original: testRecipe.original,
};
const originalOnlyViewModel = buildViewModel({
  id: 'original-only-recipe',
  status: 'done',
  content_type: 'recipe',
  detected_language: 'it',
  summary: completedSummary,
  recipe: originalOnlyRecipe,
}, false, undefined);
assert.equal(originalOnlyViewModel.recipe.title, 'Sformato di finocchi', 'single-language original recipe should be shown');
assert.equal(originalOnlyViewModel.hasTranslation, false, 'translation toggle should be hidden when English is absent');

const fallbackVideo = mergeVideoPayload(
  {
    id: 'test-reel',
    status: 'processing',
    content_type: 'recipe',
    summary: fallbackSummary,
    recipe: {
      title: 'Fallback recipe',
      ingredients: [{ item: 'ingredient' }],
      instructions: [{ instruction: 'Fallback instruction.' }],
    },
  },
  null,
);

const replacedVideo = mergeVideoPayload(
  {
    ...fallbackVideo,
    status: 'done',
    summary: completedSummary,
    recipe: testRecipe,
  },
  {
    status: 'done',
    summary: completedSummary,
    recipe: JSON.stringify(testRecipe),
  },
);

const replacedViewModel = buildViewModel(replacedVideo, false, undefined);
assert.equal(replacedViewModel.recipe.title, 'Creamy baked fennel', 'completed recipe replaces fallback recipe');
assert.equal(replacedViewModel.bullets[0].headline, 'Golden fennel', 'completed headlines replace fallback placeholders');

assert.deepEqual(
  filterDisplayHeadlines([
    { headline: 'Key detail', description: 'A concrete detail shown in the clip.' },
    { headline: 'Useful detail', description: 'Keep this one.' },
  ]),
  [{ headline: 'Useful detail', description: 'Keep this one.' }],
  'generic placeholder headlines should be filtered',
);

const activeRefreshBefore = true;
const activeRefreshAfter = false;
const showBannerBefore =
  activeRefreshBefore || String(fallbackVideo.status).toLowerCase() === 'processing';
const showBannerAfter =
  activeRefreshAfter || String(replacedVideo.status).toLowerCase() === 'processing';
assert.equal(showBannerBefore, true, 'processing state should show refresh banner');
assert.equal(showBannerAfter, false, 'done state should hide refresh banner');

const shouldRenderRecipeExperience =
  replacedViewModel.contentType === 'recipe' && hasUsableRecipeContent(replacedViewModel.recipe);
assert.equal(shouldRenderRecipeExperience, true, 'recipe content should suppress the generic summary experience');

console.log('VideoDetail view-model tests passed');
