import {
  detectRecipeTechniques,
  getRecipeCuisineLabel,
  getRecipePayload,
  getRecipeTimeBucket,
  getRecipeTitle,
  getRecipeUserState,
  parseObject,
  RECIPE_TIME_BUCKETS,
} from './cookbookIntelligence';

export type CookbookSearchResult = {
  video: any;
  score: number;
  labels: string[];
};

const STOP_WORDS = new Set(['a', 'an', 'and', 'for', 'i', 'me', 'my', 'of', 'recipe', 'recipes', 'the', 'to', 'with']);

function collectStrings(value: unknown, depth = 0): string {
  if (depth > 5 || value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(item => collectStrings(item, depth + 1)).join(' ');
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).map(item => collectStrings(item, depth + 1)).join(' ');
  return '';
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizePlatform(video: any): string {
  const raw = normalizeText(video?.platform ?? video?.sourcePlatform ?? video?.source_platform ?? video?.raw?.platform);
  if (raw.includes('tiktok') || raw === 'tt') return 'tiktok';
  if (raw.includes('instagram') || raw === 'ig') return 'instagram';
  if (raw.includes('youtube') || raw.includes('youtu be') || raw === 'yt') return 'youtube';
  if (raw.includes('facebook') || raw === 'fb') return 'facebook';
  return raw;
}

function getTopicText(video: any): string {
  const recipe = getRecipePayload(video);
  const summary = parseObject(video?.summary ?? video?.summarytext ?? video?.raw?.summary);
  return [
    video?.category,
    video?.summary_category,
    video?.summaryCategory,
    video?.summary_topic,
    video?.summaryTopic,
    video?.topic,
    summary?.category,
    summary?.topic,
    summary?.theme,
    recipe?.category,
    recipe?.recipe_category,
    recipe?.topic,
    recipe?.style,
    recipe?.recipe_style,
  ].filter(Boolean).join(' ');
}

function getIngredientText(video: any): string {
  const recipe = getRecipePayload(video);
  return collectStrings(recipe?.ingredients ?? recipe?.ingredientLines ?? recipe?.ingredient_lines);
}

function bucketAliases(video: any): string[] {
  const bucket = getRecipeTimeBucket(video);
  if (bucket === RECIPE_TIME_BUCKETS.QUICK_MEAL) return ['quick', 'quick meal', 'fast', 'under 30', 'tonight'];
  if (bucket === RECIPE_TIME_BUCKETS.WEEKNIGHT) return ['weeknight', 'weeknight meal', 'dinner'];
  if (bucket === RECIPE_TIME_BUCKETS.SLOW_MEAL) return ['slow', 'slow meal', 'weekend'];
  if (bucket === RECIPE_TIME_BUCKETS.PROJECT_MEAL) return ['project', 'project meal', 'weekend project', 'weekend'];
  return [];
}

function tokenMatchesText(token: string, text: string): boolean {
  if (!token || !text) return false;
  return text.includes(token) || token.split(' ').some(part => part.length > 2 && text.includes(part));
}

function addLabel(labels: string[], label: string): void {
  if (!labels.includes(label) && labels.length < 4) labels.push(label);
}

export function tokenizeCookbookQuery(query: string): string[] {
  const normalized = normalizeText(query);
  if (!normalized) return [];

  const tokens = normalized
    .split(' ')
    .filter(token => token.length > 1 && !STOP_WORDS.has(token));

  const phrases: string[] = [];
  if (/\b(with notes?|notes?)\b/.test(normalized)) phrases.push('has_notes');
  if (/\b(cooked|made|things i cooked|cook(ed)? before)\b/.test(normalized)) phrases.push('cooked_before');
  if (/\b(quick|fast|under 30|tonight)\b/.test(normalized)) phrases.push('quick_meal');
  if (/\b(weeknight|weekday)\b/.test(normalized)) phrases.push('weeknight');
  if (/\b(project|weekend)\b/.test(normalized)) phrases.push('project_meal');
  if (/\bair fryer|airfryer\b/.test(normalized)) phrases.push('air fryer');
  if (/\bno cook|no-cook|raw\b/.test(normalized)) phrases.push('no-cook');
  if (/\bone pot|one-pot\b/.test(normalized)) phrases.push('one-pot');

  return Array.from(new Set([...tokens, ...phrases]));
}

export function scoreRecipeMatch(video: any, tokens: string[]): CookbookSearchResult {
  if (tokens.length === 0) return { video, score: 1, labels: [] };

  const state = getRecipeUserState(video);
  const platform = normalizePlatform(video);
  const title = normalizeText(getRecipeTitle(video));
  const cuisine = normalizeText(getRecipeCuisineLabel(video));
  const techniques = detectRecipeTechniques(video);
  const techniqueText = normalizeText(techniques.join(' '));
  const topic = normalizeText(getTopicText(video));
  const ingredients = normalizeText(getIngredientText(video));
  const bucketText = normalizeText(bucketAliases(video).join(' '));
  const labels: string[] = [];

  let score = 0;

  for (const token of tokens) {
    if (token === 'has_notes') {
      if (state.hasNote) {
        score += 34;
        addLabel(labels, 'Has notes');
      }
      continue;
    }
    if (token === 'cooked_before') {
      if (state.cookCount > 0) {
        score += 34;
        addLabel(labels, 'Cooked before');
      }
      continue;
    }
    if (token === 'quick_meal' || token === 'weeknight' || token === 'project_meal') {
      if (bucketText.includes(token.replace('_', ' ')) || bucketText.includes(token.split('_')[0])) {
        score += 30;
        addLabel(labels, token === 'quick_meal' ? 'Quick meal' : token === 'weeknight' ? 'Weeknight' : 'Project meal');
      }
      continue;
    }

    if (tokenMatchesText(token, title)) score += 34;
    if (tokenMatchesText(token, cuisine)) {
      score += 26;
      addLabel(labels, getRecipeCuisineLabel(video) || token);
    }
    if (tokenMatchesText(token, techniqueText)) {
      score += 24;
      const matchedTechnique = techniques.find(technique => normalizeText(technique).includes(token) || token.includes(normalizeText(technique)));
      addLabel(labels, matchedTechnique ? matchedTechnique.replace(/\b\w/g, char => char.toUpperCase()) : token);
    }
    if (tokenMatchesText(token, topic)) score += 20;
    if (tokenMatchesText(token, ingredients)) score += 14;
    if (tokenMatchesText(token, platform)) {
      score += 24;
      addLabel(labels, `${platform.charAt(0).toUpperCase()}${platform.slice(1)} save`);
    }
    if (tokenMatchesText(token, bucketText)) {
      score += 18;
      if (bucketText.includes('quick')) addLabel(labels, 'Quick meal');
      if (bucketText.includes('weeknight')) addLabel(labels, 'Weeknight');
      if (bucketText.includes('project')) addLabel(labels, 'Project meal');
    }
  }

  if (state.hasNote && tokens.some(token => token.includes('note'))) addLabel(labels, 'Has notes');
  if (state.cookCount > 0 && tokens.some(token => token.includes('cook') || token.includes('made'))) addLabel(labels, 'Cooked before');

  return { video, score, labels };
}

export function searchCookbookRecipes(videos: any[], query: string): CookbookSearchResult[] {
  const tokens = tokenizeCookbookQuery(query);
  if (tokens.length === 0) {
    return videos.map(video => ({ video, score: 1, labels: [] }));
  }

  return videos
    .map(video => scoreRecipeMatch(video, tokens))
    .filter(result => result.score > 0)
    .sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;
      const aSaved = new Date(a.video?.savedAt ?? a.video?.saved_at ?? a.video?.createdAt ?? a.video?.created_at ?? 0).getTime();
      const bSaved = new Date(b.video?.savedAt ?? b.video?.saved_at ?? b.video?.createdAt ?? b.video?.created_at ?? 0).getTime();
      return bSaved - aSaved;
    });
}
