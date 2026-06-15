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
import { refreshFailureMessage } from '../src/context/DataContext';
import {
  buildTerminalProcessingVideo,
  isFacebookAccessError,
} from '../src/pages/videoDetailTerminalState';
import { hasUsableRecipeContent } from '../src/features/recipe-core/recipePayload';
import { getMediaErrorPresentation } from '../src/utils/mediaErrorPresentation';

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

const terminalFacebookError = buildTerminalProcessingVideo({
  detail: {
    id: 'test-reel',
    status: 'error',
    error_message: 'facebook_extraction_failed',
  },
  merged: {
    title: 'Old useful title',
    summary: completedSummary,
    recipe: testRecipe,
  },
  stable: {
    title: 'Stable useful title',
    thumbnailUrl: 'old-thumb.webp',
  },
  fallbackId: 'test-reel',
});
assert.equal(terminalFacebookError.status, 'error', 'terminal error should replace processing status');
assert.equal(terminalFacebookError.error_message, 'facebook_extraction_failed');
assert.equal(terminalFacebookError.thumbnailUrl, 'old-thumb.webp', 'terminal error should preserve stable content where available');
assert.equal(isFacebookAccessError(terminalFacebookError), true, 'facebook terminal errors should trigger the full-page access message');
assert.equal(
  isFacebookAccessError({
    status: 'error',
    error_message: 'facebook_extraction_failed',
  }),
  true,
  'explicit facebook_extraction_failed should qualify without a URL',
);
assert.equal(
  isFacebookAccessError({
    status: 'error',
    error_message: 'download failed',
    source_url: 'https://www.facebook.com/reel/123',
  }),
  true,
  'Facebook URLs plus generic download failures should qualify',
);
assert.equal(
  isFacebookAccessError({
    status: 'error',
    error_message: 'download failed',
    source_url: 'https://www.instagram.com/reel/abc',
  }),
  false,
  'Instagram download failures should not trigger the Facebook access message',
);
assert.equal(
  isFacebookAccessError({
    status: 'error',
    error_message: 'login required',
    sourceUrl: 'https://www.tiktok.com/@chef/video/123',
  }),
  false,
  'TikTok login-required failures should not trigger the Facebook access message',
);

assert.equal(
  refreshFailureMessage(new TypeError('Failed to fetch')),
  'Could not reach Recolekt to refresh this video. Please check your connection and try again.',
  'network/preflight failures should not expose raw Failed to fetch',
);

const facebookExtractionPresentation = getMediaErrorPresentation({
  status: 'error',
  platform: 'facebook',
  source_url: 'https://www.facebook.com/reel/123',
  error_message: 'facebook_extraction_failed',
});
assert.equal(
  facebookExtractionPresentation.kind,
  'facebook_unavailable',
  'Facebook facebook_extraction_failed rows should use the unavailable presentation',
);
assert.equal(
  facebookExtractionPresentation.canRetry,
  false,
  'Facebook unavailable rows should not offer retry',
);
assert.equal(
  facebookExtractionPresentation.canOpenSource,
  true,
  'Facebook unavailable rows with a source URL should offer Open Facebook',
);
assert.equal(
  facebookExtractionPresentation.sourceUrl,
  'https://www.facebook.com/reel/123',
);

const facebookMediaUnavailablePresentation = getMediaErrorPresentation({
  status: 'failed',
  originalUrl: 'https://fb.watch/example',
  errorMessage: 'facebook_media_unavailable',
});
assert.equal(
  facebookMediaUnavailablePresentation.kind,
  'facebook_unavailable',
  'Facebook facebook_media_unavailable rows should use the unavailable presentation',
);

const instagramDownloadPresentation = getMediaErrorPresentation({
  status: 'error',
  sourceUrl: 'https://www.instagram.com/reel/abc',
  error_message: 'download failed',
});
assert.equal(
  instagramDownloadPresentation.kind,
  'technical_failure',
  'Instagram download failures should remain generic technical failures',
);

const tiktokLoginPresentation = getMediaErrorPresentation({
  category: 'Failed',
  source_url: 'https://www.tiktok.com/@chef/video/123',
  errorMessage: 'login required',
});
assert.equal(
  tiktokLoginPresentation.kind,
  'technical_failure',
  'TikTok login failures should remain generic technical failures',
);

for (const presentation of [
  facebookExtractionPresentation,
  facebookMediaUnavailablePresentation,
  instagramDownloadPresentation,
  tiktokLoginPresentation,
]) {
  assert.notEqual(
    presentation.titleKey,
    'facebook_extraction_failed',
    'raw backend error codes should not be returned as visible titles',
  );
  assert.notEqual(
    presentation.messageKey,
    'facebook_extraction_failed',
    'raw backend error codes should not be returned as visible messages',
  );
  assert.notEqual(
    presentation.titleKey,
    'facebook_media_unavailable',
    'raw backend error codes should not be returned as visible titles',
  );
  assert.notEqual(
    presentation.messageKey,
    'facebook_media_unavailable',
    'raw backend error codes should not be returned as visible messages',
  );
}

console.log('VideoDetail view-model tests passed');
